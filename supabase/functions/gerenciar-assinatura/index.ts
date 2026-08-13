import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { escapeError, getAdminClient, getAuthenticatedUser, handleCors, json, validarDispositivos } from '../_shared/security.ts';

function calcularCredito(dataFim: string, removidos: number): number {
  const diasRestantes = Math.max(0, Math.ceil((new Date(dataFim).getTime() - Date.now()) / 86_400_000));
  return Number(((removidos * 5 * diasRestantes) / 30).toFixed(2));
}

serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  try {
    const autenticacao = await getAuthenticatedUser(request);
    if (!autenticacao.user) return json({ error: autenticacao.error }, 401);

    const body = await request.json();
    const action = body.action;
    const admin = getAdminClient();
    const userId = autenticacao.user.id;

    const { data: assinatura, error: assinaturaError } = await admin
      .from('assinaturas')
      .select('id, dispositivos_max, dispositivos_usados, data_fim')
      .eq('user_id', userId)
      .eq('status', 'ativa')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (assinaturaError) throw assinaturaError;
    if (!assinatura) return json({ error: 'Assinatura ativa não encontrada' }, 404);

    if (action === 'remover_dispositivo') {
      const deviceId = String(body.device_id ?? '');
      if (!deviceId) return json({ error: 'Dispositivo inválido' }, 422);

      const { data: dispositivo, error: dispositivoError } = await admin
        .from('dispositivos')
        .select('id')
        .eq('id', deviceId)
        .eq('assinatura_id', assinatura.id)
        .eq('user_id', userId)
        .eq('ativo', true)
        .maybeSingle();

      if (dispositivoError) throw dispositivoError;
      if (!dispositivo) return json({ error: 'Dispositivo ativo não encontrado' }, 404);

      const { error: desativarError } = await admin
        .from('dispositivos')
        .update({ ativo: false, ultimo_acesso: new Date().toISOString() })
        .eq('id', dispositivo.id)
        .eq('assinatura_id', assinatura.id)
        .eq('user_id', userId);
      if (desativarError) throw desativarError;

      const { count, error: countError } = await admin
        .from('dispositivos')
        .select('id', { count: 'exact', head: true })
        .eq('assinatura_id', assinatura.id)
        .eq('ativo', true);
      if (countError) throw countError;

      const usados = count ?? 0;
      const { error: updateError } = await admin
        .from('assinaturas')
        .update({ dispositivos_usados: usados, updated_at: new Date().toISOString() })
        .eq('id', assinatura.id)
        .eq('user_id', userId);
      if (updateError) throw updateError;

      return json({ success: true, dispositivos_usados: usados, dispositivos_max: assinatura.dispositivos_max });
    }

    if (action === 'reduzir_dispositivos') {
      const novosDispositivos = validarDispositivos(body.num_dispositivos);
      if (!novosDispositivos || novosDispositivos >= Number(assinatura.dispositivos_max)) {
        return json({ error: 'A nova quantidade deve ser menor que a atual' }, 422);
      }

      const { count, error: countError } = await admin
        .from('dispositivos')
        .select('id', { count: 'exact', head: true })
        .eq('assinatura_id', assinatura.id)
        .eq('ativo', true);
      if (countError) throw countError;

      const ativos = count ?? 0;
      if (ativos > novosDispositivos) {
        return json({ error: 'Remova dispositivos ativos antes de reduzir o limite', ativos }, 409);
      }

      const removidos = Number(assinatura.dispositivos_max) - novosDispositivos;
      const credito = calcularCredito(String(assinatura.data_fim), removidos);
      const { error: updateError } = await admin
        .from('assinaturas')
        .update({ dispositivos_max: novosDispositivos, dispositivos_usados: ativos, updated_at: new Date().toISOString() })
        .eq('id', assinatura.id)
        .eq('user_id', userId);
      if (updateError) throw updateError;

      if (credito > 0) {
        const { error: creditoError } = await admin
          .from('creditos')
          .insert({
            user_id: userId,
            assinatura_id: assinatura.id,
            valor: credito,
            tipo: 'cancelamento_dispositivos',
            data_criacao: new Date().toISOString(),
            utilizado: false,
          });
        if (creditoError) throw creditoError;
      }

      return json({ success: true, dispositivos_usados: ativos, dispositivos_max: novosDispositivos, credito });
    }

    if (action === 'registrar_dispositivo') {
      const deviceId = String(body.device_id ?? '').trim();
      const deviceName = String(body.device_name ?? 'Dispositivo desconhecido').trim().slice(0, 120);
      const deviceType = String(body.device_type ?? 'web').trim().slice(0, 40);
      const userAgent = request.headers.get('user-agent')?.slice(0, 500) ?? '';
      if (!deviceId || deviceId.length > 160) return json({ error: 'Identificador de dispositivo inválido' }, 422);

      const { data: existente, error: existenteError } = await admin
        .from('dispositivos')
        .select('id, ativo')
        .eq('assinatura_id', assinatura.id)
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .maybeSingle();
      if (existenteError) throw existenteError;

      const { count, error: countError } = await admin
        .from('dispositivos')
        .select('id', { count: 'exact', head: true })
        .eq('assinatura_id', assinatura.id)
        .eq('ativo', true);
      if (countError) throw countError;
      const ativos = count ?? 0;

      if (existente?.ativo) {
        await admin.from('dispositivos').update({ ultimo_acesso: new Date().toISOString(), device_name: deviceName }).eq('id', existente.id);
        return json({ success: true, ativo: true, dispositivos_usados: ativos, dispositivos_max: assinatura.dispositivos_max });
      }

      if (ativos >= Number(assinatura.dispositivos_max)) {
        return json({ success: false, ativo: false, bloqueado: true, dispositivos_usados: ativos, dispositivos_max: assinatura.dispositivos_max }, 409);
      }

      if (existente) {
        const { error } = await admin.from('dispositivos')
          .update({ ativo: true, ultimo_acesso: new Date().toISOString(), device_name: deviceName, device_type: deviceType, user_agent: userAgent })
          .eq('id', existente.id)
          .eq('assinatura_id', assinatura.id)
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await admin.from('dispositivos').insert({
          assinatura_id: assinatura.id, user_id: userId, device_id: deviceId,
          device_name: deviceName, device_type: deviceType, user_agent: userAgent,
          primeiro_acesso: new Date().toISOString(), ultimo_acesso: new Date().toISOString(), ativo: true,
        });
        if (error) throw error;
      }

      const usados = ativos + 1;
      const { error: updateError } = await admin.from('assinaturas')
        .update({ dispositivos_usados: usados, updated_at: new Date().toISOString() })
        .eq('id', assinatura.id)
        .eq('user_id', userId);
      if (updateError) throw updateError;
      return json({ success: true, ativo: true, dispositivos_usados: usados, dispositivos_max: assinatura.dispositivos_max });
    }

    if (action === 'cancelar_assinatura') {
      const agora = new Date().toISOString();
      const { error: cancelError } = await admin.from('assinaturas')
        .update({ status: 'cancelada', updated_at: agora })
        .eq('id', assinatura.id)
        .eq('user_id', userId);
      if (cancelError) throw cancelError;
      const { error: devicesError } = await admin.from('dispositivos')
        .update({ ativo: false, ultimo_acesso: agora })
        .eq('assinatura_id', assinatura.id)
        .eq('user_id', userId);
      if (devicesError) throw devicesError;
      return json({ success: true });
    }

    return json({ error: 'Ação não suportada' }, 422);
  } catch (error) {
    console.error('[gerenciar-assinatura]', escapeError(error));
    return json({ error: 'Erro interno ao gerenciar assinatura' }, 500);
  }
});
