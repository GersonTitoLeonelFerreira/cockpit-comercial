-- Fase 3C.5 — Status de plataforma e onboarding da empresa
-- Objetivo:
-- Separar o status global da empresa na plataforma do status de implantação/onboarding.
-- Esta migration não altera leads, ciclos comerciais, usuários, relatórios, dashboard ou faturamento.

alter table public.companies
  add column if not exists platform_status text not null default 'active',
  add column if not exists onboarding_status text not null default 'company_created',
  add column if not exists platform_status_updated_at timestamptz not null default now(),
  add column if not exists onboarding_status_updated_at timestamptz not null default now();

alter table public.companies
  drop constraint if exists companies_platform_status_check;

alter table public.companies
  add constraint companies_platform_status_check
  check (
    platform_status in (
      'active',
      'blocked',
      'cancelled',
      'archived'
    )
  );

alter table public.companies
  drop constraint if exists companies_onboarding_status_check;

alter table public.companies
  add constraint companies_onboarding_status_check
  check (
    onboarding_status in (
      'company_created',
      'admin_invite_pending',
      'admin_invited',
      'admin_active',
      'onboarding_done'
    )
  );

create index if not exists idx_companies_platform_status
  on public.companies (platform_status);

create index if not exists idx_companies_onboarding_status
  on public.companies (onboarding_status);

comment on column public.companies.platform_status is
  'Status global da empresa na plataforma: active, blocked, cancelled, archived.';

comment on column public.companies.onboarding_status is
  'Status de implantação da empresa: company_created, admin_invite_pending, admin_invited, admin_active, onboarding_done.';

comment on column public.companies.platform_status_updated_at is
  'Momento da última alteração do status global da empresa na plataforma.';

comment on column public.companies.onboarding_status_updated_at is
  'Momento da última alteração do status de onboarding da empresa.';