-- =============================================================================
-- Migration 063 — Decouple user_code from profiles.company_id
-- =============================================================================
-- Fase 9B — User code e profiles global
--
-- Objetivo:
-- 1. Remover a obrigação de profiles.company_id para gerar user_code.
-- 2. Permitir profile global sem company_id.
-- 3. Usar company_memberships como fallback para geração de user_code.
-- 4. Preencher profiles.user_code faltantes quando houver empresa inferível.
-- 5. Preservar next_user_code(company_id).
--
-- Esta migration NÃO mexe em:
-- - estrutura de profiles
-- - estrutura de company_memberships
-- - auth.users
-- - convites
-- - criação de vendedores
-- =============================================================================

begin;

-- =============================================================================
-- 1. Recriar trigger function sem exigir profiles.company_id
-- =============================================================================

create or replace function public.profiles_set_user_code()
returns trigger
language plpgsql
set search_path = 'public', 'auth'
as $$
declare
  v_company_id uuid;
begin
  if new.user_code is not null then
    return new;
  end if;

  -- Prioridade 1: compatibilidade antiga, quando profiles.company_id existe.
  v_company_id := new.company_id;

  -- Prioridade 2: empresa inferida por membership ativa.
  if v_company_id is null then
    select cm.company_id
      into v_company_id
    from public.company_memberships cm
    where cm.user_id = new.id
      and cm.is_active = true
    order by cm.created_at asc, cm.company_id asc
    limit 1;
  end if;

  -- Se ainda não existe membership, não bloqueia criação do profile global.
  -- O user_code poderá ser preenchido depois, quando o vínculo com empresa existir.
  if v_company_id is null then
    return new;
  end if;

  new.user_code := public.next_user_code(v_company_id);

  return new;
end;
$$;

-- Mantém função interna sem exposição pública/client.
revoke all on function public.profiles_set_user_code()
from public;

revoke execute on function public.profiles_set_user_code()
from anon;

revoke execute on function public.profiles_set_user_code()
from authenticated;

grant execute on function public.profiles_set_user_code()
to service_role;

-- =============================================================================
-- 2. Backfill de profiles sem user_code
-- =============================================================================
-- Usa profiles.company_id quando existir.
-- Caso contrário, usa primeira membership ativa do usuário.
-- Não falha se não houver empresa inferível.
-- =============================================================================

do $$
declare
  r record;
  v_company_id uuid;
begin
  for r in
    select p.id, p.company_id
    from public.profiles p
    where p.user_code is null
    order by p.created_at asc, p.id asc
  loop
    v_company_id := r.company_id;

    if v_company_id is null then
      select cm.company_id
        into v_company_id
      from public.company_memberships cm
      where cm.user_id = r.id
        and cm.is_active = true
      order by cm.created_at asc, cm.company_id asc
      limit 1;
    end if;

    if v_company_id is not null then
      update public.profiles
      set user_code = public.next_user_code(v_company_id)
      where id = r.id
        and user_code is null;
    end if;
  end loop;
end $$;

commit;