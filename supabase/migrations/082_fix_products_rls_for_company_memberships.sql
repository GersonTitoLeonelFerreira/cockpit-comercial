begin;

-- ============================================================================
-- Migration 082: Corrige RLS do catálogo de produtos para multiempresa
-- Fonte oficial de permissão: company_memberships
-- ============================================================================

alter table public.products enable row level security;

drop policy if exists products_select on public.products;
drop policy if exists products_insert on public.products;
drop policy if exists products_update on public.products;
drop policy if exists products_delete on public.products;

-- Leitura:
-- qualquer usuário com membership ativa na empresa pode consultar produtos.
-- Isso permite que vendedores escolham produtos ao fechar uma venda.
create policy products_select
  on public.products
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.company_memberships cm
      join public.profiles p
        on p.id = cm.user_id
      where cm.company_id = products.company_id
        and cm.user_id = auth.uid()
        and cm.is_active = true
        and coalesce(p.is_active_global, true) = true
    )
  );

-- Criação:
-- somente admin ativo da própria empresa pode cadastrar produto.
create policy products_insert
  on public.products
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.company_memberships cm
      join public.profiles p
        on p.id = cm.user_id
      where cm.company_id = products.company_id
        and cm.user_id = auth.uid()
        and cm.role = 'admin'
        and cm.is_active = true
        and coalesce(p.is_active_global, true) = true
    )
  );

-- Atualização:
-- somente admin ativo da própria empresa pode alterar produto.
create policy products_update
  on public.products
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.company_memberships cm
      join public.profiles p
        on p.id = cm.user_id
      where cm.company_id = products.company_id
        and cm.user_id = auth.uid()
        and cm.role = 'admin'
        and cm.is_active = true
        and coalesce(p.is_active_global, true) = true
    )
  )
  with check (
    exists (
      select 1
      from public.company_memberships cm
      join public.profiles p
        on p.id = cm.user_id
      where cm.company_id = products.company_id
        and cm.user_id = auth.uid()
        and cm.role = 'admin'
        and cm.is_active = true
        and coalesce(p.is_active_global, true) = true
    )
  );

-- Exclusão:
-- somente admin ativo da própria empresa pode excluir produto.
create policy products_delete
  on public.products
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.company_memberships cm
      join public.profiles p
        on p.id = cm.user_id
      where cm.company_id = products.company_id
        and cm.user_id = auth.uid()
        and cm.role = 'admin'
        and cm.is_active = true
        and coalesce(p.is_active_global, true) = true
    )
  );

commit;