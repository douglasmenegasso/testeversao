-- Segurança de acesso para a base Kayla.
-- Execute primeiro no projeto de teste e revise com o Schema Visualizer do Supabase.
-- As operações administrativas, de pagamento e de assinatura são realizadas
-- pelas Edge Functions com service role; nunca pelo anon key do navegador.

begin;

alter table if exists public.clientes enable row level security;
alter table if exists public.produtos enable row level security;
alter table if exists public.pedidos enable row level security;
alter table if exists public.pedido_itens enable row level security;
alter table if exists public.empresa enable row level security;
alter table if exists public.pagamentos enable row level security;
alter table if exists public.assinaturas enable row level security;
alter table if exists public.creditos enable row level security;
alter table if exists public.planos enable row level security;
alter table if exists public.dispositivos enable row level security;
alter table if exists public.admin_events enable row level security;
alter table if exists public.visitors enable row level security;

-- Dados operacionais do usuário.
drop policy if exists "kayla_clientes_owner" on public.clientes;
create policy "kayla_clientes_owner" on public.clientes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "kayla_produtos_owner" on public.produtos;
create policy "kayla_produtos_owner" on public.produtos for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "kayla_pedidos_owner" on public.pedidos;
create policy "kayla_pedidos_owner" on public.pedidos for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "kayla_empresa_owner" on public.empresa;
create policy "kayla_empresa_owner" on public.empresa for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Itens pertencem ao pedido de um usuário; não recebem user_id próprio.
drop policy if exists "kayla_pedido_itens_owner" on public.pedido_itens;
create policy "kayla_pedido_itens_owner" on public.pedido_itens for all
  using (exists (select 1 from public.pedidos p where p.id = pedido_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.pedidos p where p.id = pedido_id and p.user_id = auth.uid()));

-- Registros financeiros podem ser consultados pelo titular, mas só funções
-- de servidor podem criar ou alterar status, valores, licenças e créditos.
drop policy if exists "kayla_pagamentos_select_owner" on public.pagamentos;
create policy "kayla_pagamentos_select_owner" on public.pagamentos for select using (auth.uid() = user_id);

drop policy if exists "kayla_assinaturas_select_owner" on public.assinaturas;
create policy "kayla_assinaturas_select_owner" on public.assinaturas for select using (auth.uid() = user_id);

drop policy if exists "kayla_creditos_select_owner" on public.creditos;
create policy "kayla_creditos_select_owner" on public.creditos for select using (auth.uid() = user_id);

-- O navegador só visualiza planos. Preços e permissões são definidos no servidor.
drop policy if exists "kayla_planos_select_authenticated" on public.planos;
create policy "kayla_planos_select_authenticated" on public.planos for select to authenticated using (true);

-- Dispositivos podem ser lidos pelo titular. Registro, exclusão e alteração
-- de contadores devem migrar para função de servidor antes de remover a
-- política de escrita legada, evitando alterar a produção durante a transição.
drop policy if exists "kayla_dispositivos_select_owner" on public.dispositivos;
create policy "kayla_dispositivos_select_owner" on public.dispositivos for select using (auth.uid() = user_id);

-- Nenhum acesso direto do cliente a eventos administrativos/visitas.
drop policy if exists "kayla_admin_events_no_client_access" on public.admin_events;
create policy "kayla_admin_events_no_client_access" on public.admin_events for all using (false) with check (false);

drop policy if exists "kayla_visitors_no_client_access" on public.visitors;
create policy "kayla_visitors_no_client_access" on public.visitors for all using (false) with check (false);

commit;
