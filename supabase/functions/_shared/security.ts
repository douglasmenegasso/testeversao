import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigin = Deno.env.get('KAYLA_ALLOWED_ORIGIN') ?? 'https://kayla.app.br';

export const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

export function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

export function handleCors(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Método não permitido' }, 405);
  }
  return null;
}

export function getEnvironment() {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error('Variáveis Supabase ausentes no ambiente da função');
  }
  return { url, anonKey, serviceRoleKey };
}

export async function getAuthenticatedUser(request: Request) {
  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return { user: null, client: null, error: 'Autenticação obrigatória' };
  }

  const { url, anonKey } = getEnvironment();
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return { user: null, client: null, error: 'Sessão inválida ou expirada' };
  }

  return { user: data.user, client, error: null };
}

export function getAdminClient() {
  const { url, serviceRoleKey } = getEnvironment();
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function escapeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Erro interno';
}

export type PlanoTipo = 'mensal' | 'anual';

export const PLANOS: Record<PlanoTipo, { nome: string; base: number; extra: number; duracaoDias: number }> = {
  mensal: { nome: 'Plano Mensal', base: 19.90, extra: 5.00, duracaoDias: 30 },
  anual: { nome: 'Plano Anual', base: 199.90, extra: 5.00, duracaoDias: 365 },
};

export function isPlanoTipo(value: unknown): value is PlanoTipo {
  return value === 'mensal' || value === 'anual';
}

export function calcularValorPlano(plano: PlanoTipo, dispositivos: number): number {
  const regras = PLANOS[plano];
  return Number((regras.base + Math.max(0, dispositivos - 1) * regras.extra).toFixed(2));
}

export function validarDispositivos(value: unknown): number | null {
  const numero = Number(value);
  return Number.isInteger(numero) && numero >= 1 && numero <= 5 ? numero : null;
}
