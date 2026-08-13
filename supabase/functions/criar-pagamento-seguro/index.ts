import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import {
  PLANOS,
  type PlanoTipo,
  calcularValorPlano,
  escapeError,
  getAdminClient,
  getAuthenticatedUser,
  handleCors,
  isPlanoTipo,
  json,
  validarDispositivos,
} from '../_shared/security.ts';

type TipoPagamento = 'novo' | 'upgrade' | 'renovacao';

function tipoValido(value: unknown): value is TipoPagamento {
  return value === 'novo' || value === 'upgrade' || value === 'renovacao';
}

serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  try {
    const autenticacao = await getAuthenticatedUser(request);
    if (!autenticacao.user) return json({ error: autenticacao.error }, 401);

    const body = await request.json();
    const planoTipo = body.plano_tipo;
    const dispositivos = validarDispositivos(body.num_dispositivos);
    const tipo = body.tipo ?? 'novo';
    const metodo = body.metodo_pagamento === 'cartao' ? 'cartao' : 'pix';

    if (!isPlanoTipo(planoTipo) || !dispositivos || !tipoValido(tipo)) {
      return json({ error: 'Dados de pagamento inválidos' }, 422);
    }

    const admin = getAdminClient();
    const userId = autenticacao.user.id;
    const { data: assinaturaAtiva, error: assinaturaError } = await admin
      .from('assinaturas')
      .select('id, plano_id, dispositivos_max, data_fim')
      .eq('user_id', userId)
      .eq('status', 'ativa')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (assinaturaError) throw assinaturaError;

    if (tipo === 'novo' && assinaturaAtiva) {
      return json({ error: 'Já existe uma assinatura ativa para esta conta' }, 409);
    }

    if ((tipo === 'upgrade' || tipo === 'renovacao') && !assinaturaAtiva) {
      return json({ error: 'Assinatura ativa não encontrada' }, 404);
    }

    if (tipo === 'upgrade' && dispositivos <= Number(assinaturaAtiva.dispositivos_max)) {
      return json({ error: 'O upgrade deve aumentar a quantidade de dispositivos' }, 422);
    }

    let planoTipoSeguro = planoTipo;
    let plano: { id: string; tipo: PlanoTipo } | null = null;

    if (tipo === 'novo') {
      const { data, error } = await admin
        .from('planos')
        .select('id, tipo')
        .eq('tipo', planoTipo)
        .limit(1)
        .maybeSingle();
      if (error || !data || !isPlanoTipo(data.tipo)) {
        return json({ error: 'Plano não configurado no servidor' }, 503);
      }
      plano = data as { id: string; tipo: PlanoTipo };
    } else {
      const { data, error } = await admin
        .from('planos')
        .select('id, tipo')
        .eq('id', assinaturaAtiva.plano_id)
        .maybeSingle();
      if (error || !data || !isPlanoTipo(data.tipo)) {
        return json({ error: 'Plano da assinatura não configurado no servidor' }, 503);
      }
      plano = data as { id: string; tipo: PlanoTipo };
      planoTipoSeguro = plano.tipo;
    }

    let valor = calcularValorPlano(planoTipoSeguro, dispositivos);
    if (tipo === 'upgrade') {
      valor = Number(((dispositivos - Number(assinaturaAtiva.dispositivos_max)) * PLANOS[planoTipoSeguro].extra).toFixed(2));
    }

    const metadata = {
      tipo,
      plano_tipo: planoTipoSeguro,
      num_dispositivos: dispositivos,
      assinatura_id: assinaturaAtiva?.id ?? null,
    };

    const { data: pagamento, error: pagamentoError } = await admin
      .from('pagamentos')
      .insert({
        user_id: userId,
        plano_id: plano.id,
        valor,
        metodo_pagamento: metodo,
        status: 'pendente',
        metadata,
      })
      .select('id')
      .single();

    if (pagamentoError || !pagamento) throw pagamentoError ?? new Error('Pagamento não criado');

    const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!accessToken) {
      await admin.from('pagamentos').delete().eq('id', pagamento.id).eq('user_id', userId);
      return json({ error: 'Pagamento indisponível: segredo do Mercado Pago não configurado' }, 503);
    }

    const siteUrl = Deno.env.get('KAYLA_SITE_URL') ?? 'https://kayla.app.br';
    const notificationUrl = Deno.env.get('MERCADOPAGO_WEBHOOK_URL') ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/webhook-mp`;
    const preference = {
      items: [{
        title: `Kayla PRO - ${PLANOS[planoTipoSeguro].nome}`,
        quantity: 1,
        unit_price: valor,
        currency_id: 'BRL',
      }],
      payer: { email: autenticacao.user.email ?? '' },
      external_reference: pagamento.id,
      notification_url: notificationUrl,
      back_urls: {
        success: `${siteUrl}/app/pagamento-sucesso.html`,
        failure: `${siteUrl}/app/pagamento-falha.html`,
        pending: `${siteUrl}/app/pagamento-pendente.html`,
      },
      auto_return: 'approved',
      metadata,
      payment_methods: metodo === 'pix'
        ? { excluded_payment_types: [{ id: 'credit_card' }, { id: 'debit_card' }, { id: 'ticket' }] }
        : { excluded_payment_types: [{ id: 'ticket' }] },
    };

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preference),
    });
    const mpData = await mpResponse.json();

    if (!mpResponse.ok || !mpData?.id || !mpData?.init_point) {
      console.error('[criar-pagamento-seguro] Mercado Pago recusou preferência', mpResponse.status);
      return json({ error: 'Não foi possível iniciar o checkout' }, 502);
    }

    await admin
      .from('pagamentos')
      .update({ metadata: { ...metadata, preference_id: mpData.id } })
      .eq('id', pagamento.id);

    return json({
      payment_id: pagamento.id,
      preference_id: mpData.id,
      init_point: mpData.init_point,
      sandbox_init_point: mpData.sandbox_init_point ?? null,
    }, 201);
  } catch (error) {
    console.error('[criar-pagamento-seguro]', escapeError(error));
    return json({ error: 'Erro interno ao iniciar pagamento' }, 500);
  }
});
