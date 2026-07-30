-- Fase 3C.6 — Convites do primeiro administrador da empresa
-- Objetivo:
-- Criar a estrutura segura para o administrador da plataforma convidar
-- o primeiro administrador de uma empresa cliente.
--
-- Esta migration não cria usuários automaticamente.
-- Esta migration não altera leads, ciclos comerciais, Pool, Kanban,
-- relatórios, simulador ou faturamento.

create table if not exists public.company_admin_invitations (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null references public.companies(id) on delete cascade,

  email text not null,
  full_name text null,

  token_hash text not null unique,

  status text not null default 'pending',

  created_by uuid not null references auth.users(id),
  accepted_user_id uuid null references auth.users(id),

  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  last_sent_at timestamptz null,
  accepted_at timestamptz null,
  cancelled_at timestamptz null,

  metadata jsonb not null default '{}'::jsonb
);

alter table public.company_admin_invitations
  drop constraint if exists company_admin_invitations_status_check;

alter table public.company_admin_invitations
  add constraint company_admin_invitations_status_check
  check (
    status in (
      'pending',
      'accepted',
      'expired',
      'cancelled'
    )
  );

alter table public.company_admin_invitations
  drop constraint if exists company_admin_invitations_email_not_empty;

alter table public.company_admin_invitations
  add constraint company_admin_invitations_email_not_empty
  check (btrim(email) <> '');

alter table public.company_admin_invitations
  drop constraint if exists company_admin_invitations_token_hash_not_empty;

alter table public.company_admin_invitations
  add constraint company_admin_invitations_token_hash_not_empty
  check (btrim(token_hash) <> '');

create index if not exists idx_company_admin_invitations_company_id
  on public.company_admin_invitations (company_id);

create index if not exists idx_company_admin_invitations_email
  on public.company_admin_invitations (lower(email));

create index if not exists idx_company_admin_invitations_status
  on public.company_admin_invitations (status);

create index if not exists idx_company_admin_invitations_expires_at
  on public.company_admin_invitations (expires_at);

create unique index if not exists uq_company_admin_invitations_one_pending_per_company
  on public.company_admin_invitations (company_id)
  where status = 'pending';

alter table public.company_admin_invitations enable row level security;

drop policy if exists "company_admin_invitations_select_platform_admin"
  on public.company_admin_invitations;

create policy "company_admin_invitations_select_platform_admin"
  on public.company_admin_invitations
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and p.is_platform_admin = true
    )
  );

drop policy if exists "company_admin_invitations_insert_platform_admin"
  on public.company_admin_invitations;

create policy "company_admin_invitations_insert_platform_admin"
  on public.company_admin_invitations
  for insert
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and p.is_platform_admin = true
    )
  );

drop policy if exists "company_admin_invitations_update_platform_admin"
  on public.company_admin_invitations;

create policy "company_admin_invitations_update_platform_admin"
  on public.company_admin_invitations
  for update
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and p.is_platform_admin = true
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and p.is_platform_admin = true
    )
  );

comment on table public.company_admin_invitations is
  'Convites enviados pelo administrador da plataforma para ativação do primeiro administrador da empresa cliente.';

comment on column public.company_admin_invitations.company_id is
  'Empresa cliente vinculada ao convite.';

comment on column public.company_admin_invitations.email is
  'E-mail do responsável que receberá o convite para ativar a conta de primeiro admin da empresa.';

comment on column public.company_admin_invitations.token_hash is
  'Hash do token do convite. O token puro não deve ser salvo no banco.';

comment on column public.company_admin_invitations.status is
  'Status do convite: pending, accepted, expired, cancelled.';

comment on column public.company_admin_invitations.created_by is
  'Administrador da plataforma que criou o convite.';

comment on column public.company_admin_invitations.accepted_user_id is
  'Usuário criado no Auth quando o convite for aceito.';

comment on column public.company_admin_invitations.expires_at is
  'Data de expiração do convite.';