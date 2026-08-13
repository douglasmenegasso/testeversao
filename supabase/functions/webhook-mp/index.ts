import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { escapeError, getAdminClient } from '../_shared/security.ts';

function response(status = 200, body: Record<string, unknown> = { received: true }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function sha256Hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseSignature(header: string): { ts: string; v1: string } | null {
  const values = Object.fromEntries(header.split(',').map((part) => {
    const [key, value] = part.trim().split('=');
    return [key, value];
  }));
  return values.ts && values.v1 ? { ts: values.ts, v1: values.v1 } : null;
}

function sameValue(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}

function asMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

serve(async (request) => {
  if (request.method !== 'POST') return response(405, { error: 'Método não permitido' });

  try {
    const payload = await request.json().catch(() => ({}));
    const dataId = String(new URL(request.url).searchParams.get('data.id') ?? payload?.data?.id ?? '');
    const requestId = request.headers.get('x-request-id') ?? '';
    const rawSignature = request.headers.get('x-signature') ?? '';
    const secret = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET') ?? '';
    const signature = parseSignature(rawSignature);

    if (!dataId || !requestId || !secret || !signature) {
      return response(401, { error: 'Assinatura de webhook ausente ou inválida' });
    }

    // Formato de manifesto definido pelo Mercado Pago para x-signature.
    const manifest = `id:${dataId};request-id:${requestId};ts:${signature.ts};`;
    const expected = await sha256Hmac(secret, manifest);
    if (!sameValue(expected, signature.v1)) {
      return response(401, { error: 'Assinatura de webhook inválida' });
    }

    const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!accessToken) throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado');

    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const mpPayment = await mpResponse.json();
    if (!mpResponse.ok) throw new Error(`Consulta Mercado Pago falhou: HTTP ${mpResponse.status}`);

    const internalPaymentId = String(mpPayment.external_reference ?? '');
    if (!internalPaymentId) return response(200, { ignored: true, reason: 'Referência interna ausente' });

    const admin = getAdminClient();
    const { data: pagamento, error: pagamentoError } = await admin
      .from('pagamentos')
      .select('id, user_id, plano_id, valor, status, metadata')
      .eq('id', internalPaymentId)
      .maybeSingle();
    if (pagamentoError) throw pagamentoError;
    if (!pagamento) return response(200, { ignored: true, reason: 'Pagamento não localizado' });

    const valorConfirmado = Number(mpPayment.transaction_amount ?? 0);
    if (mpPayment.currency_id !== 'BRL' || Math.abs(valorConfirmado - Number(pagamento.valor)) > 0.001) {
      console.error('[webhook-mp] Valor ou moeda incompatível', { internalPaymentId, valorConfirmado });
      return response(409, { error: 'Valor ou moeda incompatível' });
    }

    const metadata = asMetadata(pagamento.metadata);
    const statusMp = String(mpPayment.status ?? '');
    const novoMetadata = { ...metadata, mp_payment_id: String(mpPayment.id), mp_status: statusMp };

    if (statusMp !== 'approved') {
      const status = ['rejected', 'cancelled', 'refunded', 'charged_back'].includes(statusMp) ? 'recusado' : 'pendente';
      await admin.from('pagamentos').update({ status, metadata: novoMetadata }).eq('id', pagamento.id);
      return response(200, { received: true, status });
    }

    if (pagamento.status === 'aprovado') return response(200, { received: true, idempotent: true });

    const tipo = String(metadata.tipo ?? 'novo');
    const planoTipo = String(metadata.plano_tipo ?? 'mensal');
    const dispositivos = Number(metadata.num_dispositivos ?? 1);
    if (!Number.isInteger(dispositivos) || dispositivos < 1 || dispositivos > 5) {
      return response(422, { error: 'Metadados de dispositivos inválidos' });
    }

    const agora = new Date();
    const dias = planoTipo === 'anual' ? 365 : 30;
    const dataFim = new Date(agora.getTime() + dias * 86_400_000).toISOString();

    if (tipo === 'novo') {
      const { data: existente, error: existenteError } = await admin
        .from('assinaturas')
        .select('id')
        .eq('user_id', pagamento.user_id)
        .eq('status', 'ativa')
        .maybeSingle();
      if (existenteError) throw existenteError;

      if (!existente) {
        const key = `PRO-${crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`;
        const { error: criarAssinaturaError } = await admin.from('assinaturas').insert({
          user_id: pagamento.user_id,
          plano_id: pagamento.plano_id,
          status: 'ativa',
          dispositivos_max: dispositivos,
          dispositivos_usados: 0,
          data_inicio: agora.toISOString(),
          data_fim: dataFim,
          key_ativacao: key,
        });
        if (criarAssinaturaError) throw criarAssinaturaError;
      }
    } else {
      const assinaturaId = String(metadata.assinatura_id ?? '');
      const { data: assinatura, error: assinaturaError } = await admin
        .from('assinaturas')
        .select('id, user_id, dispositivos_usados')
        .eq('id', assinaturaId)
        .eq('user_id', pagamento.user_id)
        .maybeSingle();
      if (assinaturaError) throw assinaturaError;
      if (!assinatura) return response(404, { error: 'Assinatura referenciada não encontrada' });

      if (tipo === 'upgrade') {
        const { error: upgradeError } = await admin
          .from('assinaturas')
          .update({ dispositivos_max: dispositivos, updated_at: agora.toISOString() })
          .eq('id', assinatura.id)
          .eq('user_id', pagamento.user_id);
        if (upgradeError) throw upgradeError;
      } else if (tipo === 'renovacao') {
        const { error: renovarError } = await admin
          .from('assinaturas')
          .update({ data_fim: dataFim, dispositivos_max: dispositivos, updated_at: agora.toISOString() })
          .eq('id', assinatura.id)
          .eq('user_id', pagamento.user_id);
        if (renovarError) throw renovarError;
        // Créditos de downgrade permanecem registrados até que a regra de
        // abatimento parcial seja processada integralmente no servidor.
        // Nunca baixá-los apenas porque o navegador exibiu um desconto.
      }
    }

    const { error: aprovarError } = await admin
      .from('pagamentos')
      .update({ status: 'aprovado', data_pagamento: agora.toISOString(), metadata: novoMetadata })
      .eq('id', pagamento.id)
      .neq('status', 'aprovado');
    if (aprovarError) throw aprovarError;

    return response(200, { received: true, approved: true });
  } catch (error) {
    console.error('[webhook-mp]', escapeError(error));
    return response(500, { error: 'Erro ao processar notificação' });
  }
});
