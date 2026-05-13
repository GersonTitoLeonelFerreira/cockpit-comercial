-- =============================================================================
-- Migration 062 — Harden user_code internal functions
-- =============================================================================
-- Fase 9A — User code e profiles global
--
-- Objetivo:
-- 1. Remover execução pública/anônima de funções internas de user_code.
-- 2. Impedir chamada direta por authenticated.
-- 3. Preservar execução por triggers e service_role.
--
-- Esta migration NÃO mexe em:
-- - lógica do user_code
-- - profiles.company_id
-- - company_memberships
-- - triggers existentes
-- - convite/admin
-- =============================================================================

begin;

do $$
begin
  if to_regprocedure('public.next_user_code(uuid)') is not null then
    execute 'revoke all on function public.next_user_code(uuid) from public';
    execute 'revoke execute on function public.next_user_code(uuid) from anon';
    execute 'revoke execute on function public.next_user_code(uuid) from authenticated';
    execute 'grant execute on function public.next_user_code(uuid) to service_role';
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.profiles_set_user_code()') is not null then
    execute 'revoke all on function public.profiles_set_user_code() from public';
    execute 'revoke execute on function public.profiles_set_user_code() from anon';
    execute 'revoke execute on function public.profiles_set_user_code() from authenticated';
    execute 'grant execute on function public.profiles_set_user_code() to service_role';
  end if;
end $$;

commit;