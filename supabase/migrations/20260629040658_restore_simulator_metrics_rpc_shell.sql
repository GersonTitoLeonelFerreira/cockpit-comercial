-- Yolen - baseline reproduzível do schema public
-- Snapshot somente de metadados extraído de produção em 2026-07-30.
-- Projeto de origem: Yolen - Cockpit Comercial (PostgreSQL 17).
--
-- IMPORTANTE:
-- 1. Este arquivo representa o estado vivo, sem dados de produção.
-- 2. Não aplique diretamente ao banco de produção existente.
-- 3. O destino deste baseline é um ambiente Supabase novo e descartável.
-- 4. As migrations históricas permanecem preservadas até a validação integral.
--
-- Gerado na Fase 2 do Yolen Companion V2.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

set local search_path = public, extensions, pg_catalog;
set local check_function_bodies = false;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------

create type public.lead_status as enum ('novo', 'contato', 'respondeu', 'negociacao', 'ganho', 'pausado', 'perdido', 'cancelado');

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------

create table public.admin_events (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  actor_user_id uuid not null,
  target_user_id uuid,
  event_type text not null,
  metadata jsonb default '{}'::jsonb not null,
  occurred_at timestamp with time zone default now() not null
);

create table public.ai_coaching_notes (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  cycle_id uuid not null,
  created_by uuid not null,
  source text default 'ai_copilot_detail'::text not null,
  coaching jsonb not null,
  yolen_decision jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null
);

create table public.audit_sales_cycles (
  id uuid default gen_random_uuid() not null,
  sales_cycle_id uuid not null,
  operation character varying(10) not null,
  changed_by uuid,
  changed_at timestamp with time zone default now(),
  old_data jsonb,
  new_data jsonb,
  changes_summary text
);

create table public.companies (
  id uuid default gen_random_uuid() not null,
  name text not null,
  slug text,
  plan text default 'free'::text not null,
  created_at timestamp with time zone default now() not null,
  segment text,
  email text,
  phone text,
  city text,
  state text,
  cep text,
  address text,
  cnpj text,
  legal_name text not null,
  trade_name text not null,
  settings jsonb default '{}'::jsonb not null,
  platform_status text default 'active'::text not null,
  onboarding_status text default 'company_created'::text not null,
  platform_status_updated_at timestamp with time zone default now() not null,
  onboarding_status_updated_at timestamp with time zone default now() not null
);

create table public.company_admin_invitations (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  email text not null,
  full_name text,
  token_hash text not null,
  status text default 'pending'::text not null,
  created_by uuid not null,
  accepted_user_id uuid,
  created_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone default now() + '7 days'::interval not null,
  last_sent_at timestamp with time zone,
  accepted_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  metadata jsonb default '{}'::jsonb not null
);

create table public.company_counters (
  company_id uuid not null,
  next_user_code integer default 1 not null,
  updated_at timestamp with time zone default now() not null
);

create table public.company_lead_api_keys (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  name text not null,
  key_prefix text not null,
  secret_hash text not null,
  created_by uuid not null,
  created_at timestamp with time zone default now() not null,
  last_used_at timestamp with time zone,
  last_used_lead_id uuid,
  revoked_at timestamp with time zone,
  revoked_by uuid
);

create table public.company_memberships (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  user_id uuid not null,
  role text default 'member'::text not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null
);

create table public.company_site_lead_distribution (
  company_id uuid not null,
  last_assigned_owner_id uuid,
  updated_at timestamp with time zone default now() not null
);

create table public.company_sla_rules (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  status lead_status not null,
  target_minutes integer not null,
  warning_minutes integer not null,
  danger_minutes integer not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table public.competencies (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  month date not null,
  is_active boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table public.cycle_events (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  cycle_id uuid not null,
  event_type text not null,
  created_by uuid not null,
  metadata jsonb default '{}'::jsonb not null,
  occurred_at timestamp with time zone default now() not null
);

create table public.demo_requests (
  id uuid default gen_random_uuid() not null,
  name text not null,
  company text,
  whatsapp text,
  email text,
  segment text,
  message text,
  status text default 'new'::text not null,
  created_at timestamp with time zone default now() not null,
  team_size text,
  current_control text,
  main_bottleneck text,
  leads_volume text,
  timeline text
);

create table public.execution_day_calendars (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  period_start date not null,
  period_end date not null,
  execution_day_overrides jsonb default '{}'::jsonb not null,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  work_days jsonb default '{"0": false, "1": true, "2": true, "3": true, "4": true, "5": true, "6": false}'::jsonb not null
);

create table public.kv_store_4af580ad (
  key text not null,
  value jsonb not null
);

create table public.lead_conversation_analyses (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  lead_id uuid not null,
  user_id uuid not null,
  source text default 'whatsapp_web_paste'::text not null,
  summary text not null,
  highlights text[] default '{}'::text[] not null,
  objections text[] default '{}'::text[] not null,
  next_actions text[] default '{}'::text[] not null,
  performance_score integer default 0 not null,
  sentiment text,
  analysis_json jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null
);

create table public.lead_events (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  lead_id uuid not null,
  user_id uuid not null,
  event_type text not null,
  from_stage text,
  to_stage text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  seconds_in_from_stage integer
);

create table public.lead_group_cycles (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  group_id uuid not null,
  cycle_id uuid not null,
  attached_by uuid not null,
  detached_by uuid,
  attached_at timestamp with time zone default now() not null,
  detached_at timestamp with time zone
);

create table public.lead_groups (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  name text not null,
  created_by uuid not null,
  created_at timestamp with time zone default now() not null,
  archived_at timestamp with time zone,
  description text
);

create table public.lead_interactions (
  id uuid default gen_random_uuid() not null,
  lead_id uuid,
  user_id uuid not null,
  type text,
  note text,
  created_at timestamp without time zone default now(),
  company_id uuid not null
);

create table public.lead_list_members (
  company_id uuid not null,
  list_id uuid not null,
  lead_id uuid not null,
  added_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null
);

create table public.lead_lists (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  name text not null,
  list_type text default 'outro'::text not null,
  month_ref date,
  description text,
  created_at timestamp with time zone default now() not null
);

create table public.lead_profiles (
  lead_id uuid not null,
  company_id uuid not null,
  lead_type text default 'PF'::text not null,
  cpf text,
  cnpj text,
  razao_social text,
  email text,
  cep text,
  address_street text,
  address_number text,
  address_complement text,
  address_neighborhood text,
  address_city text,
  address_state text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  address_country text,
  birth_date date,
  mother_name text,
  mother_cpf text,
  father_name text,
  father_cpf text,
  biological_sex text,
  profession text,
  education_level text,
  marital_status text,
  rne text,
  passport text,
  rg text,
  rg_issuer text,
  rg_state text,
  phone_residential text,
  phone_residential_desc text,
  phone_commercial text,
  phone_commercial_desc text,
  phone_mobile text,
  phone_mobile_desc text,
  emergency_contact_name text,
  emergency_contact_phone text
);

create table public.lead_stage_events (
  id uuid default gen_random_uuid() not null,
  lead_id uuid,
  user_id uuid not null,
  from_status text,
  to_status text,
  moved_at timestamp with time zone default now(),
  company_id uuid not null,
  seconds_in_from_status integer
);

create table public.lead_status_history (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  lead_id uuid not null,
  owner_id uuid,
  from_status text,
  to_status text not null,
  changed_at timestamp with time zone default now() not null
);

create table public.lead_user_priority (
  user_id uuid not null,
  lead_id uuid not null,
  pinned boolean default false not null,
  importance integer default 0 not null,
  note text,
  updated_at timestamp with time zone default now() not null
);

create table public.leads (
  id uuid default gen_random_uuid() not null,
  owner_id uuid,
  name text not null,
  phone text,
  notes text,
  created_at timestamp with time zone default now() not null,
  status text default 'novo'::text not null,
  next_action text,
  next_contact_at timestamp with time zone,
  company_id uuid not null,
  assigned_to uuid,
  stage_entered_at timestamp with time zone default now(),
  email text,
  assigned_at timestamp with time zone,
  campaign_name text,
  current_pipeline_id uuid,
  current_stage_id uuid,
  source text,
  score integer default 0 not null,
  qualified boolean default false not null,
  created_by uuid default auth.uid(),
  updated_at timestamp with time zone default now() not null,
  phone_norm text,
  email_norm text,
  external_key text,
  deal_value numeric,
  address_cep text,
  address_street text,
  address_number text,
  address_complement text,
  address_neighborhood text,
  address_city text,
  address_state text,
  cpf_cnpj text,
  entry_mode text default 'unknown'::text not null,
  lead_origin_at timestamp with time zone,
  first_worked_at timestamp with time zone,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  phone_digits text generated always as (NULLIF(regexp_replace(COALESCE(phone, ''::text), '\D'::text, ''::text, 'g'::text), ''::text)) stored
);

create table public.pipeline_stages (
  id uuid default gen_random_uuid() not null,
  pipeline_id uuid not null,
  name text not null,
  key text not null,
  "position" integer not null,
  sla_minutes integer,
  is_won boolean default false not null,
  is_lost boolean default false not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null
);

create table public.pipelines (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  name text not null,
  key text not null,
  is_default boolean default false not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  description text,
  allow_create boolean default true not null
);

create table public.products (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  name text not null,
  category text default ''::text,
  base_price numeric(12,2) default 0 not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.profile_details (
  profile_id uuid not null,
  tipo_pessoa text not null,
  legal_name text not null,
  birth_date date not null,
  cpf text not null,
  nacionalidade text,
  naturalidade text,
  rg text,
  orgao_emissor text,
  estado_emissao text,
  sexo_biologico text,
  genero text,
  estado_civil text,
  profissao text,
  grau_instrucao text,
  contato_emergencia text,
  telefone_emergencia text,
  pais text,
  estado text,
  cidade text,
  logradouro text,
  numero text,
  web_page text,
  updated_at timestamp with time zone default now() not null,
  cep text
);

create table public.profiles (
  id uuid not null,
  company_id uuid,
  role text default 'member'::text,
  full_name text,
  created_at timestamp with time zone default now() not null,
  job_title text,
  email text,
  status text default 'pending'::text not null,
  username text,
  birth_date date,
  cpf text,
  phone text,
  user_code integer,
  is_active boolean default true,
  is_platform_admin boolean default false not null,
  is_active_global boolean default true not null
);

create table public.quick_actions_config (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  label text not null,
  suggested_status text not null,
  is_active boolean default true,
  "order" integer default 0,
  created_at timestamp without time zone default now(),
  updated_at timestamp without time zone default now()
);

create table public.revenue_extra_sources (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  name text not null,
  created_by uuid not null,
  created_at timestamp with time zone default now() not null,
  archived_at timestamp with time zone
);

create table public.revenue_goals (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  owner_id uuid,
  date_start date not null,
  date_end date not null,
  goal_value numeric default 0 not null,
  created_by uuid default auth.uid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  ticket_medio numeric default 0 not null
);

create table public.revenue_overrides_daily (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  source_kind text not null,
  source_id uuid not null,
  ref_date date not null,
  real_value numeric(12,2) default 0 not null,
  reason text not null,
  notes text,
  edited_by uuid not null,
  edited_at timestamp with time zone default now() not null
);

create table public.sales_cycle_period_activity (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  cycle_id uuid not null,
  competency_id uuid not null,
  owner_user_id uuid,
  first_touched_at timestamp with time zone not null,
  last_touched_at timestamp with time zone not null,
  was_worked boolean default false not null,
  was_won boolean default false not null,
  was_lost boolean default false not null,
  won_total_in_period numeric default 0 not null,
  move_count integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.sales_cycles (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  lead_id uuid not null,
  owner_user_id uuid,
  status lead_status default 'novo'::lead_status not null,
  stage_entered_at timestamp with time zone default now() not null,
  next_action text,
  next_action_date timestamp with time zone,
  current_group_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  closed_at timestamp with time zone,
  won_owner_user_id uuid,
  won_at timestamp with time zone,
  won_total numeric,
  won_items integer,
  won_note text,
  previous_status text,
  lost_reason text,
  lost_at timestamp with time zone,
  lost_owner_user_id uuid,
  paused_at timestamp with time zone,
  paused_reason text,
  canceled_at timestamp with time zone,
  canceled_reason text,
  revenue_seller_ref_date character varying(10),
  won_value_source character varying(50) default 'manual'::character varying,
  first_worked_at timestamp with time zone,
  product_id uuid,
  won_unit_price numeric(12,2),
  payment_method text,
  payment_type text,
  entry_amount numeric(12,2),
  installments_count integer,
  installment_amount numeric(12,2),
  payment_notes text,
  invoice_id uuid,
  origin_cycle_id uuid,
  opportunity_type text
);

create table public.sla_rules (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  status text not null,
  target_minutes integer default 1440 not null,
  warning_minutes integer default 2880 not null,
  danger_minutes integer default 4320 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- -----------------------------------------------------------------------------
-- Constraints primárias, únicas e de validação
-- -----------------------------------------------------------------------------

alter table only public.admin_events add constraint admin_events_pkey PRIMARY KEY (id);

alter table only public.ai_coaching_notes add constraint ai_coaching_notes_pkey PRIMARY KEY (id);

alter table only public.audit_sales_cycles add constraint audit_sales_cycles_pkey PRIMARY KEY (id);

alter table only public.companies add constraint companies_pkey PRIMARY KEY (id);

alter table only public.company_admin_invitations add constraint company_admin_invitations_pkey PRIMARY KEY (id);

alter table only public.company_counters add constraint company_counters_pkey PRIMARY KEY (company_id);

alter table only public.company_lead_api_keys add constraint company_lead_api_keys_pkey PRIMARY KEY (id);

alter table only public.company_memberships add constraint company_memberships_pkey PRIMARY KEY (id);

alter table only public.company_site_lead_distribution add constraint company_site_lead_distribution_pkey PRIMARY KEY (company_id);

alter table only public.company_sla_rules add constraint company_sla_rules_pkey PRIMARY KEY (id);

alter table only public.competencies add constraint competencies_pkey PRIMARY KEY (id);

alter table only public.cycle_events add constraint cycle_events_pkey PRIMARY KEY (id);

alter table only public.demo_requests add constraint demo_requests_pkey PRIMARY KEY (id);

alter table only public.execution_day_calendars add constraint execution_day_calendars_pkey PRIMARY KEY (id);

alter table only public.kv_store_4af580ad add constraint kv_store_4af580ad_pkey PRIMARY KEY (key);

alter table only public.lead_conversation_analyses add constraint lead_conversation_analyses_pkey PRIMARY KEY (id);

alter table only public.lead_events add constraint lead_events_pkey PRIMARY KEY (id);

alter table only public.lead_group_cycles add constraint lead_group_cycles_pkey PRIMARY KEY (id);

alter table only public.lead_groups add constraint lead_groups_pkey PRIMARY KEY (id);

alter table only public.lead_interactions add constraint lead_interactions_pkey PRIMARY KEY (id);

alter table only public.lead_list_members add constraint lead_list_members_pkey PRIMARY KEY (list_id, lead_id);

alter table only public.lead_lists add constraint lead_lists_pkey PRIMARY KEY (id);

alter table only public.lead_profiles add constraint lead_profiles_pkey PRIMARY KEY (lead_id);

alter table only public.lead_stage_events add constraint lead_stage_events_pkey PRIMARY KEY (id);

alter table only public.lead_status_history add constraint lead_status_history_pkey PRIMARY KEY (id);

alter table only public.lead_user_priority add constraint lead_user_priority_pkey PRIMARY KEY (user_id, lead_id);

alter table only public.leads add constraint leads_pkey PRIMARY KEY (id);

alter table only public.pipeline_stages add constraint pipeline_stages_pkey PRIMARY KEY (id);

alter table only public.pipelines add constraint pipelines_pkey PRIMARY KEY (id);

alter table only public.products add constraint products_pkey PRIMARY KEY (id);

alter table only public.profile_details add constraint profile_details_pkey PRIMARY KEY (profile_id);

alter table only public.profiles add constraint profiles_pkey PRIMARY KEY (id);

alter table only public.quick_actions_config add constraint quick_actions_config_pkey PRIMARY KEY (id);

alter table only public.revenue_extra_sources add constraint revenue_extra_sources_pkey PRIMARY KEY (id);

alter table only public.revenue_goals add constraint revenue_goals_pkey PRIMARY KEY (id);

alter table only public.revenue_overrides_daily add constraint revenue_overrides_daily_pkey PRIMARY KEY (id);

alter table only public.sales_cycle_period_activity add constraint sales_cycle_period_activity_pkey PRIMARY KEY (id);

alter table only public.sales_cycles add constraint sales_cycles_pkey PRIMARY KEY (id);

alter table only public.sla_rules add constraint sla_rules_pkey PRIMARY KEY (id);

alter table only public.companies add constraint companies_slug_key UNIQUE (slug);

alter table only public.company_admin_invitations add constraint company_admin_invitations_token_hash_key UNIQUE (token_hash);

alter table only public.company_memberships add constraint company_memberships_company_user_unique UNIQUE (company_id, user_id);

alter table only public.company_sla_rules add constraint unique_company_status UNIQUE (company_id, status);

alter table only public.competencies add constraint comp_company_month_uniq UNIQUE (company_id, month);

alter table only public.execution_day_calendars add constraint execution_day_calendars_unique_period UNIQUE (company_id, period_start, period_end);

alter table only public.lead_groups add constraint lg_company_name_uniq UNIQUE (company_id, name);

alter table only public.lead_user_priority add constraint lead_user_priority_user_lead_unique UNIQUE (user_id, lead_id);

alter table only public.leads add constraint unique_cpf_cnpj_per_company UNIQUE (company_id, cpf_cnpj);

alter table only public.pipeline_stages add constraint pipeline_stages_pipeline_id_key_key UNIQUE (pipeline_id, key);

alter table only public.pipeline_stages add constraint pipeline_stages_pipeline_id_position_key UNIQUE (pipeline_id, "position");

alter table only public.pipelines add constraint pipelines_company_id_key_key UNIQUE (company_id, key);

alter table only public.profile_details add constraint profile_details_profile_id_unique UNIQUE (profile_id);

alter table only public.quick_actions_config add constraint quick_actions_config_company_id_label_key UNIQUE (company_id, label);

alter table only public.sla_rules add constraint sla_rules_company_id_status_key UNIQUE (company_id, status);

alter table only public.companies add constraint companies_onboarding_status_check CHECK (onboarding_status = ANY (ARRAY['company_created'::text, 'admin_invite_pending'::text, 'admin_invited'::text, 'admin_active'::text, 'onboarding_done'::text]));

alter table only public.companies add constraint companies_platform_status_check CHECK (platform_status = ANY (ARRAY['active'::text, 'blocked'::text, 'cancelled'::text, 'archived'::text]));

alter table only public.company_admin_invitations add constraint company_admin_invitations_email_not_empty CHECK (btrim(email) <> ''::text);

alter table only public.company_admin_invitations add constraint company_admin_invitations_status_check CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'cancelled'::text]));

alter table only public.company_admin_invitations add constraint company_admin_invitations_token_hash_not_empty CHECK (btrim(token_hash) <> ''::text);

alter table only public.company_lead_api_keys add constraint company_lead_api_keys_hash_format CHECK (secret_hash ~ '^[a-f0-9]{64}$'::text);

alter table only public.company_lead_api_keys add constraint company_lead_api_keys_name_not_blank CHECK (char_length(btrim(name)) >= 2 AND char_length(btrim(name)) <= 80);

alter table only public.company_lead_api_keys add constraint company_lead_api_keys_prefix_not_blank CHECK (char_length(btrim(key_prefix)) >= 8 AND char_length(btrim(key_prefix)) <= 40);

alter table only public.company_memberships add constraint company_memberships_role_check CHECK (role = ANY (ARRAY['admin'::text, 'manager'::text, 'member'::text]));

alter table only public.company_sla_rules add constraint check_danger_gte_warning CHECK (danger_minutes >= warning_minutes);

alter table only public.company_sla_rules add constraint check_target_positive CHECK (target_minutes > 0);

alter table only public.company_sla_rules add constraint check_warning_gte_target CHECK (warning_minutes >= target_minutes);

alter table only public.competencies add constraint comp_valid_month CHECK (date_trunc('month'::text, month::timestamp with time zone)::date = month);

alter table only public.cycle_events add constraint ce_check_event_type CHECK (event_type <> ''::text);

alter table only public.execution_day_calendars add constraint execution_day_calendars_overrides_object_check CHECK (jsonb_typeof(execution_day_overrides) = 'object'::text);

alter table only public.execution_day_calendars add constraint execution_day_calendars_period_check CHECK (period_end >= period_start);

alter table only public.execution_day_calendars add constraint execution_day_calendars_work_days_shape CHECK (jsonb_typeof(work_days) = 'object'::text AND work_days ? '0'::text AND work_days ? '1'::text AND work_days ? '2'::text AND work_days ? '3'::text AND work_days ? '4'::text AND work_days ? '5'::text AND work_days ? '6'::text AND jsonb_typeof(work_days -> '0'::text) = 'boolean'::text AND jsonb_typeof(work_days -> '1'::text) = 'boolean'::text AND jsonb_typeof(work_days -> '2'::text) = 'boolean'::text AND jsonb_typeof(work_days -> '3'::text) = 'boolean'::text AND jsonb_typeof(work_days -> '4'::text) = 'boolean'::text AND jsonb_typeof(work_days -> '5'::text) = 'boolean'::text AND jsonb_typeof(work_days -> '6'::text) = 'boolean'::text);

alter table only public.lead_events add constraint lead_events_stage_changed_seconds_chk CHECK (event_type <> 'stage_changed'::text OR seconds_in_from_stage IS NOT NULL);

alter table only public.lead_group_cycles add constraint lgc_check_detach_date CHECK (detached_at IS NULL OR detached_at >= attached_at);

alter table only public.lead_groups add constraint lg_check_archive_date CHECK (archived_at IS NULL OR archived_at >= created_at);

alter table only public.lead_groups add constraint lg_check_name CHECK (name <> ''::text);

alter table only public.lead_profiles add constraint lead_profiles_lead_type_check CHECK (lead_type = ANY (ARRAY['PF'::text, 'PJ'::text]));

alter table only public.leads add constraint leads_entry_mode_check CHECK (entry_mode = ANY (ARRAY['manual'::text, 'import_excel'::text, 'import_api'::text, 'webhook'::text, 'crm_migration'::text, 'unknown'::text]));

alter table only public.profile_details add constraint profile_details_tipo_pessoa_check CHECK (tipo_pessoa = ANY (ARRAY['fisica'::text, 'juridica'::text, 'estrangeiro'::text]));

alter table only public.profiles add constraint profiles_role_check CHECK (role = ANY (ARRAY['admin'::text, 'manager'::text, 'member'::text]));

alter table only public.profiles add constraint profiles_status_check CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'blocked'::text]));

alter table only public.revenue_extra_sources add constraint name_not_empty CHECK (name <> ''::text);

alter table only public.revenue_overrides_daily add constraint reason_not_empty CHECK (reason <> ''::text);

alter table only public.revenue_overrides_daily add constraint source_kind_valid CHECK (source_kind = ANY (ARRAY['seller'::text, 'extra'::text]));

alter table only public.sales_cycle_period_activity add constraint sales_cycle_period_activity_move_count_nonnegative CHECK (move_count >= 0);

alter table only public.sales_cycle_period_activity add constraint sales_cycle_period_activity_won_total_nonnegative CHECK (won_total_in_period >= 0::numeric);

alter table only public.sales_cycles add constraint chk_canceled_consistency_v2 CHECK (
CASE
    WHEN status = 'cancelado'::lead_status THEN canceled_at IS NOT NULL AND canceled_reason IS NOT NULL
    ELSE true
END);

alter table only public.sales_cycles add constraint chk_lost_consistency_v2 CHECK (
CASE
    WHEN status = 'perdido'::lead_status THEN lost_at IS NOT NULL AND closed_at IS NOT NULL AND lost_reason IS NOT NULL
    ELSE true
END);

alter table only public.sales_cycles add constraint chk_paused_consistency_v2 CHECK (
CASE
    WHEN status = 'pausado'::lead_status THEN paused_at IS NOT NULL AND paused_reason IS NOT NULL
    ELSE true
END);

alter table only public.sales_cycles add constraint chk_sales_cycles_opportunity_type CHECK (opportunity_type IS NULL OR (opportunity_type = ANY (ARRAY['reativacao'::text, 'renovacao'::text, 'recompra'::text, 'upgrade'::text, 'novo_produto'::text])));

alter table only public.sales_cycles add constraint chk_sales_cycles_origin_cycle_not_self CHECK (origin_cycle_id IS NULL OR origin_cycle_id <> id);

alter table only public.sales_cycles add constraint chk_won_columns_consistency CHECK (
CASE
    WHEN status = 'ganho'::lead_status THEN won_owner_user_id IS NOT NULL AND won_at IS NOT NULL
    ELSE won_owner_user_id IS NULL AND won_at IS NULL
END);

alter table only public.sales_cycles add constraint chk_won_consistency CHECK (
CASE
    WHEN status = 'ganho'::lead_status THEN won_at IS NOT NULL AND closed_at IS NOT NULL AND won_owner_user_id IS NOT NULL
    ELSE true
END);

alter table only public.sales_cycles add constraint chk_won_items_positive CHECK (won_items IS NULL OR won_items > 0);

alter table only public.sales_cycles add constraint chk_won_total_positive CHECK (won_total IS NULL OR won_total > 0::numeric);

alter table only public.sales_cycles add constraint sc_check_closed_date CHECK (closed_at IS NULL OR closed_at >= created_at);

-- -----------------------------------------------------------------------------
-- Índices
-- -----------------------------------------------------------------------------

CREATE INDEX admin_events_company_id_idx ON public.admin_events USING btree (company_id);

CREATE INDEX admin_events_occurred_at_idx ON public.admin_events USING btree (occurred_at DESC);

CREATE INDEX admin_events_target_user_id_idx ON public.admin_events USING btree (target_user_id);

CREATE INDEX idx_admin_events_company ON public.admin_events USING btree (company_id);

CREATE INDEX idx_admin_events_occurred ON public.admin_events USING btree (occurred_at DESC);

CREATE INDEX idx_admin_events_target ON public.admin_events USING btree (target_user_id);

CREATE INDEX ai_coaching_notes_company_cycle_created_idx ON public.ai_coaching_notes USING btree (company_id, cycle_id, created_at DESC);

CREATE INDEX idx_audit_changed_at ON public.audit_sales_cycles USING btree (changed_at DESC);

CREATE INDEX idx_audit_operation ON public.audit_sales_cycles USING btree (operation);

CREATE INDEX idx_audit_sales_cycle_id ON public.audit_sales_cycles USING btree (sales_cycle_id);

CREATE UNIQUE INDEX companies_cnpj_unique ON public.companies USING btree (cnpj);

CREATE INDEX companies_settings_gin_idx ON public.companies USING gin (settings);

CREATE INDEX idx_companies_onboarding_status ON public.companies USING btree (onboarding_status);

CREATE INDEX idx_companies_platform_status ON public.companies USING btree (platform_status);

CREATE INDEX idx_company_admin_invitations_company_id ON public.company_admin_invitations USING btree (company_id);

CREATE INDEX idx_company_admin_invitations_email ON public.company_admin_invitations USING btree (lower(email));

CREATE INDEX idx_company_admin_invitations_expires_at ON public.company_admin_invitations USING btree (expires_at);

CREATE INDEX idx_company_admin_invitations_status ON public.company_admin_invitations USING btree (status);

CREATE UNIQUE INDEX uq_company_admin_invitations_one_pending_per_company ON public.company_admin_invitations USING btree (company_id) WHERE (status = 'pending'::text);

CREATE INDEX company_lead_api_keys_company_active_created_idx ON public.company_lead_api_keys USING btree (company_id, created_at DESC) WHERE (revoked_at IS NULL);

CREATE UNIQUE INDEX company_lead_api_keys_company_active_name_uniq ON public.company_lead_api_keys USING btree (company_id, lower(name)) WHERE (revoked_at IS NULL);

CREATE UNIQUE INDEX company_lead_api_keys_secret_hash_uniq ON public.company_lead_api_keys USING btree (secret_hash);

CREATE INDEX idx_company_memberships_company_id ON public.company_memberships USING btree (company_id);

CREATE INDEX idx_company_memberships_company_role_active ON public.company_memberships USING btree (company_id, role, is_active);

CREATE INDEX idx_company_memberships_user_active ON public.company_memberships USING btree (user_id, is_active);

CREATE INDEX idx_company_memberships_user_id ON public.company_memberships USING btree (user_id);

CREATE INDEX idx_company_sla_rules_company_id ON public.company_sla_rules USING btree (company_id);

CREATE UNIQUE INDEX idx_competencies_active_per_company ON public.competencies USING btree (company_id) WHERE (is_active = true);

CREATE INDEX idx_competencies_company_active ON public.competencies USING btree (company_id, is_active) WHERE (is_active = true);

CREATE INDEX idx_competencies_company_month ON public.competencies USING btree (company_id, month DESC);

CREATE INDEX idx_cycle_events_ai_event_type_occurred_at ON public.cycle_events USING btree (event_type, occurred_at DESC) WHERE (event_type = ANY (ARRAY['ai_analysis_generated'::text, 'ai_suggestion_applied'::text, 'ai_suggestion_rejected'::text]));

CREATE INDEX idx_cycle_events_company_created_by ON public.cycle_events USING btree (company_id, created_by, occurred_at DESC);

CREATE INDEX idx_cycle_events_company_cycle_occurred ON public.cycle_events USING btree (company_id, cycle_id, occurred_at DESC);

CREATE INDEX idx_cycle_events_company_occurred ON public.cycle_events USING btree (company_id, occurred_at DESC);

CREATE INDEX idx_cycle_events_company_type_occurred ON public.cycle_events USING btree (company_id, event_type, occurred_at DESC);

CREATE INDEX idx_cycle_events_cycle_id ON public.cycle_events USING btree (cycle_id);

CREATE INDEX idx_cycle_events_cycle_id_occurred_at ON public.cycle_events USING btree (cycle_id, occurred_at DESC);

CREATE INDEX idx_cycle_events_cycle_occurred_at ON public.cycle_events USING btree (cycle_id, occurred_at DESC);

CREATE INDEX idx_cycle_events_event_type_occurred_at ON public.cycle_events USING btree (event_type, occurred_at DESC);

CREATE INDEX idx_cycle_events_occurred_at ON public.cycle_events USING btree (company_id, occurred_at DESC);

CREATE INDEX idx_cycle_events_stage_checkpoint ON public.cycle_events USING btree (company_id, occurred_at DESC) WHERE (event_type = 'stage_checkpoint'::text);

CREATE INDEX execution_day_calendars_company_idx ON public.execution_day_calendars USING btree (company_id);

CREATE INDEX execution_day_calendars_company_period_idx ON public.execution_day_calendars USING btree (company_id, period_start, period_end);

CREATE INDEX kv_store_4af580ad_key_idx ON public.kv_store_4af580ad USING btree (key text_pattern_ops);

CREATE INDEX idx_lca_company_created ON public.lead_conversation_analyses USING btree (company_id, created_at DESC);

CREATE INDEX idx_lca_company_lead_created ON public.lead_conversation_analyses USING btree (company_id, lead_id, created_at DESC);

CREATE INDEX lead_events_company_created_idx ON public.lead_events USING btree (company_id, created_at DESC);

CREATE INDEX lead_events_company_id_idx ON public.lead_events USING btree (company_id);

CREATE INDEX lead_events_created_at_idx ON public.lead_events USING btree (created_at);

CREATE INDEX lead_events_lead_created_idx ON public.lead_events USING btree (lead_id, created_at DESC);

CREATE INDEX lead_events_lead_id_idx ON public.lead_events USING btree (lead_id);

CREATE INDEX lead_events_type_created_idx ON public.lead_events USING btree (event_type, created_at DESC);

CREATE INDEX lead_events_type_idx ON public.lead_events USING btree (event_type);

CREATE UNIQUE INDEX idx_lead_group_cycles_active ON public.lead_group_cycles USING btree (company_id, group_id, cycle_id) WHERE (detached_at IS NULL);

CREATE INDEX idx_lead_group_cycles_company_attached_by ON public.lead_group_cycles USING btree (company_id, attached_by);

CREATE INDEX idx_lead_group_cycles_company_cycle_detached ON public.lead_group_cycles USING btree (company_id, cycle_id, detached_at);

CREATE INDEX idx_lead_group_cycles_company_group_detached ON public.lead_group_cycles USING btree (company_id, group_id, detached_at);

CREATE INDEX idx_lead_group_cycles_company_id ON public.lead_group_cycles USING btree (company_id);

CREATE INDEX idx_lead_group_cycles_cycle_id ON public.lead_group_cycles USING btree (cycle_id);

CREATE INDEX idx_lead_group_cycles_group_id ON public.lead_group_cycles USING btree (group_id);

CREATE INDEX idx_lead_groups_archived ON public.lead_groups USING btree (archived_at);

CREATE INDEX idx_lead_groups_company_archived ON public.lead_groups USING btree (company_id, archived_at);

CREATE INDEX idx_lead_groups_company_created_by ON public.lead_groups USING btree (company_id, created_by);

CREATE UNIQUE INDEX idx_lead_groups_company_id ON public.lead_groups USING btree (company_id, id);

CREATE INDEX lead_list_members_company_id_idx ON public.lead_list_members USING btree (company_id);

CREATE INDEX lead_list_members_lead_id_idx ON public.lead_list_members USING btree (lead_id);

CREATE INDEX lead_lists_company_id_idx ON public.lead_lists USING btree (company_id);

CREATE INDEX lead_lists_type_idx ON public.lead_lists USING btree (list_type);

CREATE INDEX lead_profiles_cnpj_idx ON public.lead_profiles USING btree (cnpj);

CREATE UNIQUE INDEX lead_profiles_company_cnpj_uniq ON public.lead_profiles USING btree (company_id, cnpj) WHERE ((cnpj IS NOT NULL) AND (cnpj <> ''::text));

CREATE UNIQUE INDEX lead_profiles_company_cpf_uniq ON public.lead_profiles USING btree (company_id, cpf) WHERE ((cpf IS NOT NULL) AND (cpf <> ''::text));

CREATE INDEX lead_profiles_company_id_idx ON public.lead_profiles USING btree (company_id);

CREATE INDEX lead_profiles_cpf_idx ON public.lead_profiles USING btree (cpf);

CREATE INDEX lead_profiles_email_idx ON public.lead_profiles USING btree (email);

CREATE INDEX lead_status_history_company_changed_at_idx ON public.lead_status_history USING btree (company_id, changed_at DESC);

CREATE INDEX lead_status_history_company_owner_changed_at_idx ON public.lead_status_history USING btree (company_id, owner_id, changed_at DESC);

CREATE INDEX lead_status_history_lead_changed_at_idx ON public.lead_status_history USING btree (lead_id, changed_at DESC);

CREATE INDEX lead_status_history_owner_changed_at_idx ON public.lead_status_history USING btree (owner_id, changed_at DESC);

CREATE INDEX idx_leads_company_cpf ON public.leads USING btree (company_id, cpf_cnpj);

CREATE INDEX idx_leads_company_deleted_at ON public.leads USING btree (company_id, deleted_at);

CREATE INDEX idx_leads_deleted_at ON public.leads USING btree (deleted_at);

CREATE INDEX idx_leads_entry_mode ON public.leads USING btree (entry_mode) WHERE (entry_mode <> 'unknown'::text);

CREATE INDEX idx_leads_first_worked_at ON public.leads USING btree (first_worked_at) WHERE (first_worked_at IS NOT NULL);

CREATE INDEX idx_leads_lead_origin_at ON public.leads USING btree (lead_origin_at) WHERE (lead_origin_at IS NOT NULL);

CREATE UNIQUE INDEX leads_company_email_norm_uniq ON public.leads USING btree (company_id, email_norm) WHERE ((email_norm IS NOT NULL) AND (email_norm <> ''::text));

CREATE UNIQUE INDEX leads_company_external_key_uniq ON public.leads USING btree (company_id, external_key) WHERE ((external_key IS NOT NULL) AND (external_key <> ''::text));

CREATE INDEX leads_company_phone_digits_idx ON public.leads USING btree (company_id, phone_digits);

CREATE UNIQUE INDEX leads_company_phone_norm_uniq ON public.leads USING btree (company_id, phone_norm) WHERE ((phone_norm IS NOT NULL) AND (phone_norm <> ''::text));

CREATE INDEX leads_next_contact_idx ON public.leads USING btree (owner_id, next_contact_at);

CREATE INDEX leads_status_idx ON public.leads USING btree (status);

CREATE INDEX pipeline_stages_pipeline_idx ON public.pipeline_stages USING btree (pipeline_id);

CREATE INDEX pipelines_company_idx ON public.pipelines USING btree (company_id);

CREATE INDEX idx_products_active ON public.products USING btree (company_id, active);

CREATE INDEX idx_products_company ON public.products USING btree (company_id);

CREATE INDEX profile_details_tipo_pessoa_idx ON public.profile_details USING btree (tipo_pessoa);

CREATE INDEX profiles_company_id_idx ON public.profiles USING btree (company_id);

CREATE INDEX profiles_company_status_idx ON public.profiles USING btree (company_id, status);

CREATE UNIQUE INDEX profiles_company_user_code_unique ON public.profiles USING btree (company_id, user_code) WHERE (user_code IS NOT NULL);

CREATE UNIQUE INDEX profiles_company_username_unique ON public.profiles USING btree (company_id, username) WHERE ((username IS NOT NULL) AND (username <> ''::text));

CREATE INDEX profiles_email_idx ON public.profiles USING btree (email);

CREATE INDEX profiles_role_idx ON public.profiles USING btree (role);

CREATE INDEX idx_revenue_extra_sources_archived_at ON public.revenue_extra_sources USING btree (archived_at);

CREATE INDEX idx_revenue_extra_sources_company_id ON public.revenue_extra_sources USING btree (company_id);

CREATE UNIQUE INDEX idx_revenue_extra_sources_unique_active_name ON public.revenue_extra_sources USING btree (company_id, name) WHERE (archived_at IS NULL);

CREATE INDEX revenue_goals_company_period ON public.revenue_goals USING btree (company_id, date_start, date_end);

CREATE UNIQUE INDEX uq_revenue_goals_with_null_owner ON public.revenue_goals USING btree (company_id, COALESCE(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), date_start, date_end);

CREATE INDEX idx_revenue_overrides_daily_company_id ON public.revenue_overrides_daily USING btree (company_id);

CREATE INDEX idx_revenue_overrides_daily_ref_date ON public.revenue_overrides_daily USING btree (ref_date);

CREATE UNIQUE INDEX idx_revenue_overrides_daily_unique ON public.revenue_overrides_daily USING btree (company_id, source_kind, source_id, ref_date);

CREATE INDEX idx_scpa_company_competency ON public.sales_cycle_period_activity USING btree (company_id, competency_id);

CREATE INDEX idx_scpa_company_competency_owner ON public.sales_cycle_period_activity USING btree (company_id, competency_id, owner_user_id);

CREATE INDEX idx_scpa_competency_lost ON public.sales_cycle_period_activity USING btree (competency_id, was_lost);

CREATE INDEX idx_scpa_competency_won ON public.sales_cycle_period_activity USING btree (competency_id, was_won);

CREATE INDEX idx_scpa_competency_worked ON public.sales_cycle_period_activity USING btree (competency_id, was_worked);

CREATE UNIQUE INDEX uq_scpa_cycle_competency ON public.sales_cycle_period_activity USING btree (cycle_id, competency_id);

CREATE INDEX idx_sales_cycles_canceled_at ON public.sales_cycles USING btree (canceled_at DESC) WHERE (status = 'cancelado'::lead_status);

CREATE INDEX idx_sales_cycles_closed_at ON public.sales_cycles USING btree (company_id, closed_at DESC) WHERE (closed_at IS NOT NULL);

CREATE INDEX idx_sales_cycles_company_group ON public.sales_cycles USING btree (company_id, current_group_id);

CREATE UNIQUE INDEX idx_sales_cycles_company_id ON public.sales_cycles USING btree (company_id, id);

CREATE INDEX idx_sales_cycles_company_lead ON public.sales_cycles USING btree (company_id, lead_id);

CREATE INDEX idx_sales_cycles_company_origin_cycle ON public.sales_cycles USING btree (company_id, origin_cycle_id) WHERE (origin_cycle_id IS NOT NULL);

CREATE INDEX idx_sales_cycles_company_owner_status ON public.sales_cycles USING btree (company_id, owner_user_id, status);

CREATE INDEX idx_sales_cycles_company_status ON public.sales_cycles USING btree (company_id, status);

CREATE INDEX idx_sales_cycles_company_status_month ON public.sales_cycles USING btree (company_id, status, stage_entered_at DESC);

CREATE INDEX idx_sales_cycles_counts_owner_group_status ON public.sales_cycles USING btree (company_id, owner_user_id, current_group_id, status);

CREATE INDEX idx_sales_cycles_current_group_id ON public.sales_cycles USING btree (current_group_id);

CREATE INDEX idx_sales_cycles_first_worked_at ON public.sales_cycles USING btree (first_worked_at) WHERE (first_worked_at IS NOT NULL);

CREATE INDEX idx_sales_cycles_invoice_id ON public.sales_cycles USING btree (invoice_id) WHERE (invoice_id IS NOT NULL);

CREATE UNIQUE INDEX idx_sales_cycles_lead_active_unique ON public.sales_cycles USING btree (company_id, lead_id) WHERE (status <> ALL (ARRAY['ganho'::lead_status, 'perdido'::lead_status]));

CREATE INDEX idx_sales_cycles_lost_at ON public.sales_cycles USING btree (lost_at DESC) WHERE (status = 'perdido'::lead_status);

CREATE INDEX idx_sales_cycles_next_action_date ON public.sales_cycles USING btree (next_action_date) WHERE (next_action_date IS NOT NULL);

CREATE INDEX idx_sales_cycles_owner_company_status ON public.sales_cycles USING btree (owner_user_id, company_id, status);

CREATE INDEX idx_sales_cycles_owner_user_id ON public.sales_cycles USING btree (owner_user_id);

CREATE INDEX idx_sales_cycles_paused_at ON public.sales_cycles USING btree (paused_at DESC) WHERE (status = 'pausado'::lead_status);

CREATE INDEX idx_sales_cycles_payment_method ON public.sales_cycles USING btree (payment_method) WHERE (payment_method IS NOT NULL);

CREATE INDEX idx_sales_cycles_pool ON public.sales_cycles USING btree (company_id, created_at DESC) WHERE (owner_user_id IS NULL);

CREATE INDEX idx_sales_cycles_pool_by_group ON public.sales_cycles USING btree (company_id, current_group_id, created_at DESC) WHERE (owner_user_id IS NULL);

CREATE INDEX idx_sales_cycles_product_id ON public.sales_cycles USING btree (product_id) WHERE (product_id IS NOT NULL);

CREATE INDEX idx_sales_cycles_pulse_company_status_owner_stage ON public.sales_cycles USING btree (company_id, status, owner_user_id, stage_entered_at) WHERE (status = ANY (ARRAY['contato'::lead_status, 'respondeu'::lead_status, 'negociacao'::lead_status]));

CREATE INDEX idx_sales_cycles_pulse_company_status_owner_updated ON public.sales_cycles USING btree (company_id, status, owner_user_id, updated_at) WHERE (status = ANY (ARRAY['contato'::lead_status, 'respondeu'::lead_status, 'negociacao'::lead_status]));

CREATE INDEX idx_sales_cycles_pulse_next_action_date ON public.sales_cycles USING btree (company_id, next_action_date) WHERE ((status = ANY (ARRAY['contato'::lead_status, 'respondeu'::lead_status, 'negociacao'::lead_status])) AND (next_action_date IS NOT NULL));

CREATE INDEX idx_sales_cycles_revenue_seller_ref_date ON public.sales_cycles USING btree (revenue_seller_ref_date) WHERE (revenue_seller_ref_date IS NOT NULL);

CREATE INDEX idx_sales_cycles_stage_entered_at ON public.sales_cycles USING btree (company_id, stage_entered_at DESC);

CREATE INDEX idx_sales_cycles_stage_entered_status ON public.sales_cycles USING btree (company_id, stage_entered_at DESC, status) WHERE (status <> 'novo'::lead_status);

CREATE INDEX idx_sales_cycles_status ON public.sales_cycles USING btree (status);

CREATE INDEX idx_sales_cycles_status_open ON public.sales_cycles USING btree (company_id, status) WHERE (status <> ALL (ARRAY['ganho'::lead_status, 'perdido'::lead_status]));

CREATE INDEX idx_sales_cycles_won_at ON public.sales_cycles USING btree (company_id, won_at DESC) WHERE (status = 'ganho'::lead_status);

CREATE INDEX idx_sales_cycles_won_owner ON public.sales_cycles USING btree (company_id, won_owner_user_id) WHERE (status = 'ganho'::lead_status);

-- -----------------------------------------------------------------------------
-- Chaves estrangeiras
-- -----------------------------------------------------------------------------

alter table only public.audit_sales_cycles add constraint audit_sales_cycles_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id);

alter table only public.audit_sales_cycles add constraint audit_sales_cycles_sales_cycle_id_fkey FOREIGN KEY (sales_cycle_id) REFERENCES sales_cycles(id) ON DELETE CASCADE;

alter table only public.company_admin_invitations add constraint company_admin_invitations_accepted_user_id_fkey FOREIGN KEY (accepted_user_id) REFERENCES auth.users(id);

alter table only public.company_admin_invitations add constraint company_admin_invitations_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

alter table only public.company_admin_invitations add constraint company_admin_invitations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

alter table only public.company_counters add constraint company_counters_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

alter table only public.company_lead_api_keys add constraint company_lead_api_keys_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

alter table only public.company_lead_api_keys add constraint company_lead_api_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table only public.company_lead_api_keys add constraint company_lead_api_keys_last_used_lead_id_fkey FOREIGN KEY (last_used_lead_id) REFERENCES leads(id) ON DELETE SET NULL;

alter table only public.company_lead_api_keys add constraint company_lead_api_keys_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table only public.company_memberships add constraint company_memberships_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

alter table only public.company_memberships add constraint company_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table only public.company_site_lead_distribution add constraint company_site_lead_distribution_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

alter table only public.company_sla_rules add constraint company_sla_rules_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

alter table only public.competencies add constraint competencies_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

alter table only public.cycle_events add constraint cycle_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

alter table only public.cycle_events add constraint cycle_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table only public.cycle_events add constraint fk_ce_cycle_company FOREIGN KEY (company_id, cycle_id) REFERENCES sales_cycles(company_id, id) ON DELETE CASCADE;

alter table only public.execution_day_calendars add constraint execution_day_calendars_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

alter table only public.execution_day_calendars add constraint execution_day_calendars_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table only public.execution_day_calendars add constraint execution_day_calendars_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table only public.lead_group_cycles add constraint fk_lgc_cycle_company FOREIGN KEY (company_id, cycle_id) REFERENCES sales_cycles(company_id, id) ON DELETE CASCADE;

alter table only public.lead_group_cycles add constraint fk_lgc_group_company FOREIGN KEY (company_id, group_id) REFERENCES lead_groups(company_id, id) ON DELETE CASCADE;

alter table only public.lead_group_cycles add constraint lead_group_cycles_attached_by_fkey FOREIGN KEY (attached_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table only public.lead_group_cycles add constraint lead_group_cycles_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

alter table only public.lead_group_cycles add constraint lead_group_cycles_detached_by_fkey FOREIGN KEY (detached_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table only public.lead_groups add constraint lead_groups_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

alter table only public.lead_groups add constraint lead_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table only public.lead_interactions add constraint lead_interactions_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

alter table only public.lead_interactions add constraint lead_interactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

alter table only public.lead_list_members add constraint lead_list_members_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

alter table only public.lead_list_members add constraint lead_list_members_list_id_fkey FOREIGN KEY (list_id) REFERENCES lead_lists(id) ON DELETE CASCADE;

alter table only public.lead_profiles add constraint lead_profiles_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

alter table only public.lead_stage_events add constraint lead_stage_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

alter table only public.lead_stage_events add constraint lead_stage_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE RESTRICT;

alter table only public.lead_user_priority add constraint lead_user_priority_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

alter table only public.lead_user_priority add constraint lead_user_priority_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table only public.leads add constraint leads_created_by_fk FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table only public.leads add constraint leads_current_pipeline_fk FOREIGN KEY (current_pipeline_id) REFERENCES pipelines(id) ON DELETE SET NULL;

alter table only public.leads add constraint leads_current_stage_fk FOREIGN KEY (current_stage_id) REFERENCES pipeline_stages(id) ON DELETE SET NULL;

alter table only public.leads add constraint leads_owner_fk FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table only public.leads add constraint leads_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table only public.pipeline_stages add constraint pipeline_stages_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE;

alter table only public.pipelines add constraint pipelines_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

alter table only public.products add constraint products_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

alter table only public.profile_details add constraint profile_details_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.profiles add constraint profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;

alter table only public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table only public.quick_actions_config add constraint quick_actions_config_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);

alter table only public.revenue_extra_sources add constraint revenue_extra_sources_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

alter table only public.revenue_extra_sources add constraint revenue_extra_sources_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table only public.revenue_overrides_daily add constraint revenue_overrides_daily_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

alter table only public.revenue_overrides_daily add constraint revenue_overrides_daily_edited_by_fkey FOREIGN KEY (edited_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table only public.sales_cycle_period_activity add constraint sales_cycle_period_activity_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

alter table only public.sales_cycle_period_activity add constraint sales_cycle_period_activity_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES competencies(id) ON DELETE CASCADE;

alter table only public.sales_cycle_period_activity add constraint sales_cycle_period_activity_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES sales_cycles(id) ON DELETE CASCADE;

alter table only public.sales_cycle_period_activity add constraint sales_cycle_period_activity_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table only public.sales_cycles add constraint fk_sales_cycles_origin_cycle_id FOREIGN KEY (origin_cycle_id) REFERENCES sales_cycles(id) ON DELETE SET NULL;

alter table only public.sales_cycles add constraint fk_sales_cycles_won_owner_user_id FOREIGN KEY (won_owner_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table only public.sales_cycles add constraint fk_sc_group_company FOREIGN KEY (company_id, current_group_id) REFERENCES lead_groups(company_id, id) ON DELETE SET NULL;

alter table only public.sales_cycles add constraint sales_cycles_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

alter table only public.sales_cycles add constraint sales_cycles_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES revenue_extra_sources(id) ON DELETE SET NULL;

alter table only public.sales_cycles add constraint sales_cycles_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

alter table only public.sales_cycles add constraint sales_cycles_lost_owner_user_id_fkey FOREIGN KEY (lost_owner_user_id) REFERENCES auth.users(id);

alter table only public.sales_cycles add constraint sales_cycles_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table only public.sales_cycles add constraint sales_cycles_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

alter table only public.sla_rules add constraint sla_rules_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- -----------------------------------------------------------------------------
-- Funções
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_full_name text;
BEGIN
  v_full_name := COALESCE(
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NEW.email,
    'Usuário'
  );

  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    is_active_global,
    is_platform_admin,
    created_at
  )
  VALUES (
    NEW.id,
    v_full_name,
    NEW.email,
    true,
    false,
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      email = COALESCE(EXCLUDED.email, public.profiles.email),
      is_active_global = COALESCE(public.profiles.is_active_global, true);

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tempo_medio_por_etapa(empresa_id uuid)
 RETURNS TABLE(etapa text, horas_medias numeric)
 LANGUAGE sql
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  select
    from_status as etapa,
    round(avg(seconds_in_from_status) / 3600.0, 2) as horas_medias
  from public.lead_stage_events
  where company_id = empresa_id
  group by from_status
$function$
;

CREATE OR REPLACE FUNCTION public.gargalo_funil(empresa_id uuid)
 RETURNS TABLE(from_status text, total_perdidos bigint)
 LANGUAGE sql
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  select
    from_status,
    count(*) as total_perdidos
  from public.lead_stage_events
  where company_id = empresa_id
    and to_status = 'perdido'
  group by from_status
$function$
;

CREATE OR REPLACE FUNCTION public.fechamentos_por_consultora(empresa_id uuid)
 RETURNS TABLE(full_name text, total_fechamentos bigint)
 LANGUAGE sql
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  select
    p.full_name,
    count(*) as total_fechamentos
  from public.lead_stage_events e
  join public.profiles p on p.id = e.user_id
  where e.company_id = empresa_id
    and e.to_status = 'fechado'
  group by p.full_name
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.current_company_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_count integer;
  v_company_id uuid;
BEGIN
  SELECT COUNT(*)
    INTO v_count
  FROM public.company_memberships cm
  WHERE cm.user_id = auth.uid()
    AND cm.is_active = true;

  IF v_count <> 1 THEN
    RETURN NULL;
  END IF;

  SELECT cm.company_id
    INTO v_company_id
  FROM public.company_memberships cm
  WHERE cm.user_id = auth.uid()
    AND cm.is_active = true
  LIMIT 1;

  RETURN v_company_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public."current_role"()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select role
  from public.profiles
  where id = auth.uid()
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.sync_profile_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
begin
  update public.profiles
  set email = new.email
  where id = new.id;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.assign_leads(p_company_id uuid, p_lead_ids uuid[], p_mode text, p_to_owner_id uuid, p_seller_ids uuid[], p_only_if_pool boolean DEFAULT true)
 RETURNS TABLE(assigned_count integer, skipped_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_now timestamptz := now();
  v_assigned int := 0;
  v_skipped int := 0;
  v_sellers uuid[];
  v_seller_count int := 0;
begin
  if p_company_id is null then
    raise exception 'company_id obrigatório';
  end if;

  if p_lead_ids is null or array_length(p_lead_ids, 1) is null then
    raise exception 'lead_ids obrigatório';
  end if;

  if p_mode not in ('manual', 'round_robin') then
    raise exception 'mode inválido. Use manual ou round_robin';
  end if;

  if p_mode = 'manual' and p_to_owner_id is null then
    raise exception 'to_owner_id obrigatório no modo manual';
  end if;

  if p_mode = 'round_robin' then
    if p_seller_ids is null or array_length(p_seller_ids, 1) is null then
      raise exception 'seller_ids obrigatório no modo round_robin';
    end if;
    v_sellers := p_seller_ids;
    v_seller_count := array_length(v_sellers, 1);
    if v_seller_count < 1 then
      raise exception 'seller_ids vazio';
    end if;
  end if;

  -- 1) Materializa leads elegíveis e TRAVA (FOR UPDATE) sem window functions
  create temporary table tmp_eligible_leads on commit drop as
  select l.id, l.owner_id, l.created_at
  from public.leads l
  where l.company_id = p_company_id
    and l.id = any(p_lead_ids)
    and (not p_only_if_pool or l.owner_id is null);

  -- trava as linhas elegíveis (agora sem window function)
  perform 1
  from public.leads l
  join tmp_eligible_leads t on t.id = l.id
  for update;

  select count(*) into v_assigned from tmp_eligible_leads;
  v_skipped := coalesce(array_length(p_lead_ids, 1), 0) - v_assigned;

  if v_assigned = 0 then
    return query select 0::int, v_skipped::int;
    return;
  end if;

  if p_mode = 'manual' then
    update public.leads l
      set owner_id = p_to_owner_id
    where l.id in (select id from tmp_eligible_leads);

    insert into public.lead_events (
      company_id, lead_id, user_id,
      event_type,
      from_stage, to_stage,
      seconds_in_from_stage,
      metadata,
      created_at
    )
    select
      p_company_id,
      t.id,
      auth.uid(),
      'owner_changed',
      null, null,
      null,
      jsonb_build_object(
        'mode', 'manual',
        'from_owner', t.owner_id,
        'to_owner', p_to_owner_id
      ),
      v_now
    from tmp_eligible_leads t;

  else
    -- 2) Agora sim: window function sem FOR UPDATE
    create temporary table tmp_assignment on commit drop as
    select
      t.id,
      t.owner_id as from_owner,
      v_sellers[((row_number() over (order by t.created_at asc, t.id asc) - 1) % v_seller_count) + 1] as to_owner
    from tmp_eligible_leads t;

    update public.leads l
      set owner_id = a.to_owner
    from tmp_assignment a
    where l.id = a.id;

    insert into public.lead_events (
      company_id, lead_id, user_id,
      event_type,
      from_stage, to_stage,
      seconds_in_from_stage,
      metadata,
      created_at
    )
    select
      p_company_id,
      a.id,
      auth.uid(),
      'owner_changed',
      null, null,
      null,
      jsonb_build_object(
        'mode', 'round_robin',
        'from_owner', a.from_owner,
        'to_owner', a.to_owner,
        'seller_ids', v_sellers
      ),
      v_now
    from tmp_assignment a;
  end if;

  return query select v_assigned::int, v_skipped::int;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.return_owner_leads_to_pool(p_company_id uuid, p_owner_id uuid, p_limit integer, p_status text, p_search text)
 RETURNS TABLE(returned_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_returned int := 0;
  v_now timestamptz := now();
begin
  if v_actor is null then
    raise exception 'not allowed';
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.id = v_actor
      and p.company_id = p_company_id
      and p.role = 'admin'
  )
  into v_is_admin;

  if not v_is_admin then
    raise exception 'not allowed';
  end if;

  if p_company_id is null then
    raise exception 'company_id obrigatório';
  end if;

  if p_owner_id is null then
    raise exception 'owner_id obrigatório';
  end if;

  if p_limit is null or p_limit <= 0 then
    raise exception 'limit deve ser > 0';
  end if;

  create temporary table tmp_to_return on commit drop as
  select l.id, l.owner_id
  from public.leads l
  where l.company_id = p_company_id
    and l.owner_id = p_owner_id
    and (p_status is null or l.status = p_status)
    and (
      v_search is null
      or l.name ilike ('%' || v_search || '%')
      or l.phone ilike ('%' || v_search || '%')
    )
  order by l.created_at asc, l.id asc
  limit p_limit;

  perform 1
  from public.leads l
  join tmp_to_return t on t.id = l.id
  for update;

  select count(*) into v_returned from tmp_to_return;

  if v_returned = 0 then
    return query select 0::int;
    return;
  end if;

  update public.leads l
    set owner_id = null
  where l.id in (select id from tmp_to_return);

  insert into public.lead_events (
    company_id, lead_id, user_id,
    event_type,
    from_stage, to_stage,
    seconds_in_from_stage,
    metadata,
    created_at
  )
  select
    p_company_id,
    t.id,
    v_actor,
    'owner_changed',
    null, null,
    null,
    jsonb_build_object(
      'mode', 'return_to_pool',
      'from_owner', t.owner_id,
      'to_owner', null
    ),
    v_now
  from tmp_to_return t;

  return query select v_returned::int;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reassign_owner_leads(p_company_id uuid, p_from_owner_id uuid, p_to_owner_id uuid, p_limit integer, p_status text, p_search text, p_order_mode text)
 RETURNS TABLE(changed_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_now timestamptz := now();
  v_changed int := 0;

  v_take int := null;
  v_search text := null;
  v_order text := lower(nullif(trim(coalesce(p_order_mode, '')), ''));

  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
begin
  if v_actor is null then
    raise exception 'not allowed';
  end if;

  -- valida admin e company
  select exists (
    select 1
    from public.profiles p
    where p.id = v_actor
      and p.company_id = p_company_id
      and p.role = 'admin'
  )
  into v_is_admin;

  if not v_is_admin then
    raise exception 'not allowed';
  end if;

  if p_company_id is null then
    raise exception 'company_id obrigatório';
  end if;

  if p_from_owner_id is null then
    raise exception 'from_owner_id obrigatório';
  end if;

  if p_limit is null or p_limit <= 0 then
    raise exception 'limit deve ser > 0';
  end if;
  v_take := p_limit;

  v_search := nullif(trim(coalesce(p_search, '')), '');

  -- normaliza order
  if v_order is null then
    v_order := 'oldest';
  end if;
  if v_order not in ('oldest', 'newest', 'random') then
    raise exception 'order_mode inválido. Use oldest, newest ou random';
  end if;

  -- materializa candidatos (somente leads do vendedor de origem)
  create temporary table tmp_pick on commit drop as
  select l.id, l.owner_id, l.created_at
  from public.leads l
  where l.company_id = p_company_id
    and l.owner_id = p_from_owner_id
    and (p_status is null or l.status = p_status)
    and (
      v_search is null
      or l.name ilike ('%' || v_search || '%')
      or l.phone ilike ('%' || v_search || '%')
    )
  order by
    case when v_order = 'random' then random() else null end,
    case when v_order = 'newest' then l.created_at end desc,
    case when v_order = 'newest' then l.id end desc,
    case when v_order = 'oldest' then l.created_at end asc,
    case when v_order = 'oldest' then l.id end asc
  limit v_take;

  -- lock para evitar corrida
  perform 1
  from public.leads l
  join tmp_pick t on t.id = l.id
  for update;

  select count(*) into v_changed from tmp_pick;

  if v_changed = 0 then
    return query select 0::int;
    return;
  end if;

  -- atualiza owner
  update public.leads l
    set owner_id = p_to_owner_id
  where l.id in (select id from tmp_pick);

  -- registra eventos (mesmo padrão do assign_leads)
  insert into public.lead_events (
    company_id, lead_id, user_id,
    event_type,
    from_stage, to_stage,
    seconds_in_from_stage,
    metadata,
    created_at
  )
  select
    p_company_id,
    t.id,
    v_actor,
    'owner_changed',
    null, null,
    null,
    jsonb_build_object(
      'mode', 'manual',
      'source', 'owner',
      'from_owner', t.owner_id,
      'to_owner', p_to_owner_id,
      'order_mode', v_order
    ),
    v_now
  from tmp_pick t;

  return query select v_changed::int;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.round_robin_from_owner_leads(p_company_id uuid, p_from_owner_id uuid, p_seller_ids uuid[], p_limit integer, p_status text, p_search text, p_order_mode text)
 RETURNS TABLE(changed_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;

  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_order text := lower(nullif(trim(coalesce(p_order_mode, '')), ''));
  v_changed int := 0;

  v_sellers uuid[];
  v_seller_count int := 0;

  v_now timestamptz := now();
begin
  if v_actor is null then
    raise exception 'not allowed';
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.id = v_actor
      and p.company_id = p_company_id
      and p.role = 'admin'
  )
  into v_is_admin;

  if not v_is_admin then
    raise exception 'not allowed';
  end if;

  if p_company_id is null then
    raise exception 'company_id obrigatório';
  end if;

  if p_from_owner_id is null then
    raise exception 'from_owner_id obrigatório';
  end if;

  if p_limit is null or p_limit <= 0 then
    raise exception 'limit deve ser > 0';
  end if;

  if p_seller_ids is null or array_length(p_seller_ids, 1) is null then
    raise exception 'seller_ids obrigatório';
  end if;

  -- remove o vendedor de origem
  v_sellers := array_remove(p_seller_ids, p_from_owner_id);
  v_seller_count := array_length(v_sellers, 1);

  if v_seller_count is null or v_seller_count < 1 then
    raise exception 'seller_ids inválido: após remover o vendedor de origem, não sobrou nenhum destino';
  end if;

  create temporary table tmp_src on commit drop as
  select l.id, l.owner_id, l.created_at
  from public.leads l
  where l.company_id = p_company_id
    and l.owner_id = p_from_owner_id
    and (p_status is null or l.status = p_status)
    and (
      v_search is null
      or l.name ilike ('%' || v_search || '%')
      or l.phone ilike ('%' || v_search || '%')
    )
  order by
    case when v_order = 'random' then random() else null end,
    case when v_order = 'newest' then l.created_at end desc,
    case when v_order = 'newest' then l.id end desc,
    case when v_order is null or v_order = 'oldest' then l.created_at end asc,
    case when v_order is null or v_order = 'oldest' then l.id end asc
  limit p_limit;

  perform 1
  from public.leads l
  join tmp_src t on t.id = l.id
  for update;

  select count(*) into v_changed from tmp_src;

  if v_changed = 0 then
    return query select 0::int;
    return;
  end if;

  create temporary table tmp_assign on commit drop as
  select
    t.id,
    t.owner_id as from_owner,
    v_sellers[((row_number() over (order by t.created_at asc, t.id asc) - 1) % v_seller_count) + 1] as to_owner
  from tmp_src t;

  update public.leads l
    set owner_id = a.to_owner
  from tmp_assign a
  where l.id = a.id;

  insert into public.lead_events (
    company_id, lead_id, user_id,
    event_type,
    from_stage, to_stage,
    seconds_in_from_stage,
    metadata,
    created_at
  )
  select
    p_company_id,
    a.id,
    v_actor,
    'owner_changed',
    null, null,
    null,
    jsonb_build_object(
      'mode', 'round_robin_from_owner',
      'from_owner', a.from_owner,
      'to_owner', a.to_owner,
      'seller_ids', v_sellers,
      'order_mode', coalesce(v_order, 'oldest')
    ),
    v_now
  from tmp_assign a;

  return query select v_changed::int;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.assign_leads(p_company_id uuid, p_source text, p_limit integer, p_lead_ids uuid[], p_status text, p_search text, p_mode text, p_to_owner_id uuid, p_seller_ids uuid[], p_only_if_pool boolean, p_order_mode text DEFAULT 'oldest'::text)
 RETURNS TABLE(assigned_count integer, skipped_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_now timestamptz := now();
  v_assigned int := 0;
  v_skipped int := 0;

  v_sellers uuid[];
  v_seller_count int := 0;

  v_take int := null;
  v_search text := null;
  v_order text := lower(nullif(trim(coalesce(p_order_mode, '')), ''));

  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
begin
  if v_actor is null then
    raise exception 'not allowed';
  end if;

  -- valida admin e company
  select exists (
    select 1
    from public.profiles p
    where p.id = v_actor
      and p.company_id = p_company_id
      and p.role = 'admin'
  )
  into v_is_admin;

  if not v_is_admin then
    raise exception 'not allowed';
  end if;

  if p_company_id is null then
    raise exception 'company_id obrigatório';
  end if;

  if p_source not in ('selected', 'pool') then
    raise exception 'source inválido. Use selected ou pool';
  end if;

  if p_mode not in ('manual', 'round_robin') then
    raise exception 'mode inválido. Use manual ou round_robin';
  end if;

  -- normaliza order
  if v_order is null then
    v_order := 'oldest';
  end if;
  if v_order not in ('oldest', 'newest', 'random') then
    raise exception 'order_mode inválido. Use oldest, newest ou random';
  end if;

  -- manual: p_to_owner_id pode ser null => devolver ao POOL
  if p_mode = 'round_robin' then
    if p_seller_ids is null or array_length(p_seller_ids, 1) is null then
      raise exception 'seller_ids obrigatório no modo round_robin';
    end if;
    v_sellers := p_seller_ids;
    v_seller_count := array_length(v_sellers, 1);
    if v_seller_count < 1 then
      raise exception 'seller_ids vazio';
    end if;
  end if;

  if p_limit is not null then
    if p_limit <= 0 then
      raise exception 'limit deve ser > 0';
    end if;
    v_take := p_limit;
  end if;

  v_search := nullif(trim(coalesce(p_search, '')), '');

  if p_source = 'selected' then
    if p_lead_ids is null or array_length(p_lead_ids, 1) is null then
      raise exception 'lead_ids obrigatório quando source=selected';
    end if;
  end if;

  if p_source = 'pool' then
    if v_take is null then
      raise exception 'limit obrigatório quando source=pool';
    end if;
  end if;

  -- materializa elegíveis
  create temporary table tmp_eligible_leads on commit drop as
  select l.id, l.owner_id, l.created_at
  from public.leads l
  where l.company_id = p_company_id
    and (
      (p_source = 'selected' and l.id = any(p_lead_ids))
      or
      (p_source = 'pool')
    )
    and (not p_only_if_pool or l.owner_id is null)
    and (p_source <> 'pool' or l.owner_id is null)
    and (p_status is null or l.status = p_status)
    and (
      v_search is null
      or l.name ilike ('%' || v_search || '%')
      or l.phone ilike ('%' || v_search || '%')
    )
  order by
    case when v_order = 'random' then random() else null end,
    case when v_order = 'newest' then l.created_at end desc,
    case when v_order = 'newest' then l.id end desc,
    case when v_order = 'oldest' then l.created_at end asc,
    case when v_order = 'oldest' then l.id end asc
  limit case
    when p_source = 'pool' then v_take
    else coalesce(v_take, 1000000000)
  end;

  -- lock
  perform 1
  from public.leads l
  join tmp_eligible_leads t on t.id = l.id
  for update;

  select count(*) into v_assigned from tmp_eligible_leads;

  if p_source = 'selected' then
    v_skipped := coalesce(array_length(p_lead_ids, 1), 0) - v_assigned;
  else
    v_skipped := greatest(v_take - v_assigned, 0);
  end if;

  if v_assigned = 0 then
    return query select 0::int, v_skipped::int;
    return;
  end if;

  if p_mode = 'manual' then
    update public.leads l
      set owner_id = p_to_owner_id
    where l.id in (select id from tmp_eligible_leads);

    insert into public.lead_events (
      company_id, lead_id, user_id,
      event_type,
      from_stage, to_stage,
      seconds_in_from_stage,
      metadata,
      created_at
    )
    select
      p_company_id,
      t.id,
      v_actor,
      'owner_changed',
      null, null,
      null,
      jsonb_build_object(
        'mode', 'manual',
        'source', p_source,
        'from_owner', t.owner_id,
        'to_owner', p_to_owner_id,
        'order_mode', v_order
      ),
      v_now
    from tmp_eligible_leads t;

  else
    create temporary table tmp_assignment on commit drop as
    select
      t.id,
      t.owner_id as from_owner,
      v_sellers[((row_number() over (order by t.created_at asc, t.id asc) - 1) % v_seller_count) + 1] as to_owner
    from tmp_eligible_leads t;

    update public.leads l
      set owner_id = a.to_owner
    from tmp_assignment a
    where l.id = a.id;

    insert into public.lead_events (
      company_id, lead_id, user_id,
      event_type,
      from_stage, to_stage,
      seconds_in_from_stage,
      metadata,
      created_at
    )
    select
      p_company_id,
      a.id,
      v_actor,
      'owner_changed',
      null, null,
      null,
      jsonb_build_object(
        'mode', 'round_robin',
        'source', p_source,
        'from_owner', a.from_owner,
        'to_owner', a.to_owner,
        'seller_ids', v_sellers,
        'order_mode', v_order
      ),
      v_now
    from tmp_assignment a;
  end if;

  return query select v_assigned::int, v_skipped::int;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.seller_get_context()
 RETURNS TABLE(profile_id uuid, company_id uuid, role text, email text, full_name text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  select
    p.id as profile_id,
    p.company_id,
    p.role,
    p.email,
    p.full_name
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.report_ai_top_objections(p_company_id uuid, p_since timestamp with time zone, p_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10)
 RETURNS TABLE(item text, count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  select
    trim(x) as item,
    count(*) as count
  from public.lead_conversation_analyses a
  cross join lateral unnest(a.objections) as x
  where a.company_id = p_company_id
    and a.created_at >= p_since
    and (p_user_id is null or a.user_id = p_user_id)
    and coalesce(trim(x), '') <> ''
  group by trim(x)
  order by count desc
  limit p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.report_ai_top_next_actions(p_company_id uuid, p_since timestamp with time zone, p_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10)
 RETURNS TABLE(item text, count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  select
    trim(x) as item,
    count(*) as count
  from public.lead_conversation_analyses a
  cross join lateral unnest(a.next_actions) as x
  where a.company_id = p_company_id
    and a.created_at >= p_since
    and (p_user_id is null or a.user_id = p_user_id)
    and coalesce(trim(x), '') <> ''
  group by trim(x)
  order by count desc
  limit p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.log_lead_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
begin
  if new.status is distinct from old.status then
    insert into public.lead_status_history (
      company_id,
      lead_id,
      owner_id,
      from_status,
      to_status,
      changed_at
    ) values (
      new.company_id,
      new.id,
      new.owner_id,
      old.status,
      new.status,
      now()
    );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_funnel_metrics(p_company_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_owner_id uuid DEFAULT NULL::uuid, p_goal_closed integer DEFAULT NULL::integer)
 RETURNS TABLE(leads_disponiveis integer, contatados integer, respondeu integer, negociacao integer, fechado integer, perdido integer, taxa_esforco numeric, taxa_resposta numeric, taxa_negociacao numeric, taxa_fechamento numeric, taxa_final_real numeric, indice_100_20 numeric, fechamentos_previstos_real numeric, fechamentos_previstos_100_20 numeric, contatos_necessarios numeric, contatos_faltantes numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
with
last_before as (
  select distinct on (h.lead_id)
    h.lead_id,
    h.owner_id,
    h.to_status as status_at_start
  from public.lead_status_history h
  where h.company_id = p_company_id
    and h.changed_at < p_start
    and (p_owner_id is null or h.owner_id = p_owner_id)
  order by h.lead_id, h.changed_at desc
),
first_entry_in_period as (
  select distinct on (h.lead_id, h.to_status)
    h.lead_id,
    h.owner_id,
    h.to_status
  from public.lead_status_history h
  where h.company_id = p_company_id
    and h.changed_at >= p_start
    and h.changed_at < p_end
    and (p_owner_id is null or h.owner_id = p_owner_id)
    and h.to_status in ('novo','contato','respondeu','negociacao','fechado','perdido')
  order by h.lead_id, h.to_status, h.changed_at asc
),
cnt as (
  select
    count(*) filter (where to_status = 'novo')        as novos_no_periodo,
    count(*) filter (where to_status = 'contato')     as contato_no_periodo,
    count(*) filter (where to_status = 'respondeu')   as respondeu_no_periodo,
    count(*) filter (where to_status = 'negociacao')  as negociacao_no_periodo,
    count(*) filter (where to_status = 'fechado')     as fechado_no_periodo,
    count(*) filter (where to_status = 'perdido')     as perdido_no_periodo
  from first_entry_in_period
),
stock_novo_inicio as (
  select count(*) as novo_no_inicio
  from last_before
  where status_at_start = 'novo'
),
open_work_at_start as (
  select count(*) as contato_em_aberto_no_inicio
  from last_before
  where status_at_start in ('contato','respondeu','negociacao')
),
base as (
  select
    (select novo_no_inicio from stock_novo_inicio)::numeric
      + (select novos_no_periodo from cnt)::numeric
      as leads_disponiveis,

    (select contato_no_periodo from cnt)::numeric
      + (select contato_em_aberto_no_inicio from open_work_at_start)::numeric
      as contatados,

    (select respondeu_no_periodo from cnt)::numeric as respondeu,
    (select negociacao_no_periodo from cnt)::numeric as negociacao,
    (select fechado_no_periodo from cnt)::numeric as fechado,
    (select perdido_no_periodo from cnt)::numeric as perdido
)
select
  leads_disponiveis::int,
  contatados::int,
  respondeu::int,
  negociacao::int,
  fechado::int,
  perdido::int,

  case when leads_disponiveis > 0 then contatados / leads_disponiveis else 0 end as taxa_esforco,
  case when contatados > 0 then respondeu / contatados else 0 end as taxa_resposta,
  case when respondeu > 0 then negociacao / respondeu else 0 end as taxa_negociacao,
  case when negociacao > 0 then fechado / negociacao else 0 end as taxa_fechamento,
  case when contatados > 0 then fechado / contatados else 0 end as taxa_final_real,
  case when contatados > 0 then (fechado / contatados) / 0.20 else 0 end as indice_100_20,

  (leads_disponiveis
    * (case when leads_disponiveis > 0 then contatados / leads_disponiveis else 0 end)
    * (case when contatados > 0 then fechado / contatados else 0 end)
  ) as fechamentos_previstos_real,

  (leads_disponiveis
    * (case when leads_disponiveis > 0 then contatados / leads_disponiveis else 0 end)
    * 0.20
  ) as fechamentos_previstos_100_20,

  case
    when p_goal_closed is null then null
    when contatados = 0 then null
    when (fechado / nullif(contatados,0)) = 0 then null
    else ceil(p_goal_closed / (fechado / contatados))
  end as contatos_necessarios,

  case
    when p_goal_closed is null then null
    when contatados = 0 then null
    when (fechado / nullif(contatados,0)) = 0 then null
    else greatest(0, ceil(p_goal_closed / (fechado / contatados)) - contatados)
  end as contatos_faltantes
from base;
$function$
;

CREATE OR REPLACE FUNCTION public.get_funnel_metrics_group(p_company_id uuid, p_owner_ids uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_goal_closed integer DEFAULT NULL::integer)
 RETURNS TABLE(leads_disponiveis integer, contatados integer, respondeu integer, negociacao integer, fechado integer, perdido integer, taxa_esforco numeric, taxa_resposta numeric, taxa_negociacao numeric, taxa_fechamento numeric, taxa_final_real numeric, indice_100_20 numeric, fechamentos_previstos_real numeric, fechamentos_previstos_100_20 numeric, contatos_necessarios numeric, contatos_faltantes numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
with
last_before as (
  select distinct on (h.lead_id)
    h.lead_id,
    h.owner_id,
    h.to_status as status_at_start
  from public.lead_status_history h
  where h.company_id = p_company_id
    and h.changed_at < p_start
    and h.owner_id = any(p_owner_ids)
  order by h.lead_id, h.changed_at desc
),
first_entry_in_period as (
  select distinct on (h.lead_id, h.to_status)
    h.lead_id,
    h.owner_id,
    h.to_status
  from public.lead_status_history h
  where h.company_id = p_company_id
    and h.changed_at >= p_start
    and h.changed_at < p_end
    and h.owner_id = any(p_owner_ids)
    and h.to_status in ('novo','contato','respondeu','negociacao','fechado','perdido')
  order by h.lead_id, h.to_status, h.changed_at asc
),
cnt as (
  select
    count(*) filter (where to_status = 'novo')        as novos_no_periodo,
    count(*) filter (where to_status = 'contato')     as contato_no_periodo,
    count(*) filter (where to_status = 'respondeu')   as respondeu_no_periodo,
    count(*) filter (where to_status = 'negociacao')  as negociacao_no_periodo,
    count(*) filter (where to_status = 'fechado')     as fechado_no_periodo,
    count(*) filter (where to_status = 'perdido')     as perdido_no_periodo
  from first_entry_in_period
),
stock_novo_inicio as (
  select count(*) as novo_no_inicio
  from last_before
  where status_at_start = 'novo'
),
open_work_at_start as (
  select count(*) as contato_em_aberto_no_inicio
  from last_before
  where status_at_start in ('contato','respondeu','negociacao')
),
base as (
  select
    (select novo_no_inicio from stock_novo_inicio)::numeric
      + (select novos_no_periodo from cnt)::numeric
      as leads_disponiveis,

    (select contato_no_periodo from cnt)::numeric
      + (select contato_em_aberto_no_inicio from open_work_at_start)::numeric
      as contatados,

    (select respondeu_no_periodo from cnt)::numeric as respondeu,
    (select negociacao_no_periodo from cnt)::numeric as negociacao,
    (select fechado_no_periodo from cnt)::numeric as fechado,
    (select perdido_no_periodo from cnt)::numeric as perdido
)
select
  leads_disponiveis::int,
  contatados::int,
  respondeu::int,
  negociacao::int,
  fechado::int,
  perdido::int,

  case when leads_disponiveis > 0 then contatados / leads_disponiveis else 0 end as taxa_esforco,
  case when contatados > 0 then respondeu / contatados else 0 end as taxa_resposta,
  case when respondeu > 0 then negociacao / respondeu else 0 end as taxa_negociacao,
  case when negociacao > 0 then fechado / negociacao else 0 end as taxa_fechamento,
  case when contatados > 0 then fechado / contatados else 0 end as taxa_final_real,
  case when contatados > 0 then (fechado / contatados) / 0.20 else 0 end as indice_100_20,

  (leads_disponiveis
    * (case when leads_disponiveis > 0 then contatados / leads_disponiveis else 0 end)
    * (case when contatados > 0 then fechado / contatados else 0 end)
  ) as fechamentos_previstos_real,

  (leads_disponiveis
    * (case when leads_disponiveis > 0 then contatados / leads_disponiveis else 0 end)
    * 0.20
  ) as fechamentos_previstos_100_20,

  case
    when p_goal_closed is null then null
    when contatados = 0 then null
    when (fechado / nullif(contatados,0)) = 0 then null
    else ceil(p_goal_closed / (fechado / contatados))
  end as contatos_necessarios,

  case
    when p_goal_closed is null then null
    when contatados = 0 then null
    when (fechado / nullif(contatados,0)) = 0 then null
    else greatest(0, ceil(p_goal_closed / (fechado / contatados)) - contatados)
  end as contatos_faltantes
from base;
$function$
;

CREATE OR REPLACE FUNCTION public.get_funnel_metrics_for_profiles(p_company_id uuid, p_profile_ids uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_goal_closed integer DEFAULT NULL::integer)
 RETURNS TABLE(leads_disponiveis integer, contatados integer, respondeu integer, negociacao integer, fechado integer, perdido integer, taxa_esforco numeric, taxa_resposta numeric, taxa_negociacao numeric, taxa_fechamento numeric, taxa_final_real numeric, indice_100_20 numeric, fechamentos_previstos_real numeric, fechamentos_previstos_100_20 numeric, contatos_necessarios numeric, contatos_faltantes numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
with
last_before as (
  select distinct on (h.lead_id)
    h.lead_id,
    h.owner_id,
    h.to_status as status_at_start
  from public.lead_status_history h
  where h.company_id = p_company_id
    and h.changed_at < p_start
    and h.owner_id = any(p_profile_ids)
  order by h.lead_id, h.changed_at desc
),
first_entry_in_period as (
  select distinct on (h.lead_id, h.to_status)
    h.lead_id,
    h.owner_id,
    h.to_status
  from public.lead_status_history h
  where h.company_id = p_company_id
    and h.changed_at >= p_start
    and h.changed_at < p_end
    and h.owner_id = any(p_profile_ids)
    and h.to_status in ('novo','contato','respondeu','negociacao','fechado','perdido')
  order by h.lead_id, h.to_status, h.changed_at asc
),
cnt as (
  select
    count(*) filter (where to_status = 'novo')        as novos_no_periodo,
    count(*) filter (where to_status = 'contato')     as contato_no_periodo,
    count(*) filter (where to_status = 'respondeu')   as respondeu_no_periodo,
    count(*) filter (where to_status = 'negociacao')  as negociacao_no_periodo,
    count(*) filter (where to_status = 'fechado')     as fechado_no_periodo,
    count(*) filter (where to_status = 'perdido')     as perdido_no_periodo
  from first_entry_in_period
),
stock_novo_inicio as (
  select count(*) as novo_no_inicio
  from last_before
  where status_at_start = 'novo'
),
open_work_at_start as (
  select count(*) as contato_em_aberto_no_inicio
  from last_before
  where status_at_start in ('contato','respondeu','negociacao')
),
base as (
  select
    (select novo_no_inicio from stock_novo_inicio)::numeric
      + (select novos_no_periodo from cnt)::numeric
      as leads_disponiveis,

    (select contato_no_periodo from cnt)::numeric
      + (select contato_em_aberto_no_inicio from open_work_at_start)::numeric
      as contatados,

    (select respondeu_no_periodo from cnt)::numeric as respondeu,
    (select negociacao_no_periodo from cnt)::numeric as negociacao,
    (select fechado_no_periodo from cnt)::numeric as fechado,
    (select perdido_no_periodo from cnt)::numeric as perdido
)
select
  leads_disponiveis::int,
  contatados::int,
  respondeu::int,
  negociacao::int,
  fechado::int,
  perdido::int,

  case when leads_disponiveis > 0 then contatados / leads_disponiveis else 0 end as taxa_esforco,
  case when contatados > 0 then respondeu / contatados else 0 end as taxa_resposta,
  case when respondeu > 0 then negociacao / respondeu else 0 end as taxa_negociacao,
  case when negociacao > 0 then fechado / negociacao else 0 end as taxa_fechamento,
  case when contatados > 0 then fechado / contatados else 0 end as taxa_final_real,
  case when contatados > 0 then (fechado / contatados) / 0.20 else 0 end as indice_100_20,

  (leads_disponiveis
    * (case when leads_disponiveis > 0 then contatados / leads_disponiveis else 0 end)
    * (case when contatados > 0 then fechado / contatados else 0 end)
  ) as fechamentos_previstos_real,

  (leads_disponiveis
    * (case when leads_disponiveis > 0 then contatados / leads_disponiveis else 0 end)
    * 0.20
  ) as fechamentos_previstos_100_20,

  case
    when p_goal_closed is null then null
    when contatados = 0 then null
    when (fechado / nullif(contatados,0)) = 0 then null
    else ceil(p_goal_closed / (fechado / contatados))
  end as contatos_necessarios,

  case
    when p_goal_closed is null then null
    when contatados = 0 then null
    when (fechado / nullif(contatados,0)) = 0 then null
    else greatest(0, ceil(p_goal_closed / (fechado / contatados)) - contatados)
  end as contatos_faltantes
from base;
$function$
;

CREATE OR REPLACE FUNCTION public.get_avg_ticket_won(p_company_id uuid, p_days integer DEFAULT 90)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  select coalesce(avg(l.deal_value), 0)::numeric
  from public.leads l
  join public.pipeline_stages s on s.id = l.current_stage_id
  where l.company_id = p_company_id
    and l.deal_value is not null
    and l.deal_value > 0
    and s.key = 'won'
    and coalesce(l.stage_entered_at, l.created_at) >= (now() - (p_days || ' days')::interval);
$function$
;

CREATE OR REPLACE FUNCTION public.seller_move_lead_stage(p_company_id uuid, p_lead_id uuid, p_to_status text, p_reason text DEFAULT NULL::text, p_deal_value numeric DEFAULT NULL::numeric, p_to_stage_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(ok boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_from_status text;
  v_prev_stage_entered_at timestamptz;
  v_created_at timestamptz;
  v_now timestamptz := now();
  v_seconds int;
  v_to_status text := lower(coalesce(nullif(trim(p_to_status), ''), ''));
begin
  if v_actor is null then
    raise exception 'not allowed';
  end if;

  if p_company_id is null then
    raise exception 'company_id obrigatório';
  end if;

  if p_lead_id is null then
    raise exception 'lead_id obrigatório';
  end if;

  if v_to_status is null or v_to_status = '' then
    raise exception 'to_status obrigatório';
  end if;

  -- trava e valida que o lead é do vendedor (owner_id = auth.uid()) e da empresa
  select l.status, l.stage_entered_at, l.created_at
    into v_from_status, v_prev_stage_entered_at, v_created_at
  from public.leads l
  where l.id = p_lead_id
    and l.company_id = p_company_id
    and l.owner_id = v_actor
  for update;

  if v_from_status is null then
    raise exception 'lead not found or not owned';
  end if;

  if lower(v_from_status) = v_to_status then
    return query select true;
    return;
  end if;

  v_seconds := greatest(
    1,
    floor(extract(epoch from (v_now - coalesce(v_prev_stage_entered_at, v_created_at))))
  );

  -- Regra: se movendo para "fechado", exige deal_value e stage_id (won)
  if v_to_status = 'fechado' then
    if p_deal_value is null or p_deal_value <= 0 then
      raise exception 'deal_value obrigatório e deve ser > 0 para fechar como ganho';
    end if;
    if p_to_stage_id is null then
      raise exception 'to_stage_id obrigatório para fechar como ganho';
    end if;

    update public.leads l
    set status = v_to_status,
        stage_entered_at = v_now,
        deal_value = p_deal_value,
        current_stage_id = p_to_stage_id
    where l.id = p_lead_id
      and l.company_id = p_company_id
      and l.owner_id = v_actor;
  else
    update public.leads l
    set status = v_to_status,
        stage_entered_at = v_now
    where l.id = p_lead_id
      and l.company_id = p_company_id
      and l.owner_id = v_actor;
  end if;

  insert into public.lead_events(
    company_id, lead_id, user_id,
    event_type,
    from_stage, to_stage,
    seconds_in_from_stage,
    metadata,
    created_at
  )
  values (
    p_company_id, p_lead_id, v_actor,
    'stage_changed',
    v_from_status, v_to_status,
    v_seconds,
    jsonb_build_object(
      'source', 'seller_kanban',
      'reason', p_reason,
      'deal_value', p_deal_value,
      'to_stage_id', p_to_stage_id
    ),
    v_now
  );

  return query select true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.log_lead_stage_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_now timestamptz := now();
  v_actor uuid := auth.uid();
  v_seconds int;
begin
  -- Só atua quando status realmente muda
  if new.status is distinct from old.status then
    -- Calcula tempo no status anterior:
    -- usa stage_entered_at se existir; senão cai pra created_at
    v_seconds := greatest(
      1,
      floor(extract(epoch from (v_now - coalesce(old.stage_entered_at, old.created_at))))
    )::int;

    insert into public.lead_stage_events (
      id,
      lead_id,
      user_id,
      from_status,
      to_status,
      moved_at,
      company_id,
      seconds_in_from_status
    ) values (
      gen_random_uuid(),
      new.id,
      v_actor,
      old.status,
      new.status,
      v_now,
      new.company_id,
      v_seconds
    );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_goal_simulation_stats(p_company_id uuid, p_start_date date, p_end_date date, p_owner_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(start_date date, end_date date, leads_disponiveis bigint, contatados bigint, respondeu bigint, negociacao bigint, fechado bigint, perdido bigint, taxa_resposta numeric, taxa_negociacao numeric, taxa_fechamento numeric, taxa_final_real numeric, ticket_medio_real_periodo numeric, ticket_medio_real_90d numeric, ticket_medio_real_all_time numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
with bounds as (
  select
    p_company_id as company_id,
    p_start_date::timestamptz as start_ts,
    (p_end_date::timestamptz + interval '1 day') as end_ts -- fim inclusivo
),
eligible_leads as (
  select l.id
  from public.leads l, bounds b
  where l.company_id = b.company_id
    and (p_owner_id is null or l.owner_id = p_owner_id)
),
moves as (
  -- conta por "entrada" no status no período (to_status)
  select
    e.lead_id,
    lower(e.to_status) as to_status
  from public.lead_stage_events e
  join bounds b on b.company_id = e.company_id
  join eligible_leads el on el.id = e.lead_id
  where e.moved_at >= b.start_ts
    and e.moved_at <  b.end_ts
),
counts as (
  select
    (select count(*) from eligible_leads) as leads_disponiveis,

    count(*) filter (where to_status = 'contato')     as contatados,
    count(*) filter (where to_status = 'respondeu')   as respondeu,
    count(*) filter (where to_status = 'negociacao')  as negociacao,
    count(*) filter (where to_status = 'fechado')     as fechado,
    count(*) filter (where to_status = 'perdido')     as perdido
  from moves
),
rates as (
  select
    c.*,
    case when c.contatados > 0 then (c.respondeu::numeric / c.contatados) else 0 end as taxa_resposta,
    case when c.respondeu > 0 then (c.negociacao::numeric / c.respondeu) else 0 end as taxa_negociacao,
    case when c.negociacao > 0 then (c.fechado::numeric / c.negociacao) else 0 end as taxa_fechamento,
    case when c.contatados > 0 then (c.fechado::numeric / c.contatados) else 0 end as taxa_final_real
  from counts c
),
ticket_periodo as (
  select avg(l.deal_value)::numeric as avg_deal
  from public.leads l, bounds b
  where l.company_id = b.company_id
    and (p_owner_id is null or l.owner_id = p_owner_id)
    and lower(l.status) = 'fechado'
    and l.deal_value is not null
    and l.stage_entered_at >= b.start_ts
    and l.stage_entered_at <  b.end_ts
),
ticket_90d as (
  select avg(l.deal_value)::numeric as avg_deal
  from public.leads l
  where l.company_id = p_company_id
    and (p_owner_id is null or l.owner_id = p_owner_id)
    and lower(l.status) = 'fechado'
    and l.deal_value is not null
    and l.stage_entered_at >= (now() - interval '90 days')
),
ticket_all as (
  select avg(l.deal_value)::numeric as avg_deal
  from public.leads l
  where l.company_id = p_company_id
    and (p_owner_id is null or l.owner_id = p_owner_id)
    and lower(l.status) = 'fechado'
    and l.deal_value is not null
)
select
  p_start_date as start_date,
  p_end_date as end_date,

  r.leads_disponiveis,

  r.contatados,
  r.respondeu,
  r.negociacao,
  r.fechado,
  r.perdido,

  r.taxa_resposta,
  r.taxa_negociacao,
  r.taxa_fechamento,
  r.taxa_final_real,

  tp.avg_deal as ticket_medio_real_periodo,
  t90.avg_deal as ticket_medio_real_90d,
  ta.avg_deal as ticket_medio_real_all_time
from rates r
cross join ticket_periodo tp
cross join ticket_90d t90
cross join ticket_all ta;
$function$
;

CREATE OR REPLACE FUNCTION public.next_user_code(p_company_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_code integer;
begin
  insert into public.company_counters (company_id, next_user_code)
  values (p_company_id, 1)
  on conflict (company_id) do nothing;

  select next_user_code
    into v_code
  from public.company_counters
  where company_id = p_company_id
  for update;

  update public.company_counters
     set next_user_code = v_code + 1,
         updated_at = now()
   where company_id = p_company_id;

  return v_code;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.profiles_set_user_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'auth'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_company_members_count(p_company_id uuid)
 RETURNS TABLE(members_count integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::int as members_count
  from public.profiles
  where company_id = p_company_id
    and role = 'member';
$function$
;

CREATE OR REPLACE FUNCTION public.get_goal_simulation_stats_v2(p_company_id uuid, p_start_date date, p_end_date date, p_owner_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(start_date date, end_date date, leads_disponiveis integer, contatados integer, respondeu integer, negociacao integer, fechado integer, perdido integer, trabalhados_no_periodo integer, taxa_resposta double precision, taxa_negociacao double precision, taxa_fechamento double precision, taxa_final_real double precision, ticket_medio_real_periodo numeric, ticket_medio_real_90d numeric, ticket_medio_real_all_time numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
with params as (
  select
    p_company_id as company_id,
    p_owner_id as owner_id,
    (p_start_date::timestamptz) as ts_start,
    ((p_end_date::timestamptz) + interval '1 day') as ts_end
),
available_now as (
  select count(*)::int as leads_disponiveis
  from public.leads l
  join params p on p.company_id = l.company_id
  where (p.owner_id is null or l.owner_id = p.owner_id)
),
hist as (
  select h.*
  from public.lead_status_history h
  join params p on p.company_id = h.company_id
  where h.changed_at >= p.ts_start
    and h.changed_at < p.ts_end
    and (p.owner_id is null or h.owner_id = p.owner_id)
),
worked as (
  select count(distinct lead_id)::int as trabalhados_no_periodo
  from hist
  where from_status = 'novo'
    and to_status <> 'novo'
),
to_counts as (
  select
    count(distinct lead_id) filter (where to_status = 'contato')::int as contatados,
    count(distinct lead_id) filter (where to_status = 'respondeu')::int as respondeu,
    0::int as negociacao,

    -- ✅ vitória = SOMENTE ganho
    count(distinct lead_id) filter (where to_status = 'ganho')::int as fechado,

    0::int as perdido
  from hist
),
ticket_period as (
  select avg(l.deal_value)::numeric as ticket_medio_real_periodo
  from public.leads l
  join params p on p.company_id = l.company_id
  where l.deal_value is not null
    and l.id in (
      select distinct lead_id
      from hist
      where to_status = 'ganho'
    )
    and (p.owner_id is null or l.owner_id = p.owner_id)
),
ticket_90d as (
  select avg(l.deal_value)::numeric as ticket_medio_real_90d
  from public.leads l
  join params p on p.company_id = l.company_id
  where l.deal_value is not null
    and l.updated_at >= (now() - interval '90 day')
    and (p.owner_id is null or l.owner_id = p.owner_id)
),
ticket_all as (
  select avg(l.deal_value)::numeric as ticket_medio_real_all_time
  from public.leads l
  join params p on p.company_id = l.company_id
  where l.deal_value is not null
    and (p.owner_id is null or l.owner_id = p.owner_id)
)
select
  p_start_date as start_date,
  p_end_date as end_date,
  a.leads_disponiveis,
  c.contatados,
  c.respondeu,
  c.negociacao,
  c.fechado,
  c.perdido,
  w.trabalhados_no_periodo,

  case when w.trabalhados_no_periodo > 0 then (c.respondeu::double precision / w.trabalhados_no_periodo) else 0 end as taxa_resposta,
  case when c.respondeu > 0 then (c.negociacao::double precision / c.respondeu) else 0 end as taxa_negociacao,
  case when c.negociacao > 0 then (c.fechado::double precision / c.negociacao) else 0 end as taxa_fechamento,
  case when w.trabalhados_no_periodo > 0 then (c.fechado::double precision / w.trabalhados_no_periodo) else 0 end as taxa_final_real,

  tp.ticket_medio_real_periodo,
  t90.ticket_medio_real_90d,
  ta.ticket_medio_real_all_time
from params p
cross join available_now a
cross join to_counts c
cross join worked w
cross join ticket_period tp
cross join ticket_90d t90
cross join ticket_all ta;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_platform_admin = true
        AND COALESCE(p.is_active_global, true) = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.company_memberships cm
      WHERE cm.user_id = auth.uid()
        AND cm.role = 'admin'
        AND cm.is_active = true
    );
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_sales_cycle_closed_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF NEW.status IN ('ganho', 'perdido') AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.closed_at = now();
  ELSIF NEW.status NOT IN ('ganho', 'perdido') AND OLD.status IN ('ganho', 'perdido') THEN
    NEW.closed_at = NULL;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.block_lead_profiles_key_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'company_id is immutable on lead_profiles';
  END IF;
  IF NEW.lead_id IS DISTINCT FROM OLD.lead_id THEN
    RAISE EXCEPTION 'lead_id is immutable on lead_profiles';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_create_lead_and_cycle(p_company_id uuid, p_name text, p_phone text DEFAULT NULL::text, p_owner_user_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'novo'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_lead_id uuid;
  v_cycle_id uuid;
BEGIN
  IF p_company_id != public.current_company_id() THEN
    RETURN jsonb_build_object('success', false, 'message', 'company_id inválido');
  END IF;

  IF NOT public.is_admin() THEN
    p_owner_user_id := auth.uid();
  END IF;

  INSERT INTO public.leads (company_id, name, phone, status)
  VALUES (p_company_id, p_name, p_phone, 'novo')
  RETURNING id INTO v_lead_id;

  INSERT INTO public.sales_cycles (company_id, lead_id, owner_user_id, status, stage_entered_at)
  VALUES (p_company_id, v_lead_id, p_owner_user_id, p_status::public.lead_status, now())
  RETURNING id INTO v_cycle_id;

  RETURN jsonb_build_object('success', true, 'lead_id', v_lead_id, 'cycle_id', v_cycle_id, 'message', 'Criado com sucesso');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_create_lead_and_cycle(p_lead jsonb, p_group_id uuid DEFAULT NULL::uuid, p_owner_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_lead_id uuid;
  v_cycle_id uuid;
  v_lead_name text;
BEGIN
  -- Apenas seller ou admin podem criar
  IF NOT (public.is_admin() OR public.is_seller()) THEN
    RAISE EXCEPTION 'Apenas vendedores e admins podem criar leads';
  END IF;

  -- Get company_id from current user
  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada';
  END IF;

  -- Validar que p_owner_user_id pertence à mesma company (se admin)
  IF p_owner_user_id IS NOT NULL AND public.is_admin() THEN
    PERFORM 1 FROM public.profiles
    WHERE id = p_owner_user_id AND company_id = v_company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Vendedor não pertence à sua empresa';
    END IF;
  END IF;

  -- Validar que p_group_id pertence à mesma company (se informado)
  IF p_group_id IS NOT NULL THEN
    PERFORM 1 FROM public.lead_groups
    WHERE id = p_group_id AND company_id = v_company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Grupo não pertence à sua empresa';
    END IF;
  END IF;

  -- Criar ou atualizar LEAD
  v_lead_name := p_lead->>'name';
  IF v_lead_name IS NULL OR v_lead_name = '' THEN
    RAISE EXCEPTION 'Nome do lead é obrigatório';
  END IF;

  INSERT INTO public.leads (
    company_id,
    name,
    phone,
    email,
    status,
    created_by
  )
  VALUES (
    v_company_id,
    v_lead_name,
    p_lead->>'phone',
    p_lead->>'email',
    'novo'::text,
    auth.uid()
  )
  ON CONFLICT (company_id, name) DO UPDATE SET
    phone = COALESCE(p_lead->>'phone', leads.phone),
    email = COALESCE(p_lead->>'email', leads.email),
    updated_at = now()
  RETURNING id INTO v_lead_id;

  -- Criar SALES_CYCLE
  INSERT INTO public.sales_cycles (
    company_id,
    lead_id,
    owner_user_id,
    status,
    current_group_id,
    stage_entered_at
  )
  VALUES (
    v_company_id,
    v_lead_id,
    p_owner_user_id,
    'novo'::text,
    p_group_id,
    now()
  )
  RETURNING id INTO v_cycle_id;

  -- Log: cycle_created
  INSERT INTO public.cycle_events (
    company_id,
    cycle_id,
    event_type,
    created_by,
    metadata,
    occurred_at
  )
  VALUES (
    v_company_id,
    v_cycle_id,
    'cycle_created'::text,
    auth.uid(),
    jsonb_build_object(
      'lead_name', v_lead_name,
      'owner_user_id', p_owner_user_id,
      'group_id', p_group_id
    ),
    now()
  );

  -- Log: group_attached (se aplicável)
  IF p_group_id IS NOT NULL THEN
    INSERT INTO public.lead_group_cycles (
      company_id,
      group_id,
      cycle_id,
      attached_by
    )
    VALUES (
      v_company_id,
      p_group_id,
      v_cycle_id,
      auth.uid()
    )
    ON CONFLICT DO NOTHING;

    INSERT INTO public.cycle_events (
      company_id,
      cycle_id,
      event_type,
      created_by,
      metadata,
      occurred_at
    )
    VALUES (
      v_company_id,
      v_cycle_id,
      'group_attached'::text,
      auth.uid(),
      jsonb_build_object('group_id', p_group_id),
      now()
    );
  END IF;

  -- Retornar ciclo + lead
  RETURN to_jsonb((
    SELECT row_to_json(t) FROM (
      SELECT
        sc.id,
        sc.company_id,
        sc.lead_id,
        sc.owner_user_id,
        sc.current_group_id as group_id,
        sc.status,
        sc.stage_entered_at,
        sc.created_at,
        sc.next_action,
        l.name,
        l.phone,
        l.email
      FROM public.sales_cycles sc
      JOIN public.leads l ON sc.lead_id = l.id
      WHERE sc.id = v_cycle_id
    ) t
  ));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_return_cycle_to_pool(p_cycle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_owner_old uuid;
  v_cycle_record sales_cycles%ROWTYPE;
BEGIN
  -- Verificar se é admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas admins podem devolver ciclos ao pool';
  END IF;

  -- Validar ciclo e company_id
  SELECT company_id, owner_user_id INTO v_company_id, v_owner_old
  FROM sales_cycles
  WHERE id = p_cycle_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Ciclo não encontrado';
  END IF;

  -- Update ciclo
  UPDATE sales_cycles
  SET owner_user_id = NULL, updated_at = NOW()
  WHERE id = p_cycle_id
  RETURNING * INTO v_cycle_record;

  -- Registrar evento
  INSERT INTO public.cycle_events (
    company_id,
    cycle_id,
    lead_id,
    event_type,
    from_stage,
    to_stage,
    occurred_at,
    metadata
  ) VALUES (
    v_company_id,
    p_cycle_id,
    v_cycle_record.lead_id,
    'returned_to_pool',
    NULL,
    NULL,
    NOW(),
    jsonb_build_object(
      'owner_old', v_owner_old::text,
      'source', 'pool_actions'
    )
  );

  RETURN row_to_json(v_cycle_record);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_bulk_import_cycles(p_leads jsonb[], p_group_id uuid DEFAULT NULL::uuid, p_owner_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_lead jsonb;
  v_lead_id uuid;
  v_cycle_id uuid;
  v_count_created int := 0;
  v_count_failed int := 0;
  v_error_msg text;
BEGIN
  -- Apenas admin ou seller podem importar
  IF NOT (public.is_admin() OR public.is_seller()) THEN
    RAISE EXCEPTION 'Apenas vendedores e admins podem importar leads';
  END IF;

  -- Get company_id
  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada';
  END IF;

  -- Validar p_group_id se informado
  IF p_group_id IS NOT NULL THEN
    PERFORM 1 FROM public.lead_groups
    WHERE id = p_group_id AND company_id = v_company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Grupo não pertence à sua empresa';
    END IF;
  END IF;

  -- Validar p_owner_user_id se informado
  IF p_owner_user_id IS NOT NULL THEN
    PERFORM 1 FROM public.profiles
    WHERE id = p_owner_user_id AND company_id = v_company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Vendedor não pertence à sua empresa';
    END IF;
  END IF;

  -- Process each lead
  FOREACH v_lead IN ARRAY p_leads
  LOOP
    BEGIN
      -- Create/update lead
      INSERT INTO public.leads (
        company_id,
        name,
        phone,
        email,
        status,
        created_by
      )
      VALUES (
        v_company_id,
        v_lead->>'name',
        v_lead->>'phone',
        v_lead->>'email',
        'novo'::text,
        auth.uid()
      )
      ON CONFLICT (company_id, name) DO UPDATE SET
        phone = COALESCE(v_lead->>'phone', leads.phone),
        email = COALESCE(v_lead->>'email', leads.email),
        updated_at = now()
      RETURNING id INTO v_lead_id;

      -- Create cycle
      INSERT INTO public.sales_cycles (
        company_id,
        lead_id,
        owner_user_id,
        status,
        current_group_id,
        stage_entered_at
      )
      VALUES (
        v_company_id,
        v_lead_id,
        p_owner_user_id,
        'novo'::text,
        p_group_id,
        now()
      )
      RETURNING id INTO v_cycle_id;

      -- Log events
      INSERT INTO public.cycle_events (
        company_id,
        cycle_id,
        event_type,
        created_by,
        metadata,
        occurred_at
      )
      VALUES (
        v_company_id,
        v_cycle_id,
        'imported'::text,
        auth.uid(),
        jsonb_build_object('source', 'excel'),
        now()
      );

      IF p_group_id IS NOT NULL THEN
        INSERT INTO public.lead_group_cycles (
          company_id,
          group_id,
          cycle_id,
          attached_by
        )
        VALUES (
          v_company_id,
          p_group_id,
          v_cycle_id,
          auth.uid()
        )
        ON CONFLICT DO NOTHING;

        INSERT INTO public.cycle_events (
          company_id,
          cycle_id,
          event_type,
          created_by,
          metadata,
          occurred_at
        )
        VALUES (
          v_company_id,
          v_cycle_id,
          'group_attached'::text,
          auth.uid(),
          jsonb_build_object('group_id', p_group_id),
          now()
        );
      END IF;

      v_count_created := v_count_created + 1;

    EXCEPTION WHEN OTHERS THEN
      v_count_failed := v_count_failed + 1;
      v_error_msg := SQLERRM;
      RAISE WARNING 'Erro ao importar lead %: %', v_lead->>'name', v_error_msg;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'total_processed', array_length(p_leads, 1),
    'created', v_count_created,
    'failed', v_count_failed
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_leads_by_ids(lead_ids uuid[], company_id_param uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  deleted_count INT;
BEGIN
  -- Validar que o usuário pertence à empresa
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND company_id = company_id_param
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Deletar ciclos primeiro (FK constraint)
  DELETE FROM sales_cycles
  WHERE lead_id = ANY(lead_ids)
  AND company_id = company_id_param;

  -- Deletar leads
  DELETE FROM leads
  WHERE id = ANY(lead_ids)
  AND company_id = company_id_param;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN json_build_object('deleted', deleted_count);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_bulk_return_group_to_pool(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_affected_count int := 0;
  v_cycle_rec sales_cycles%ROWTYPE;
BEGIN
  -- Verificar se é admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas admins podem recolher grupos';
  END IF;

  -- Validar grupo e company_id
  SELECT company_id INTO v_company_id
  FROM lead_groups
  WHERE id = p_group_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Grupo não encontrado';
  END IF;

  -- Atualizar todos ciclos do grupo e registrar eventos
  FOR v_cycle_rec IN
    SELECT sc.* FROM sales_cycles sc
    WHERE sc.current_group_id = p_group_id
  LOOP
    -- Update ciclo
    UPDATE sales_cycles
    SET owner_user_id = NULL, updated_at = NOW()
    WHERE id = v_cycle_rec.id;

    -- Registrar evento
    INSERT INTO public.cycle_events (
      company_id,
      cycle_id,
      lead_id,
      event_type,
      from_stage,
      to_stage,
      occurred_at,
      metadata
    ) VALUES (
      v_company_id,
      v_cycle_rec.id,
      v_cycle_rec.lead_id,
      'recalled_group_to_pool',
      NULL,
      NULL,
      NOW(),
      jsonb_build_object(
        'group_id', p_group_id::text,
        'owner_old', v_cycle_rec.owner_user_id::text,
        'source', 'pool_actions'
      )
    );

    v_affected_count := v_affected_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'affected_count', v_affected_count,
    'group_id', p_group_id::text,
    'status', 'success'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_cycle_last_events(p_cycle_id uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(id uuid, event_type text, occurred_at timestamp without time zone, metadata jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  -- Verificar se é admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas admins podem acessar eventos';
  END IF;

  RETURN QUERY
  SELECT
    ce.id,
    ce.event_type,
    ce.occurred_at,
    ce.metadata
  FROM public.cycle_events ce
  WHERE ce.cycle_id = p_cycle_id
  ORDER BY ce.occurred_at DESC
  LIMIT p_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_delete_lead(p_lead_id uuid, p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_lead_id uuid;
BEGIN
  -- Verificar se é admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas admins podem deletar leads';
  END IF;

  -- Validar que lead existe e pertence à company
  SELECT id INTO v_lead_id
  FROM leads
  WHERE id = p_lead_id AND company_id = p_company_id;

  IF v_lead_id IS NULL THEN
    RAISE EXCEPTION 'Lead não encontrado';
  END IF;

  -- Deletar em ordem de dependência
  DELETE FROM lead_interactions WHERE lead_id = v_lead_id;
  DELETE FROM lead_events WHERE lead_id = v_lead_id;
  DELETE FROM lead_profiles WHERE lead_id = v_lead_id;
  DELETE FROM sales_cycles WHERE lead_id = v_lead_id;
  DELETE FROM leads WHERE id = v_lead_id;

  RETURN jsonb_build_object(
    'success', true,
    'lead_id', v_lead_id,
    'status', 'deleted'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_bulk_reassign_cycles_owner(p_cycle_ids uuid[], p_owner_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_current_company_id uuid;
  v_old_owner uuid;
  v_count int;
BEGIN
  -- Admin check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas admins podem redistribuir ciclos';
  END IF;

  v_current_company_id := public.current_company_id();
  IF v_current_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não identificada';
  END IF;

  -- Validar que TODOS os ciclos pertencem à company_id atual
  IF EXISTS (
    SELECT 1 FROM sales_cycles
    WHERE id = ANY(p_cycle_ids) AND company_id != v_current_company_id
  ) THEN
    RAISE EXCEPTION 'Um ou mais ciclos não pertencem à sua empresa';
  END IF;

  -- Validar que novo owner pertence à mesma company
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_owner_user_id AND company_id = v_current_company_id
  ) THEN
    RAISE EXCEPTION 'Vendedor destino não encontrado na empresa';
  END IF;

  -- Atualizar owner
  UPDATE sales_cycles
  SET owner_user_id = p_owner_user_id, updated_at = NOW()
  WHERE id = ANY(p_cycle_ids) AND company_id = v_current_company_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Auditoria: 1 evento por ciclo (event_type = owner_assigned se era NULL, owner_reassigned se já tinha)
  INSERT INTO public.cycle_events (company_id, cycle_id, event_type, created_by, occurred_at, metadata)
  SELECT
    v_current_company_id,
    sc.id,
    CASE
      WHEN sc.owner_user_id IS NULL THEN 'owner_assigned'
      ELSE 'owner_reassigned'
    END,
    auth.uid(),
    NOW(),
    jsonb_build_object('owner_new', p_owner_user_id::text, 'source', 'admin_bulk_reassign')
  FROM sales_cycles sc
  WHERE sc.id = ANY(p_cycle_ids) AND sc.company_id = v_current_company_id;

  RETURN jsonb_build_object(
    'success', true,
    'cycles_updated', v_count,
    'owner_id', p_owner_user_id::text
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_distribute_group_pool_round_robin(p_group_id uuid, p_owner_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_owner_count int;
  v_updated_count int := 0;
BEGIN
  -- ========================================================================
  -- Validação 1: Admin only
  -- ========================================================================
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas admins podem distribuir grupos' USING ERRCODE = 'PERM';
  END IF;

  -- ========================================================================
  -- Validação 2: Obter company_id
  -- ========================================================================
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não identificada' USING ERRCODE = 'NODATA';
  END IF;

  -- ========================================================================
  -- Validação 3: Validar owners array
  -- ========================================================================
  v_owner_count := array_length(p_owner_ids, 1);
  IF v_owner_count IS NULL OR v_owner_count = 0 THEN
    RAISE EXCEPTION 'Nenhum vendedor fornecido' USING ERRCODE = 'INVDATA';
  END IF;

  -- ========================================================================
  -- Validação 4: Validar grupo
  -- ========================================================================
  IF NOT EXISTS (
    SELECT 1 FROM public.lead_groups
    WHERE id = p_group_id
      AND company_id = v_company_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Grupo inválido ou arquivado' USING ERRCODE = 'NODATA';
  END IF;

  -- ========================================================================
  -- Validação 5: Validar owners pertencem à empresa
  -- ========================================================================
  IF EXISTS (
    SELECT 1
    FROM unnest(p_owner_ids) AS owner_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = owner_id
        AND company_id = v_company_id
    )
  ) THEN
    RAISE EXCEPTION 'Um ou mais vendedores não pertencem à empresa' USING ERRCODE = 'INVDATA';
  END IF;

  -- ========================================================================
  -- Operação principal: Round-robin assignment com auditoria
  -- ========================================================================
  WITH targets AS (
    -- Seleciona TODOS os ciclos no pool deste grupo
    SELECT
      sc.id,
      (ROW_NUMBER() OVER (ORDER BY sc.created_at ASC, sc.id ASC) - 1) AS rn
    FROM public.sales_cycles sc
    WHERE sc.company_id = v_company_id
      AND sc.current_group_id = p_group_id
      AND sc.owner_user_id IS NULL
  ),
  updated AS (
    -- Atualiza com round-robin determinístico
    UPDATE public.sales_cycles sc
    SET
      owner_user_id = p_owner_ids[((t.rn % v_owner_count) + 1)],
      updated_at = now()
    FROM targets t
    WHERE sc.id = t.id
    RETURNING sc.id, sc.owner_user_id, sc.current_group_id
  )
  -- Insere eventos de auditoria
  INSERT INTO public.cycle_events(company_id, cycle_id, event_type, created_by, occurred_at, metadata)
  SELECT
    v_company_id,
    u.id,
    'owner_assigned',
    auth.uid(),
    now(),
    jsonb_build_object(
      'owner_new', u.owner_user_id::text,
      'group_id', u.current_group_id::text,
      'source', 'admin_distribute_group_pool_rr',
      'owners_count', v_owner_count
    )
  FROM updated u;

  -- Conta quantos foram atualizados (do INSERT anterior)
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'group_id', p_group_id::text,
    'owners_count', v_owner_count
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_default_quick_actions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO quick_actions_config (company_id, label, suggested_status, "order") VALUES
  (NEW.id, 'Abordagem realizada', 'contato', 1),
  (NEW.id, 'Ligação feita', 'contato', 2),
  (NEW.id, 'Respondido dúvida', 'respondeu', 3),
  (NEW.id, 'Agendamento realizado', 'respondeu', 4),
  (NEW.id, 'Proposta realizada', 'negociacao', 5),
  (NEW.id, 'Telefone incorreto', 'return_to_pool', 6);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_active_competency()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid;
  v_row record;
  v_month_start date;
  v_month_end date;
begin
  v_company_id := public.current_company_id();

  if v_company_id is null then
    return jsonb_build_object('error', 'company_not_found');
  end if;

  select
    c.month
  into v_row
  from public.competencies c
  where c.company_id = v_company_id
    and c.is_active = true
  limit 1;

  if v_row is null then
    return jsonb_build_object('error', 'active_competency_not_found');
  end if;

  v_month_start := date_trunc('month', v_row.month)::date;
  v_month_end := (date_trunc('month', v_row.month) + interval '1 month')::date;

  return jsonb_build_object(
    'month', to_char(v_row.month, 'TMMonth YYYY'),
    'month_start', v_month_start,
    'month_end', v_month_end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_create_revenue_extra_source(p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_new_id uuid;
BEGIN
  -- Validações
  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RAISE EXCEPTION 'Nome não pode estar vazio';
  END IF;

  -- Obter company_id do usuário atual
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não associado a empresa';
  END IF;

  -- Verificar permissão (admin only)
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem criar fontes de faturamento';
  END IF;

  -- Inserir
  INSERT INTO public.revenue_extra_sources (company_id, name, created_by)
  VALUES (v_company_id, TRIM(p_name), auth.uid())
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_upsert_revenue_daily_override(p_source_kind text, p_source_id uuid, p_ref_date date, p_real_value numeric, p_reason text, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_source_company_id uuid;
BEGIN
  -- Validações
  IF p_source_kind NOT IN ('seller', 'extra') THEN
    RAISE EXCEPTION 'source_kind deve ser ''seller'' ou ''extra''';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'Motivo é obrigatório';
  END IF;

  -- Obter company_id do usuário atual
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não associado a empresa';
  END IF;

  -- Verificar permissão (admin only)
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem editar faturamento';
  END IF;

  -- Validar que source_id pertence à company
  IF p_source_kind = 'seller' THEN
    SELECT company_id INTO v_source_company_id
    FROM public.profiles
    WHERE id = p_source_id;
  ELSIF p_source_kind = 'extra' THEN
    SELECT company_id INTO v_source_company_id
    FROM public.revenue_extra_sources
    WHERE id = p_source_id;
  END IF;

  IF v_source_company_id IS NULL OR v_source_company_id != v_company_id THEN
    RAISE EXCEPTION 'Source não encontrado ou não pertence à empresa';
  END IF;

  -- Upsert
  INSERT INTO public.revenue_overrides_daily (
    company_id, source_kind, source_id, ref_date, real_value, reason, notes, edited_by
  )
  VALUES (v_company_id, p_source_kind, p_source_id, p_ref_date, p_real_value, TRIM(p_reason), p_notes, auth.uid())
  ON CONFLICT (company_id, source_kind, source_id, ref_date)
  DO UPDATE SET
    real_value = p_real_value,
    reason = TRIM(p_reason),
    notes = p_notes,
    edited_by = auth.uid(),
    edited_at = now();

  RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_won_columns_freeze()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  -- Se mudou para 'ganho', congela won_owner_user_id e won_at
  IF NEW.status = 'ganho' AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.won_owner_user_id = COALESCE(NEW.won_owner_user_id, OLD.owner_user_id);
    NEW.won_at = COALESCE(NEW.won_at, now());
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_won_columns_reset()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  -- Se volta de 'ganho' para outro status, limpa won_*
  IF OLD.status = 'ganho' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.won_owner_user_id = NULL;
    NEW.won_at = NULL;
    NEW.won_total = NULL;
    NEW.won_items = NULL;
    NEW.won_note = NULL;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_register_cycle_won(p_cycle_id uuid, p_won_total numeric DEFAULT NULL::numeric, p_won_items integer DEFAULT NULL::integer, p_won_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_cycle record;
  v_company_id uuid;
  v_current_user_id uuid;
BEGIN
  -- Get current user and cycle info
  v_current_user_id := auth.uid();
  v_company_id := current_company_id();

  IF v_current_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Get cycle with authorization check
  SELECT * INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  IF v_cycle IS NULL THEN
    RETURN jsonb_build_object('error', 'Cycle not found or access denied');
  END IF;

  IF v_cycle.status != 'ganho' THEN
    RETURN jsonb_build_object('error', 'Cycle must be in ganho status');
  END IF;

  -- Validate inputs
  IF p_won_total IS NOT NULL AND p_won_total <= 0 THEN
    RETURN jsonb_build_object('error', 'won_total must be positive');
  END IF;

  IF p_won_items IS NOT NULL AND p_won_items <= 0 THEN
    RETURN jsonb_build_object('error', 'won_items must be positive');
  END IF;

  -- Update cycle with won details
  UPDATE public.sales_cycles
  SET
    won_total = COALESCE(p_won_total, won_total),
    won_items = COALESCE(p_won_items, won_items),
    won_note = COALESCE(p_won_note, won_note),
    updated_at = now()
  WHERE id = p_cycle_id;

  -- Log the action
  INSERT INTO public.cycle_events(cycle_id, event_type, event_data)
  VALUES (
    p_cycle_id,
    'won_details_registered',
    jsonb_build_object(
      'won_total', p_won_total,
      'won_items', p_won_items,
      'won_note', p_won_note,
      'registered_by', v_current_user_id,
      'registered_at', now()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'cycle_id', p_cycle_id,
    'won_total', p_won_total,
    'won_items', p_won_items,
    'won_note', p_won_note
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_log_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  -- Se o status mudou, guarda o valor antigo em previous_status
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.previous_status := OLD.status;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_mark_deal_won(p_sales_cycle_id uuid, p_won_owner_user_id uuid, p_won_total numeric, p_won_items integer DEFAULT 1, p_won_note text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, message text, sales_cycle_id uuid)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  -- Validar se o deal existe
  IF NOT EXISTS (SELECT 1 FROM public.sales_cycles WHERE id = p_sales_cycle_id) THEN
    RETURN QUERY SELECT
      false,
      'Deal não encontrado',
      p_sales_cycle_id;
    RETURN;
  END IF;

  -- Validar se já é ganho
  IF EXISTS (SELECT 1 FROM public.sales_cycles WHERE id = p_sales_cycle_id AND won_at IS NOT NULL) THEN
    RETURN QUERY SELECT
      false,
      'Deal já foi marcado como ganho',
      p_sales_cycle_id;
    RETURN;
  END IF;

  -- Validar valores
  IF p_won_total <= 0 THEN
    RETURN QUERY SELECT
      false,
      'Valor do deal deve ser maior que 0',
      p_sales_cycle_id;
    RETURN;
  END IF;

  -- Atualizar o deal
  UPDATE public.sales_cycles
  SET
    status = 'ganho',
    won_at = NOW(),
    won_owner_user_id = p_won_owner_user_id,
    won_total = p_won_total,
    won_items = p_won_items,
    won_note = p_won_note,
    closed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_sales_cycle_id;

  -- Retornar sucesso
  RETURN QUERY SELECT
    true,
    'Deal marcado como ganho com sucesso',
    p_sales_cycle_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_mark_deal_lost(p_sales_cycle_id uuid, p_lost_reason text, p_lost_owner_user_id uuid)
 RETURNS TABLE(success boolean, message text, sales_cycle_id uuid)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  -- Validar se o deal existe
  IF NOT EXISTS (SELECT 1 FROM public.sales_cycles WHERE id = p_sales_cycle_id) THEN
    RETURN QUERY SELECT
      false,
      'Deal não encontrado',
      p_sales_cycle_id;
    RETURN;
  END IF;

  -- Validar se já é perdido
  IF EXISTS (SELECT 1 FROM public.sales_cycles WHERE id = p_sales_cycle_id AND lost_at IS NOT NULL) THEN
    RETURN QUERY SELECT
      false,
      'Deal já foi marcado como perdido',
      p_sales_cycle_id;
    RETURN;
  END IF;

  -- Validar motivo
  IF p_lost_reason IS NULL OR TRIM(p_lost_reason) = '' THEN
    RETURN QUERY SELECT
      false,
      'Motivo da perda é obrigatório',
      p_sales_cycle_id;
    RETURN;
  END IF;

  -- Atualizar o deal
  UPDATE public.sales_cycles
  SET
    status = 'perdido',
    lost_at = NOW(),
    lost_reason = p_lost_reason,
    lost_owner_user_id = p_lost_owner_user_id,
    closed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_sales_cycle_id;

  -- Retornar sucesso
  RETURN QUERY SELECT
    true,
    'Deal marcado como perdido com sucesso',
    p_sales_cycle_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_pause_deal(p_sales_cycle_id uuid, p_paused_reason text)
 RETURNS TABLE(success boolean, message text, sales_cycle_id uuid)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  -- Validar se o deal existe
  IF NOT EXISTS (SELECT 1 FROM public.sales_cycles WHERE id = p_sales_cycle_id) THEN
    RETURN QUERY SELECT
      false,
      'Deal não encontrado',
      p_sales_cycle_id;
    RETURN;
  END IF;

  -- Validar se já está pausado
  IF EXISTS (SELECT 1 FROM public.sales_cycles WHERE id = p_sales_cycle_id AND paused_at IS NOT NULL) THEN
    RETURN QUERY SELECT
      false,
      'Deal já está pausado',
      p_sales_cycle_id;
    RETURN;
  END IF;

  -- Validar motivo
  IF p_paused_reason IS NULL OR TRIM(p_paused_reason) = '' THEN
    RETURN QUERY SELECT
      false,
      'Motivo da pausa é obrigatório',
      p_sales_cycle_id;
    RETURN;
  END IF;

  -- Atualizar o deal
  UPDATE public.sales_cycles
  SET
    status = 'pausado',
    paused_at = NOW(),
    paused_reason = p_paused_reason,
    updated_at = NOW()
  WHERE id = p_sales_cycle_id;

  -- Retornar sucesso
  RETURN QUERY SELECT
    true,
    'Deal pausado com sucesso',
    p_sales_cycle_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_cancel_deal(p_sales_cycle_id uuid, p_canceled_reason text)
 RETURNS TABLE(success boolean, message text, sales_cycle_id uuid)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  -- Validar se o deal existe
  IF NOT EXISTS (SELECT 1 FROM public.sales_cycles WHERE id = p_sales_cycle_id) THEN
    RETURN QUERY SELECT
      false,
      'Deal não encontrado',
      p_sales_cycle_id;
    RETURN;
  END IF;

  -- Validar se já está cancelado
  IF EXISTS (SELECT 1 FROM public.sales_cycles WHERE id = p_sales_cycle_id AND canceled_at IS NOT NULL) THEN
    RETURN QUERY SELECT
      false,
      'Deal já está cancelado',
      p_sales_cycle_id;
    RETURN;
  END IF;

  -- Validar motivo
  IF p_canceled_reason IS NULL OR TRIM(p_canceled_reason) = '' THEN
    RETURN QUERY SELECT
      false,
      'Motivo do cancelamento é obrigatório',
      p_sales_cycle_id;
    RETURN;
  END IF;

  -- Atualizar o deal
  UPDATE public.sales_cycles
  SET
    status = 'cancelado',
    canceled_at = NOW(),
    canceled_reason = p_canceled_reason,
    closed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_sales_cycle_id;

  -- Retornar sucesso
  RETURN QUERY SELECT
    true,
    'Deal cancelado com sucesso',
    p_sales_cycle_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_resume_deal(p_sales_cycle_id uuid, p_new_status text DEFAULT 'contato'::text)
 RETURNS TABLE(success boolean, message text, sales_cycle_id uuid)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  -- Validar se o deal existe
  IF NOT EXISTS (SELECT 1 FROM public.sales_cycles WHERE id = p_sales_cycle_id) THEN
    RETURN QUERY SELECT
      false,
      'Deal não encontrado',
      p_sales_cycle_id;
    RETURN;
  END IF;

  -- Validar se está pausado
  IF NOT EXISTS (SELECT 1 FROM public.sales_cycles WHERE id = p_sales_cycle_id AND status = 'pausado') THEN
    RETURN QUERY SELECT
      false,
      'Deal não está pausado',
      p_sales_cycle_id;
    RETURN;
  END IF;

  -- Validar novo status
  IF p_new_status NOT IN ('novo', 'contato', 'respondeu', 'negociacao') THEN
    RETURN QUERY SELECT
      false,
      'Status inválido. Valores aceitos: novo, contato, respondeu, negociacao',
      p_sales_cycle_id;
    RETURN;
  END IF;

  -- Atualizar o deal
  UPDATE public.sales_cycles
  SET
    status = p_new_status,
    paused_at = NULL,
    paused_reason = NULL,
    updated_at = NOW()
  WHERE id = p_sales_cycle_id;

  -- Retornar sucesso
  RETURN QUERY SELECT
    true,
    'Deal retomado com sucesso',
    p_sales_cycle_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_audit_sales_cycles()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_changes_summary text;
  v_changed_fields text[];
BEGIN
  -- Registrar a mudança
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_sales_cycles (
      sales_cycle_id,
      operation,
      changed_by,
      new_data,
      changes_summary
    ) VALUES (
      NEW.id,
      'INSERT',
      auth.uid(),
      row_to_json(NEW),
      'Novo deal criado'
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Detectar quais campos mudaram
    v_changed_fields := ARRAY[]::text[];

    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_changed_fields := array_append(v_changed_fields,
        'status: ' || COALESCE(OLD.status::text, 'NULL') || ' → ' || COALESCE(NEW.status::text, 'NULL'));
    END IF;

    IF OLD.won_at IS DISTINCT FROM NEW.won_at THEN
      v_changed_fields := array_append(v_changed_fields, 'won_at alterado');
    END IF;

    IF OLD.lost_at IS DISTINCT FROM NEW.lost_at THEN
      v_changed_fields := array_append(v_changed_fields, 'lost_at alterado');
    END IF;

    IF OLD.paused_at IS DISTINCT FROM NEW.paused_at THEN
      v_changed_fields := array_append(v_changed_fields, 'paused_at alterado');
    END IF;

    IF OLD.canceled_at IS DISTINCT FROM NEW.canceled_at THEN
      v_changed_fields := array_append(v_changed_fields, 'canceled_at alterado');
    END IF;

    IF OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id THEN
      v_changed_fields := array_append(v_changed_fields, 'owner_user_id alterado');
    END IF;

    IF OLD.won_total IS DISTINCT FROM NEW.won_total THEN
      v_changed_fields := array_append(v_changed_fields, 'won_total: ' || COALESCE(OLD.won_total::text, '0') || ' → ' || COALESCE(NEW.won_total::text, '0'));
    END IF;

    v_changes_summary := array_to_string(v_changed_fields, ' | ');

    INSERT INTO public.audit_sales_cycles (
      sales_cycle_id,
      operation,
      changed_by,
      old_data,
      new_data,
      changes_summary
    ) VALUES (
      NEW.id,
      'UPDATE',
      auth.uid(),
      row_to_json(OLD),
      row_to_json(NEW),
      v_changes_summary
    );
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_sales_cycles (
      sales_cycle_id,
      operation,
      changed_by,
      old_data,
      changes_summary
    ) VALUES (
      OLD.id,
      'DELETE',
      auth.uid(),
      row_to_json(OLD),
      'Deal deletado'
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_set_user_role(p_user_id uuid, p_role text)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN QUERY SELECT false, 'Empresa ativa ambígua. Use a versão com p_company_id.';
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.fn_set_user_role_for_company(v_company_id, p_user_id, p_role);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
      AND is_active = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_simulator_group_conversion(p_company_id uuid, p_owner_id uuid DEFAULT NULL::uuid, p_date_start date DEFAULT NULL::date, p_date_end date DEFAULT NULL::date)
 RETURNS TABLE(group_id uuid, group_name text, novo integer, contato integer, respondeu integer, negociacao integer, ganho integer, perdido integer, trabalhados integer, pct_grupo numeric, pct_participacao numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_caller_id uuid;
  v_is_admin boolean;
  v_trabalhados_total bigint;
BEGIN
  v_caller_id := auth.uid();
  v_is_admin := public.is_admin();

  IF NOT v_is_admin THEN
    IF p_owner_id IS NULL OR p_owner_id <> v_caller_id THEN
      RAISE EXCEPTION 'Acesso negado: vendedor só pode consultar seus próprios dados.';
    END IF;
  END IF;

  WITH scoped_cycles AS (
    SELECT
      sc.current_group_id,
      sc.status
    FROM public.sales_cycles sc
    WHERE sc.company_id = p_company_id
      AND (
        (
          sc.status = 'ganho'
          AND (
            p_date_start IS NULL
            OR COALESCE(
              sc.revenue_seller_ref_date::date,
              (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
              (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
            ) >= p_date_start
          )
          AND (
            p_date_end IS NULL
            OR COALESCE(
              sc.revenue_seller_ref_date::date,
              (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
              (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
            ) <= p_date_end
          )
          AND (
            p_owner_id IS NULL
            OR COALESCE(sc.won_owner_user_id, sc.owner_user_id) = p_owner_id
          )
        )
        OR (
          sc.status <> 'ganho'
          AND (p_date_start IS NULL OR sc.stage_entered_at >= p_date_start)
          AND (p_date_end IS NULL OR sc.stage_entered_at < (p_date_end + interval '1 day'))
          AND (p_owner_id IS NULL OR sc.owner_user_id = p_owner_id)
        )
      )
  )
  SELECT COUNT(*)
    INTO v_trabalhados_total
  FROM scoped_cycles
  WHERE status <> 'novo';

  RETURN QUERY
  WITH scoped_cycles AS (
    SELECT
      sc.current_group_id,
      sc.status
    FROM public.sales_cycles sc
    WHERE sc.company_id = p_company_id
      AND (
        (
          sc.status = 'ganho'
          AND (
            p_date_start IS NULL
            OR COALESCE(
              sc.revenue_seller_ref_date::date,
              (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
              (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
            ) >= p_date_start
          )
          AND (
            p_date_end IS NULL
            OR COALESCE(
              sc.revenue_seller_ref_date::date,
              (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
              (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
            ) <= p_date_end
          )
          AND (
            p_owner_id IS NULL
            OR COALESCE(sc.won_owner_user_id, sc.owner_user_id) = p_owner_id
          )
        )
        OR (
          sc.status <> 'ganho'
          AND (p_date_start IS NULL OR sc.stage_entered_at >= p_date_start)
          AND (p_date_end IS NULL OR sc.stage_entered_at < (p_date_end + interval '1 day'))
          AND (p_owner_id IS NULL OR sc.owner_user_id = p_owner_id)
        )
      )
  ),
  agg AS (
    SELECT
      current_group_id AS grp_id,
      COUNT(*) FILTER (WHERE status = 'novo') AS cnt_novo,
      COUNT(*) FILTER (WHERE status = 'contato') AS cnt_contato,
      COUNT(*) FILTER (WHERE status = 'respondeu') AS cnt_respondeu,
      COUNT(*) FILTER (WHERE status = 'negociacao') AS cnt_negociacao,
      COUNT(*) FILTER (WHERE status = 'ganho') AS cnt_ganho,
      COUNT(*) FILTER (WHERE status = 'perdido') AS cnt_perdido,
      COUNT(*) FILTER (WHERE status <> 'novo') AS cnt_trabalhados
    FROM scoped_cycles
    GROUP BY current_group_id
  )
  SELECT
    agg.grp_id AS group_id,
    COALESCE(lg.name, 'Sem grupo') AS group_name,
    agg.cnt_novo::int AS novo,
    agg.cnt_contato::int AS contato,
    agg.cnt_respondeu::int AS respondeu,
    agg.cnt_negociacao::int AS negociacao,
    agg.cnt_ganho::int AS ganho,
    agg.cnt_perdido::int AS perdido,
    agg.cnt_trabalhados::int AS trabalhados,
    CASE
      WHEN agg.cnt_trabalhados = 0 THEN 0::numeric
      ELSE ROUND(agg.cnt_ganho::numeric / agg.cnt_trabalhados::numeric, 6)
    END AS pct_grupo,
    CASE
      WHEN v_trabalhados_total = 0 THEN 0::numeric
      ELSE ROUND(agg.cnt_trabalhados::numeric / v_trabalhados_total::numeric, 6)
    END AS pct_participacao
  FROM agg
  LEFT JOIN public.lead_groups lg
    ON lg.id = agg.grp_id
   AND lg.company_id = p_company_id
  ORDER BY agg.cnt_trabalhados DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_revenue_summary(p_company_id uuid, p_owner_id uuid, p_start_date date, p_end_date date, p_metric text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_total numeric := 0;
  v_days json;
begin
  if p_metric not in ('faturamento', 'recebimento') then
    raise exception 'Invalid metric: %', p_metric;
  end if;

  -- Hoje a fonte real é faturamento real nas views v_revenue_daily_*
  if p_metric = 'recebimento' then
    raise exception 'Metric "recebimento" ainda não implementada nas views (v_revenue_daily_*)';
  end if;

  with date_series as (
    select d::date as ref_date
    from generate_series(p_start_date, p_end_date, interval '1 day') as d
  ),
  seller_daily as (
    select ref_date, sum(real_value)::numeric as value
    from public.v_revenue_daily_seller
    where company_id = p_company_id
      and ref_date between p_start_date and p_end_date
      and (p_owner_id is null or seller_id = p_owner_id)
    group by ref_date
  ),
  extra_daily as (
    -- extras só entram quando for empresa (owner_id null)
    select ref_date, sum(real_value)::numeric as value
    from public.v_revenue_daily_extra
    where company_id = p_company_id
      and ref_date between p_start_date and p_end_date
      and p_owner_id is null
    group by ref_date
  ),
  daily as (
    select
      ds.ref_date,
      coalesce(sd.value, 0) + coalesce(ed.value, 0) as value
    from date_series ds
    left join seller_daily sd on sd.ref_date = ds.ref_date
    left join extra_daily ed on ed.ref_date = ds.ref_date
    order by ds.ref_date asc
  )
  select
    coalesce(sum(value), 0),
    json_agg(json_build_object('date', ref_date::text, 'value', value) order by ref_date asc)
  into v_total, v_days
  from daily;

  return json_build_object(
    'success', true,
    'total_real', v_total,
    'days', coalesce(v_days, '[]'::json)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.current_profile()
 RETURNS TABLE(company_id uuid, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  select p.company_id, p.role
  from public.profiles p
  where p.id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_upsert_revenue_goal(p_company_id uuid, p_owner_id uuid, p_date_start date, p_date_end date, p_goal_value numeric)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_existing_id uuid;
begin
  SELECT id INTO v_existing_id
  FROM public.revenue_goals
  WHERE company_id = p_company_id
    AND date_start = p_date_start
    AND date_end = p_date_end
    AND (
      (owner_id IS NULL AND p_owner_id IS NULL)
      OR (owner_id = p_owner_id)
    )
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.revenue_goals
    SET goal_value = greatest(0, p_goal_value),
        updated_at = now()
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.revenue_goals (company_id, owner_id, date_start, date_end, goal_value, created_by)
    VALUES (p_company_id, p_owner_id, p_date_start, p_date_end, greatest(0, p_goal_value), auth.uid());
  END IF;

  RETURN json_build_object('success', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_admin_list_sellers_stats(p_days integer DEFAULT 30)
 RETURNS TABLE(seller_id uuid, full_name text, email text, role text, is_active boolean, active_cycles_count bigint, novo_count bigint, contato_count bigint, respondeu_count bigint, negociacao_count bigint, ganho_count_period bigint, perdido_count_period bigint, last_activity_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa ativa ambígua. Use rpc_admin_list_sellers_stats_for_company com p_company_id.';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.rpc_admin_list_sellers_stats_for_company(v_company_id, p_days);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_seller_access(p_seller_id uuid, p_role text, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa ativa ambígua. Use rpc_admin_update_seller_access_for_company com p_company_id.';
  END IF;

  RETURN public.rpc_admin_update_seller_access_for_company(
    v_company_id,
    p_seller_id,
    p_role,
    p_is_active
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_company_sla_rules()
 RETURNS SETOF sla_rules
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT * FROM public.sla_rules
  WHERE company_id = v_company_id
  ORDER BY status;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_upsert_company_sla_rules(p_rules jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_rule       jsonb;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  -- Only admins may write SLA rules
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  FOR v_rule IN SELECT * FROM jsonb_array_elements(p_rules)
  LOOP
    INSERT INTO public.sla_rules (
      company_id, status, target_minutes, warning_minutes, danger_minutes, updated_at
    ) VALUES (
      v_company_id,
      v_rule->>'status',
      (v_rule->>'target_minutes')::integer,
      (v_rule->>'warning_minutes')::integer,
      (v_rule->>'danger_minutes')::integer,
      now()
    )
    ON CONFLICT (company_id, status) DO UPDATE SET
      target_minutes  = EXCLUDED.target_minutes,
      warning_minutes = EXCLUDED.warning_minutes,
      danger_minutes  = EXCLUDED.danger_minutes,
      updated_at      = now();
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_create_lead_group(p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_new_id     uuid;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lead_groups
    WHERE company_id = v_company_id
      AND name = p_name
      AND archived_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Já existe um grupo com esse nome');
  END IF;

  INSERT INTO public.lead_groups (company_id, name)
  VALUES (v_company_id, p_name)
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'id', v_new_id, 'name', p_name);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_seller_micro_kpis(p_owner_user_id uuid, p_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id        uuid;
  v_today_start       timestamptz;
  v_period_start      timestamptz;
  v_worked_today      bigint;
  v_overdue_count     bigint;
  v_scheduled_today   bigint;
  v_stage_moves_today bigint;
  v_worked_period     bigint;
  v_advanced_period   bigint;
  v_advance_rate      numeric;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('error', 'company_not_found');
  END IF;

  v_today_start  := date_trunc('day', now());
  v_period_start := date_trunc('day', now() - (p_days || ' days')::interval);

  SELECT COUNT(DISTINCT ce.cycle_id) INTO v_worked_today
  FROM public.cycle_events ce
  JOIN public.sales_cycles sc
    ON sc.id = ce.cycle_id
   AND sc.company_id = ce.company_id
  JOIN public.leads l
    ON l.id = sc.lead_id
   AND l.deleted_at IS NULL
  WHERE ce.company_id  = v_company_id
    AND ce.created_by  = p_owner_user_id
    AND ce.occurred_at >= v_today_start;

  SELECT COUNT(*) INTO v_overdue_count
  FROM public.sales_cycles sc
  JOIN public.leads l
    ON l.id = sc.lead_id
   AND l.deleted_at IS NULL
  WHERE sc.company_id        = v_company_id
    AND sc.owner_user_id     = p_owner_user_id
    AND sc.next_action_date IS NOT NULL
    AND sc.next_action_date  < now()
    AND sc.status NOT IN ('ganho', 'perdido');

  SELECT COUNT(*) INTO v_scheduled_today
  FROM public.sales_cycles sc
  JOIN public.leads l
    ON l.id = sc.lead_id
   AND l.deleted_at IS NULL
  WHERE sc.company_id        = v_company_id
    AND sc.owner_user_id     = p_owner_user_id
    AND sc.next_action_date IS NOT NULL
    AND sc.next_action_date >= v_today_start
    AND sc.next_action_date  < v_today_start + interval '1 day'
    AND sc.status NOT IN ('ganho', 'perdido');

  SELECT COUNT(*) INTO v_stage_moves_today
  FROM public.cycle_events ce
  JOIN public.sales_cycles sc
    ON sc.id = ce.cycle_id
   AND sc.company_id = ce.company_id
  JOIN public.leads l
    ON l.id = sc.lead_id
   AND l.deleted_at IS NULL
  WHERE ce.company_id  = v_company_id
    AND ce.created_by  = p_owner_user_id
    AND ce.occurred_at >= v_today_start
    AND ce.event_type IN ('stage_checkpoint', 'stage_changed', 'stage_moved');

  SELECT COUNT(DISTINCT ce.cycle_id) INTO v_worked_period
  FROM public.cycle_events ce
  JOIN public.sales_cycles sc
    ON sc.id = ce.cycle_id
   AND sc.company_id = ce.company_id
  JOIN public.leads l
    ON l.id = sc.lead_id
   AND l.deleted_at IS NULL
  WHERE ce.company_id  = v_company_id
    AND ce.created_by  = p_owner_user_id
    AND ce.occurred_at >= v_period_start;

  SELECT COUNT(DISTINCT ce.cycle_id) INTO v_advanced_period
  FROM public.cycle_events ce
  JOIN public.sales_cycles sc
    ON sc.id = ce.cycle_id
   AND sc.company_id = ce.company_id
  JOIN public.leads l
    ON l.id = sc.lead_id
   AND l.deleted_at IS NULL
  WHERE ce.company_id  = v_company_id
    AND ce.created_by  = p_owner_user_id
    AND ce.occurred_at >= v_period_start
    AND ce.event_type IN ('stage_checkpoint', 'stage_changed', 'stage_moved');

  IF v_worked_period > 0 THEN
    v_advance_rate := ROUND((v_advanced_period::numeric / v_worked_period::numeric) * 100, 1);
  ELSE
    v_advance_rate := 0;
  END IF;

  RETURN jsonb_build_object(
    'worked_today',      v_worked_today,
    'overdue_count',     v_overdue_count,
    'scheduled_today',   v_scheduled_today,
    'stage_moves_today', v_stage_moves_today,
    'worked_period',     v_worked_period,
    'advanced_period',   v_advanced_period,
    'advance_rate',      v_advance_rate,
    'period_days',       p_days
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_seller_worklist(p_owner_user_id uuid, p_group_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id  uuid;
  v_today_start timestamptz;
  v_overdue     jsonb;
  v_today       jsonb;
  v_sla_danger  jsonb;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('error', 'company_not_found');
  END IF;

  v_today_start := date_trunc('day', now());

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_overdue
  FROM (
    SELECT sc.id, sc.lead_id, l.name, l.phone, sc.status::text AS status,
           sc.next_action, sc.next_action_date, sc.stage_entered_at
    FROM public.sales_cycles sc
    JOIN public.leads l
      ON l.id = sc.lead_id
     AND l.deleted_at IS NULL
    WHERE sc.company_id        = v_company_id
      AND sc.owner_user_id     = p_owner_user_id
      AND sc.next_action_date IS NOT NULL
      AND sc.next_action_date  < now()
      AND sc.status NOT IN ('ganho', 'perdido')
      AND (p_group_id IS NULL OR sc.current_group_id = p_group_id)
    ORDER BY sc.next_action_date ASC
    LIMIT p_limit
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_today
  FROM (
    SELECT sc.id, sc.lead_id, l.name, l.phone, sc.status::text AS status,
           sc.next_action, sc.next_action_date, sc.stage_entered_at
    FROM public.sales_cycles sc
    JOIN public.leads l
      ON l.id = sc.lead_id
     AND l.deleted_at IS NULL
    WHERE sc.company_id        = v_company_id
      AND sc.owner_user_id     = p_owner_user_id
      AND sc.next_action_date IS NOT NULL
      AND sc.next_action_date >= v_today_start
      AND sc.next_action_date  < v_today_start + interval '1 day'
      AND sc.status NOT IN ('ganho', 'perdido')
      AND (p_group_id IS NULL OR sc.current_group_id = p_group_id)
    ORDER BY sc.next_action_date ASC
    LIMIT p_limit
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_sla_danger
  FROM (
    SELECT sc.id, sc.lead_id, l.name, l.phone, sc.status::text AS status,
           sc.next_action, sc.next_action_date, sc.stage_entered_at,
           ROUND(EXTRACT(EPOCH FROM (now() - sc.stage_entered_at)) / 60) AS minutes_in_stage
    FROM public.sales_cycles sc
    JOIN public.leads l
      ON l.id = sc.lead_id
     AND l.deleted_at IS NULL
    LEFT JOIN public.sla_rules sr
      ON sr.company_id = v_company_id AND sr.status = sc.status::text
    WHERE sc.company_id    = v_company_id
      AND sc.owner_user_id = p_owner_user_id
      AND sc.status NOT IN ('ganho', 'perdido')
      AND (p_group_id IS NULL OR sc.current_group_id = p_group_id)
      AND EXTRACT(EPOCH FROM (now() - sc.stage_entered_at)) / 60
          >= COALESCE(sr.danger_minutes, 2880)
    ORDER BY sc.stage_entered_at ASC
    LIMIT p_limit
  ) t;

  RETURN jsonb_build_object(
    'overdue',    v_overdue,
    'today',      v_today,
    'sla_danger', v_sla_danger
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_products_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_sales_cycle_metrics_v1(p_owner_user_id uuid DEFAULT NULL::uuid, p_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_is_admin boolean;
  v_owner_filter uuid;
  v_month date;
  v_month_start date;
  v_month_end date;
  v_counts_by_status record;
  v_current_wins integer;
  v_worked_count integer;
  v_total_open integer;
  v_total_pool integer;
  v_result jsonb;
BEGIN
  v_company_id := public.current_company_id();
  v_user_id := auth.uid();
  v_is_admin := public.is_admin();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não identificada';
  END IF;

  IF p_month IS NOT NULL THEN
    v_month := date_trunc('month', p_month)::date;
  ELSE
    v_month := date_trunc('month', now())::date;
  END IF;

  v_month_start := v_month;
  v_month_end := (date_trunc('month', v_month)::date + interval '1 month')::date;

  IF NOT v_is_admin THEN
    v_owner_filter := v_user_id;
  ELSIF p_owner_user_id IS NOT NULL THEN
    v_owner_filter := p_owner_user_id;
  ELSE
    v_owner_filter := NULL;
  END IF;

  SELECT COUNT(*)
    INTO v_current_wins
  FROM public.sales_cycles sc
  WHERE sc.company_id = v_company_id
    AND sc.status = 'ganho'
    AND COALESCE(
      sc.revenue_seller_ref_date::date,
      (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
      (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
    ) >= v_month_start
    AND COALESCE(
      sc.revenue_seller_ref_date::date,
      (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
      (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
    ) < v_month_end
    AND (
      v_owner_filter IS NULL
      OR COALESCE(sc.won_owner_user_id, sc.owner_user_id) = v_owner_filter
    );

  SELECT COUNT(*)
    INTO v_worked_count
  FROM public.sales_cycles sc
  WHERE sc.company_id = v_company_id
    AND sc.status != 'novo'
    AND (
      (
        sc.stage_entered_at >= v_month_start
        AND sc.stage_entered_at < v_month_end
        AND (v_owner_filter IS NULL OR sc.owner_user_id = v_owner_filter)
      )
      OR (
        sc.status = 'ganho'
        AND COALESCE(
          sc.revenue_seller_ref_date::date,
          (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
          (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
        ) >= v_month_start
        AND COALESCE(
          sc.revenue_seller_ref_date::date,
          (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
          (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
        ) < v_month_end
        AND (
          v_owner_filter IS NULL
          OR COALESCE(sc.won_owner_user_id, sc.owner_user_id) = v_owner_filter
        )
      )
    );

  SELECT COUNT(*)
    INTO v_total_open
  FROM public.sales_cycles sc
  WHERE sc.company_id = v_company_id
    AND sc.status NOT IN ('ganho', 'perdido')
    AND (v_owner_filter IS NULL OR sc.owner_user_id = v_owner_filter);

  v_total_pool := 0;

  IF v_is_admin AND v_owner_filter IS NULL THEN
    SELECT COUNT(*)
      INTO v_total_pool
    FROM public.sales_cycles sc
    WHERE sc.company_id = v_company_id
      AND sc.owner_user_id IS NULL
      AND sc.status = 'novo';
  END IF;

  WITH scoped_cycles AS (
    SELECT
      sc.status
    FROM public.sales_cycles sc
    WHERE sc.company_id = v_company_id
      AND (
        (
          sc.status = 'ganho'
          AND COALESCE(
            sc.revenue_seller_ref_date::date,
            (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
            (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
          ) >= v_month_start
          AND COALESCE(
            sc.revenue_seller_ref_date::date,
            (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
            (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
          ) < v_month_end
          AND (
            v_owner_filter IS NULL
            OR COALESCE(sc.won_owner_user_id, sc.owner_user_id) = v_owner_filter
          )
        )
        OR (
          sc.status <> 'ganho'
          AND sc.stage_entered_at >= v_month_start
          AND sc.stage_entered_at < v_month_end
          AND (v_owner_filter IS NULL OR sc.owner_user_id = v_owner_filter)
        )
      )
  ),
  status_counts AS (
    SELECT status, COUNT(*) AS cnt
    FROM scoped_cycles
    GROUP BY status
  )
  SELECT
    COALESCE((SELECT cnt FROM status_counts WHERE status = 'novo'), 0) AS novo,
    COALESCE((SELECT cnt FROM status_counts WHERE status = 'contato'), 0) AS contato,
    COALESCE((SELECT cnt FROM status_counts WHERE status = 'respondeu'), 0) AS respondeu,
    COALESCE((SELECT cnt FROM status_counts WHERE status = 'negociacao'), 0) AS negociacao,
    COALESCE((SELECT cnt FROM status_counts WHERE status = 'ganho'), 0) AS ganho,
    COALESCE((SELECT cnt FROM status_counts WHERE status = 'perdido'), 0) AS perdido
  INTO v_counts_by_status;

  v_result := jsonb_build_object(
    'company_id', v_company_id::text,
    'month_start', v_month_start::text,
    'month_end', v_month_end::text,
    'owner_user_id', COALESCE(v_owner_filter::text, 'null'),
    'is_admin', v_is_admin,
    'current_wins', v_current_wins,
    'worked_count', v_worked_count,
    'total_open', v_total_open,
    'total_pool', v_total_pool,
    'counts_by_status', jsonb_build_object(
      'novo', v_counts_by_status.novo,
      'contato', v_counts_by_status.contato,
      'respondeu', v_counts_by_status.respondeu,
      'negociacao', v_counts_by_status.negociacao,
      'ganho', v_counts_by_status.ganho,
      'perdido', v_counts_by_status.perdido
    )
  );

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.report_sla_risk(p_company_id uuid)
 RETURNS TABLE(lead_id uuid, name text, phone text, stage text, seconds_in_stage integer, sla_seconds integer, over_seconds integer, owner_user_id uuid, owner_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
begin
  if not public.has_company_membership_strict(p_company_id, null) then
    raise exception using errcode = '42501';
  end if;

  return query
  with base as (
    select
      sc.lead_id,
      l.name,
      l.phone,
      sc.status::text as stage,
      sc.owner_user_id,
      p.full_name as owner_name,
      coalesce(sc.stage_entered_at, sc.created_at) as entered_at
    from public.sales_cycles sc
    join public.leads l on l.id = sc.lead_id
    left join public.profiles p on p.id = sc.owner_user_id
    where sc.company_id = p_company_id
      and sc.status not in ('ganho', 'perdido')
  ),
  sla_lookup as (
    select
      csr.status::text as status,
      csr.danger_minutes * 60 as sla_secs
    from public.company_sla_rules csr
    where csr.company_id = p_company_id
  ),
  calc as (
    select
      b.lead_id,
      b.name,
      b.phone,
      b.stage,
      b.owner_user_id,
      b.owner_name,
      greatest(0, floor(extract(epoch from (now() - b.entered_at)))::int) as seconds_in_stage,
      coalesce(
        sl.sla_secs,
        case b.stage
          when 'novo' then 7200
          when 'contato' then 86400
          when 'respondeu' then 172800
          when 'negociacao' then 259200
          else 172800
        end
      )::int as sla_seconds
    from base b
    left join sla_lookup sl on sl.status = b.stage
  )
  select
    calc.lead_id,
    calc.name,
    calc.phone,
    calc.stage,
    calc.seconds_in_stage,
    calc.sla_seconds,
    (calc.seconds_in_stage - calc.sla_seconds)::int as over_seconds,
    calc.owner_user_id,
    calc.owner_name
  from calc
  where calc.seconds_in_stage > calc.sla_seconds
  order by over_seconds desc, seconds_in_stage desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.report_stage_conversion(p_company_id uuid)
 RETURNS TABLE(step_order integer, from_stage text, to_stage text, entered bigint, progressed bigint, conversion numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
with steps as (
  select 1 as step_order, 'novo'::text as from_stage, 'contato'::text as to_stage union all
  select 2, 'contato', 'respondeu' union all
  select 3, 'respondeu', 'negociacao' union all
  select 4, 'negociacao', 'ganho'
),
entered_counts as (
  -- "novo" = todos os sales_cycles criados
  select 'novo'::text as stage, count(distinct sc.id) as n
  from sales_cycles sc
  where sc.company_id = p_company_id

  union all

  -- demais etapas = cycle_events que moveram para essa etapa
  select (ce.metadata->>'to_status')::text as stage, count(distinct ce.cycle_id) as n
  from cycle_events ce
  where ce.company_id = p_company_id
    and ce.event_type in ('stage_changed', 'stage_checkpoint', 'stage_moved')
    and ce.metadata->>'to_status' in ('contato', 'respondeu', 'negociacao', 'ganho')
  group by ce.metadata->>'to_status'
),
progressed_counts as (
  select
    (ce.metadata->>'from_status')::text as from_stage,
    (ce.metadata->>'to_status')::text as to_stage,
    count(distinct ce.cycle_id) as n
  from cycle_events ce
  where ce.company_id = p_company_id
    and ce.event_type in ('stage_changed', 'stage_checkpoint', 'stage_moved')
    and ce.metadata->>'from_status' is not null
    and ce.metadata->>'to_status' is not null
  group by ce.metadata->>'from_status', ce.metadata->>'to_status'
)
select
  s.step_order,
  s.from_stage,
  s.to_stage,
  coalesce(en.n, 0) as entered,
  coalesce(pr.n, 0) as progressed,
  case
    when coalesce(en.n, 0) = 0 then 0
    else round((coalesce(pr.n,0)::numeric / en.n::numeric) * 100, 2)
  end as conversion
from steps s
left join entered_counts en on en.stage = s.from_stage
left join progressed_counts pr on pr.from_stage = s.from_stage and pr.to_stage = s.to_stage
order by s.step_order;
$function$
;

CREATE OR REPLACE FUNCTION public.report_stage_losses(p_company_id uuid)
 RETURNS TABLE(step_order integer, stage text, lost_to text, entered bigint, lost bigint, loss_rate numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
with steps as (
  select 1 as step_order, 'novo'::text as stage union all
  select 2, 'contato' union all
  select 3, 'respondeu' union all
  select 4, 'negociacao'
),
entered_counts as (
  select 'novo'::text as stage, count(distinct sc.id) as n
  from sales_cycles sc
  where sc.company_id = p_company_id

  union all

  select (ce.metadata->>'to_status')::text as stage, count(distinct ce.cycle_id) as n
  from cycle_events ce
  where ce.company_id = p_company_id
    and ce.event_type in ('stage_changed', 'stage_checkpoint', 'stage_moved')
    and ce.metadata->>'to_status' in ('contato', 'respondeu', 'negociacao')
  group by ce.metadata->>'to_status'
),
lost_counts as (
  -- Ciclos que foram para perdido, vindos de cada etapa
  select (ce.metadata->>'from_status')::text as stage, count(distinct ce.cycle_id) as n
  from cycle_events ce
  where ce.company_id = p_company_id
    and ce.event_type in ('stage_changed', 'stage_checkpoint', 'stage_moved', 'cycle_lost')
    and (ce.metadata->>'to_status' = 'perdido'
         OR ce.event_type = 'cycle_lost')
    and ce.metadata->>'from_status' in ('novo', 'contato', 'respondeu', 'negociacao')
  group by ce.metadata->>'from_status'
)
select
  s.step_order,
  s.stage,
  'perdido'::text as lost_to,
  coalesce(en.n, 0) as entered,
  coalesce(lo.n, 0) as lost,
  case
    when coalesce(en.n, 0) = 0 then 0
    else round((coalesce(lo.n,0)::numeric / en.n::numeric) * 100, 2)
  end as loss_rate
from steps s
left join entered_counts en on en.stage = s.stage
left join lost_counts lo on lo.stage = s.stage
order by s.step_order;
$function$
;

CREATE OR REPLACE FUNCTION public.report_stage_time_summary(p_company_id uuid)
 RETURNS TABLE(from_stage text, moves bigint, avg_seconds numeric, median_seconds numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
with stage_durations as (
  select
    (ce.metadata->>'from_status')::text as from_stage,
    -- Tempo que ficou na etapa anterior (em segundos)
    greatest(0,
      extract(epoch from (ce.occurred_at - coalesce(
        -- Tenta pegar quando entrou na etapa anterior
        (select ce2.occurred_at
         from cycle_events ce2
         where ce2.cycle_id = ce.cycle_id
           and ce2.company_id = p_company_id
           and ce2.event_type in ('stage_changed', 'stage_checkpoint', 'stage_moved')
           and ce2.metadata->>'to_status' = ce.metadata->>'from_status'
           and ce2.occurred_at < ce.occurred_at
         order by ce2.occurred_at desc
         limit 1),
        -- Se não achar evento anterior, usa created_at do cycle
        (select sc.created_at from sales_cycles sc where sc.id = ce.cycle_id)
      )))
    ) as seconds_in_stage
  from cycle_events ce
  where ce.company_id = p_company_id
    and ce.event_type in ('stage_changed', 'stage_checkpoint', 'stage_moved')
    and ce.metadata->>'from_status' is not null
    and ce.metadata->>'from_status' not in ('ganho', 'perdido')
)
select
  sd.from_stage,
  count(*) as moves,
  round(avg(sd.seconds_in_stage)::numeric, 0) as avg_seconds,
  round(percentile_cont(0.5) within group (order by sd.seconds_in_stage)::numeric, 0) as median_seconds
from stage_durations sd
where sd.seconds_in_stage > 0
group by sd.from_stage
order by avg_seconds desc;
$function$
;

CREATE OR REPLACE FUNCTION public.report_meta_vs_real(p_company_id uuid, p_start_date date DEFAULT (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date, p_end_date date DEFAULT (((date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) + '1 mon'::interval) - '1 day'::interval))::date)
 RETURNS TABLE(meta_empresa numeric, meta_start date, meta_end date, ticket_simulador numeric, total_ganhos bigint, faturamento numeric, ticket_medio numeric, ciclos_trabalhados bigint, total_movimentos bigint, dias_uteis_total integer, dias_uteis_passados integer, dias_uteis_restantes integer, taxa_conversao_real numeric, total_ciclos_abertos bigint, total_pool bigint, top_seller_name text, top_seller_wins bigint, top_seller_faturamento numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
with meta as (
  select
    rg.goal_value as meta_empresa,
    coalesce(rg.ticket_medio, 0) as ticket_simulador
  from revenue_goals rg
  where rg.company_id = p_company_id
    and rg.owner_id is null
    and rg.date_start = p_start_date
  order by rg.created_at desc
  limit 1
),
ganhos as (
  select
    count(*) filter (where sc.won_total > 0) as total_ganhos,
    coalesce(sum(sc.won_total) filter (where sc.won_total > 0), 0) as faturamento,
    case when count(*) filter (where sc.won_total > 0) > 0
      then round(sum(sc.won_total) filter (where sc.won_total > 0) / count(*) filter (where sc.won_total > 0), 2)
      else 0
    end as ticket_medio
  from sales_cycles sc
  where sc.company_id = p_company_id
    and sc.status = 'ganho'
    and sc.won_at >= p_start_date
    and sc.won_at < p_end_date + interval '1 day'
),
trabalhados as (
  select
    count(distinct ce.cycle_id) as ciclos_trabalhados,
    count(*) as total_movimentos
  from cycle_events ce
  where ce.company_id = p_company_id
    and ce.event_type in ('stage_changed', 'stage_checkpoint', 'stage_moved')
    and ce.occurred_at >= p_start_date
    and ce.occurred_at < p_end_date + interval '1 day'
),
abertos as (
  select
    count(*) as total_ciclos_abertos,
    count(*) filter (where sc.owner_user_id is null) as total_pool
  from sales_cycles sc
  where sc.company_id = p_company_id
    and sc.status not in ('ganho', 'perdido')
),
dias as (
  select
    (select count(*) from generate_series(p_start_date, p_end_date, '1 day'::interval) d
     where extract(dow from d) between 1 and 5) as dias_uteis_total,
    (select count(*) from generate_series(p_start_date, least(current_date, p_end_date), '1 day'::interval) d
     where extract(dow from d) between 1 and 5) as dias_uteis_passados
),
top_seller as (
  select
    p.full_name as top_seller_name,
    count(*) as top_seller_wins,
    coalesce(sum(sc.won_total), 0) as top_seller_faturamento
  from sales_cycles sc
  join profiles p on p.id = sc.owner_user_id
  where sc.company_id = p_company_id
    and sc.status = 'ganho'
    and sc.won_at >= p_start_date
    and sc.won_at < p_end_date + interval '1 day'
    and sc.owner_user_id is not null
    and sc.won_total > 0
  group by p.full_name
  order by sum(sc.won_total) desc
  limit 1
)
select
  coalesce(m.meta_empresa, 0) as meta_empresa,
  p_start_date as meta_start,
  p_end_date as meta_end,
  coalesce(m.ticket_simulador, 0) as ticket_simulador,
  g.total_ganhos,
  g.faturamento,
  g.ticket_medio,
  t.ciclos_trabalhados,
  t.total_movimentos,
  d.dias_uteis_total::int,
  d.dias_uteis_passados::int,
  greatest(0, d.dias_uteis_total - d.dias_uteis_passados)::int as dias_uteis_restantes,
  case when t.ciclos_trabalhados > 0
    then round(g.total_ganhos::numeric / t.ciclos_trabalhados::numeric * 100, 2)
    else 0
  end as taxa_conversao_real,
  ab.total_ciclos_abertos,
  ab.total_pool,
  ts.top_seller_name,
  ts.top_seller_wins,
  ts.top_seller_faturamento
from ganhos g, trabalhados t, dias d, abertos ab
left join top_seller ts on true
left join meta m on true;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_reset_cycle_state_on_assignment(p_cycle_id uuid, p_new_owner_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_event_type text;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  SELECT *
    INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_not_found');
  END IF;

  v_event_type := CASE
    WHEN p_new_owner_user_id IS NULL THEN 'returned_to_pool'
    WHEN v_cycle.owner_user_id IS NULL THEN 'assigned'
    ELSE 'reassigned'
  END;

  UPDATE public.sales_cycles
  SET
    owner_user_id = p_new_owner_user_id,
    status = 'novo',
    stage_entered_at = now(),
    updated_at = now()
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  ) VALUES (
    p_cycle_id,
    v_company_id,
    v_event_type,
    jsonb_build_object(
      'from_owner', v_cycle.owner_user_id,
      'to_owner', p_new_owner_user_id,
      'from_status', v_cycle.status,
      'to_status', 'novo',
      'reset', true
    ),
    auth.uid(),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'event_type', v_event_type,
    'reset_to_status', 'novo'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_touch_cycle_in_current_competency(p_cycle_id uuid, p_touch_type text DEFAULT 'worked'::text, p_touch_at timestamp with time zone DEFAULT now(), p_won_total numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cycle record;
  v_competency record;
  v_touch_at timestamptz;
  v_owner_user_id uuid;
  v_existing_id uuid;
begin
  v_touch_at := coalesce(p_touch_at, now());

  if p_touch_type not in ('worked', 'move', 'won', 'lost') then
    return jsonb_build_object('success', false, 'error', 'invalid_touch_type');
  end if;

  select
    sc.id,
    sc.company_id,
    sc.owner_user_id,
    sc.status,
    sc.won_total
  into v_cycle
  from public.sales_cycles sc
  where sc.id = p_cycle_id
  limit 1;

  if v_cycle is null then
    return jsonb_build_object('success', false, 'error', 'cycle_not_found');
  end if;

  select
    c.id,
    c.month
  into v_competency
  from public.competencies c
  where c.company_id = v_cycle.company_id
    and c.is_active = true
  limit 1;

  if v_competency is null then
    return jsonb_build_object('success', false, 'error', 'active_competency_not_found');
  end if;

  v_owner_user_id := v_cycle.owner_user_id;

  select scpa.id
  into v_existing_id
  from public.sales_cycle_period_activity scpa
  where scpa.cycle_id = p_cycle_id
    and scpa.competency_id = v_competency.id
  limit 1;

  if v_existing_id is null then
    insert into public.sales_cycle_period_activity (
      company_id,
      cycle_id,
      competency_id,
      owner_user_id,
      first_touched_at,
      last_touched_at,
      was_worked,
      was_won,
      was_lost,
      won_total_in_period,
      move_count
    )
    values (
      v_cycle.company_id,
      p_cycle_id,
      v_competency.id,
      v_owner_user_id,
      v_touch_at,
      v_touch_at,
      (p_touch_type in ('worked', 'move', 'won', 'lost')),
      (p_touch_type = 'won'),
      (p_touch_type = 'lost'),
      case
        when p_touch_type = 'won' then greatest(0, coalesce(p_won_total, v_cycle.won_total, 0))
        else 0
      end,
      case when p_touch_type = 'move' then 1 else 0 end
    );
  else
    update public.sales_cycle_period_activity
    set
      owner_user_id = coalesce(v_owner_user_id, owner_user_id),
      last_touched_at = greatest(last_touched_at, v_touch_at),
      was_worked = case
        when p_touch_type in ('worked', 'move', 'won', 'lost') then true
        else was_worked
      end,
      was_won = case
        when p_touch_type = 'won' then true
        else was_won
      end,
      was_lost = case
        when p_touch_type = 'lost' then true
        else was_lost
      end,
      won_total_in_period = case
        when p_touch_type = 'won' then greatest(won_total_in_period, greatest(0, coalesce(p_won_total, v_cycle.won_total, 0)))
        else won_total_in_period
      end,
      move_count = case
        when p_touch_type = 'move' then move_count + 1
        else move_count
      end,
      updated_at = now()
    where id = v_existing_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'cycle_id', p_cycle_id,
    'competency_id', v_competency.id,
    'competency_month', v_competency.month,
    'touch_type', p_touch_type,
    'touched_at', v_touch_at
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_report_period_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid;
  v_competency record;
  v_summary jsonb;
begin
  v_company_id := public.current_company_id();

  if v_company_id is null then
    return jsonb_build_object('success', false, 'error', 'company_not_found');
  end if;

  select
    c.id,
    c.month
  into v_competency
  from public.competencies c
  where c.company_id = v_company_id
    and c.is_active = true
  limit 1;

  if v_competency is null then
    return jsonb_build_object('success', false, 'error', 'active_competency_not_found');
  end if;

  with period_data as (
    select
      scpa.owner_user_id,
      scpa.was_worked,
      scpa.was_won,
      scpa.was_lost,
      scpa.won_total_in_period
    from public.sales_cycle_period_activity scpa
    where scpa.company_id = v_company_id
      and scpa.competency_id = v_competency.id
  ),
  totals as (
    select
      count(*) filter (where was_worked) as worked_count,
      count(*) filter (where was_won) as won_count,
      count(*) filter (where was_lost) as lost_count,
      coalesce(sum(won_total_in_period), 0) as revenue_total
    from period_data
  ),
  by_owner as (
    select jsonb_agg(
      jsonb_build_object(
        'owner_user_id', owner_user_id,
        'worked_count', worked_count,
        'won_count', won_count,
        'lost_count', lost_count,
        'revenue_total', revenue_total
      )
      order by revenue_total desc
    ) as rows
    from (
      select
        owner_user_id,
        count(*) filter (where was_worked) as worked_count,
        count(*) filter (where was_won) as won_count,
        count(*) filter (where was_lost) as lost_count,
        coalesce(sum(won_total_in_period), 0) as revenue_total
      from period_data
      group by owner_user_id
    ) t
  ),
  pool_now as (
    select count(*) as total_pool
    from public.sales_cycles sc
    where sc.company_id = v_company_id
      and sc.owner_user_id is null
      and sc.status not in ('ganho', 'perdido')
  )
  select jsonb_build_object(
    'success', true,
    'competency_id', v_competency.id,
    'competency_name', to_char(v_competency.month, 'TMMonth YYYY'),
    'start_date', date_trunc('month', v_competency.month)::date,
    'end_date', (date_trunc('month', v_competency.month) + interval '1 month')::date,
    'worked_count', coalesce(t.worked_count, 0),
    'won_count', coalesce(t.won_count, 0),
    'lost_count', coalesce(t.lost_count, 0),
    'revenue_total', coalesce(t.revenue_total, 0),
    'total_pool_now', coalesce(p.total_pool, 0),
    'by_owner', coalesce(o.rows, '[]'::jsonb)
  )
  into v_summary
  from totals t
  cross join by_owner o
  cross join pool_now p;

  return v_summary;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_simulator_period_metrics(p_owner_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid;
  v_competency record;
  v_result jsonb;
begin
  v_company_id := public.current_company_id();

  if v_company_id is null then
    return jsonb_build_object('success', false, 'error', 'company_not_found');
  end if;

  select
    c.id,
    c.month
  into v_competency
  from public.competencies c
  where c.company_id = v_company_id
    and c.is_active = true
  limit 1;

  if v_competency is null then
    return jsonb_build_object('success', false, 'error', 'active_competency_not_found');
  end if;

  with period_rows as (
    select
      scpa.owner_user_id,
      scpa.was_worked,
      scpa.was_won,
      scpa.was_lost,
      scpa.won_total_in_period
    from public.sales_cycle_period_activity scpa
    where scpa.company_id = v_company_id
      and scpa.competency_id = v_competency.id
      and (
        p_owner_user_id is null
        or scpa.owner_user_id = p_owner_user_id
      )
  ),
  open_now as (
    select count(*) as total_open
    from public.sales_cycles sc
    where sc.company_id = v_company_id
      and sc.status not in ('ganho', 'perdido')
      and (
        p_owner_user_id is null
        or sc.owner_user_id = p_owner_user_id
      )
  ),
  pool_now as (
    select count(*) as total_pool
    from public.sales_cycles sc
    where sc.company_id = v_company_id
      and sc.owner_user_id is null
      and sc.status not in ('ganho', 'perdido')
  ),
  status_counts as (
    select
      count(*) filter (where sc.status = 'novo') as novo,
      count(*) filter (where sc.status = 'contato') as contato,
      count(*) filter (where sc.status = 'respondeu') as respondeu,
      count(*) filter (where sc.status = 'negociacao') as negociacao,
      count(*) filter (where sc.status = 'ganho') as ganho,
      count(*) filter (where sc.status = 'perdido') as perdido
    from public.sales_cycles sc
    where sc.company_id = v_company_id
      and (
        p_owner_user_id is null
        or sc.owner_user_id = p_owner_user_id
      )
  ),
  totals as (
    select
      count(*) filter (where was_won) as current_wins,
      count(*) filter (where was_worked) as worked_count,
      count(*) filter (where was_lost) as lost_count,
      coalesce(sum(won_total_in_period), 0) as total_real
    from period_rows
  )
  select jsonb_build_object(
    'success', true,
    'company_id', v_company_id,
    'month', to_char(v_competency.month, 'TMMonth YYYY'),
    'month_start', date_trunc('month', v_competency.month)::date,
    'month_end', (date_trunc('month', v_competency.month) + interval '1 month')::date,
    'owner_user_id', p_owner_user_id,
    'current_wins', coalesce(t.current_wins, 0),
    'worked_count', coalesce(t.worked_count, 0),
    'lost_count', coalesce(t.lost_count, 0),
    'total_real', coalesce(t.total_real, 0),
    'total_open', coalesce(o.total_open, 0),
    'total_pool', coalesce(p.total_pool, 0),
    'counts_by_status', jsonb_build_object(
      'novo', coalesce(s.novo, 0),
      'contato', coalesce(s.contato, 0),
      'respondeu', coalesce(s.respondeu, 0),
      'negociacao', coalesce(s.negociacao, 0),
      'ganho', coalesce(s.ganho, 0),
      'perdido', coalesce(s.perdido, 0)
    )
  )
  into v_result
  from totals t
  cross join open_now o
  cross join pool_now p
  cross join status_counts s;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_revenue_period_summary(p_owner_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid;
  v_competency record;
  v_result jsonb;
begin
  v_company_id := public.current_company_id();

  if v_company_id is null then
    return jsonb_build_object('success', false, 'error', 'company_not_found');
  end if;

  select
    c.id,
    c.month
  into v_competency
  from public.competencies c
  where c.company_id = v_company_id
    and c.is_active = true
  limit 1;

  if v_competency is null then
    return jsonb_build_object('success', false, 'error', 'active_competency_not_found');
  end if;

  with rows_period as (
    select
      scpa.owner_user_id,
      scpa.was_worked,
      scpa.was_won,
      scpa.was_lost,
      scpa.won_total_in_period
    from public.sales_cycle_period_activity scpa
    where scpa.company_id = v_company_id
      and scpa.competency_id = v_competency.id
      and (
        p_owner_user_id is null
        or scpa.owner_user_id = p_owner_user_id
      )
  ),
  totals as (
    select
      count(*) filter (where was_worked) as worked_count,
      count(*) filter (where was_won) as won_count,
      count(*) filter (where was_lost) as lost_count,
      coalesce(sum(won_total_in_period), 0) as revenue_total
    from rows_period
  )
  select jsonb_build_object(
    'success', true,
    'competency_id', v_competency.id,
    'competency_name', to_char(v_competency.month, 'TMMonth YYYY'),
    'start_date', date_trunc('month', v_competency.month)::date,
    'end_date', (date_trunc('month', v_competency.month) + interval '1 month')::date,
    'owner_user_id', p_owner_user_id,
    'worked_count', coalesce(t.worked_count, 0),
    'won_count', coalesce(t.won_count, 0),
    'lost_count', coalesce(t.lost_count, 0),
    'revenue_total', coalesce(t.revenue_total, 0),
    'ticket_medio',
      case
        when coalesce(t.won_count, 0) > 0
          then coalesce(t.revenue_total, 0) / t.won_count
        else 0
      end
  )
  into v_result
  from totals t;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_open_next_monthly_competency()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid;
  v_current record;
  v_next_month date;
  v_new_id uuid;
begin
  v_company_id := public.current_company_id();

  if v_company_id is null then
    return jsonb_build_object('success', false, 'error', 'company_not_found');
  end if;

  select *
  into v_current
  from public.competencies
  where company_id = v_company_id
    and is_active = true
  limit 1;

  if v_current is null then
    return jsonb_build_object('success', false, 'error', 'active_competency_not_found');
  end if;

  v_next_month := (date_trunc('month', v_current.month) + interval '1 month')::date;

  update public.competencies
  set is_active = false
  where id = v_current.id;

  insert into public.competencies (
    company_id,
    month,
    is_active
  )
  values (
    v_company_id,
    v_next_month,
    true
  )
  returning id into v_new_id;

  return jsonb_build_object(
    'success', true,
    'competency_id', v_new_id,
    'month', to_char(v_next_month, 'TMMonth YYYY'),
    'month_start', date_trunc('month', v_next_month)::date,
    'month_end', (date_trunc('month', v_next_month) + interval '1 month')::date
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_touch_lead_in_current_competency(p_lead_id uuid, p_touch_type text DEFAULT 'worked'::text, p_touch_at timestamp with time zone DEFAULT now(), p_won_total numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cycle_id uuid;
begin
  select sc.id
  into v_cycle_id
  from public.sales_cycles sc
  where sc.lead_id = p_lead_id
  order by sc.created_at desc
  limit 1;

  if v_cycle_id is null then
    return jsonb_build_object('success', false, 'error', 'cycle_not_found_for_lead');
  end if;

  return public.rpc_touch_cycle_in_current_competency(
    v_cycle_id,
    p_touch_type,
    p_touch_at,
    p_won_total
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_lead_event_period_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_touch_type text;
  v_won_total numeric;
begin
  if new.event_type <> 'stage_changed' then
    return new;
  end if;

  v_touch_type :=
    case
      when new.to_stage = 'ganho' then 'won'
      when new.to_stage = 'perdido' then 'lost'
      else 'move'
    end;

  begin
    v_won_total :=
      case
        when new.metadata ? 'won_total'
          and nullif(new.metadata->>'won_total', '') is not null
        then (new.metadata->>'won_total')::numeric
        else null
      end;
  exception
    when others then
      v_won_total := null;
  end;

  perform public.rpc_touch_lead_in_current_competency(
    new.lead_id,
    v_touch_type,
    coalesce(new.created_at, now()),
    v_won_total
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_lead_status_period_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_touch_type text;
begin
  -- só reage quando o status realmente muda
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_touch_type :=
    case
      when new.status = 'ganho' then 'won'
      when new.status = 'perdido' then 'lost'
      else 'move'
    end;

  perform public.rpc_touch_lead_in_current_competency(
    new.id,
    v_touch_type,
    coalesce(new.stage_entered_at, now()),
    null
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_sales_cycle_period_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_touch_type text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_touch_type :=
    case
      when new.status = 'ganho' then 'won'
      when new.status = 'perdido' then 'lost'
      else 'move'
    end;

  perform public.rpc_touch_cycle_in_current_competency(
    new.id,
    v_touch_type,
    now(),
    new.won_total
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_auto_fill_closed_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  -- Se o status está mudando para um status terminal...
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('ganho', 'perdido', 'cancelado') THEN
      -- Preenche closed_at se não foi explicitamente setado
      IF NEW.closed_at IS NULL THEN
        NEW.closed_at := now();
      END IF;

      -- Preenche won_at se ganho e não setado
      IF NEW.status = 'ganho' AND NEW.won_at IS NULL THEN
        NEW.won_at := now();
      END IF;

      -- Preenche won_owner_user_id se ganho e não setado
      IF NEW.status = 'ganho' AND NEW.won_owner_user_id IS NULL THEN
        NEW.won_owner_user_id := COALESCE(NEW.owner_user_id, OLD.owner_user_id);
      END IF;

      -- Preenche lost_at se perdido e não setado
      IF NEW.status = 'perdido' AND NEW.lost_at IS NULL THEN
        NEW.lost_at := now();
      END IF;

      -- Preenche lost_reason se perdido e não setado
      IF NEW.status = 'perdido' AND NEW.lost_reason IS NULL THEN
        NEW.lost_reason := 'Não informado';
      END IF;

      -- Preenche lost_owner_user_id se perdido e não setado
      IF NEW.status = 'perdido' AND NEW.lost_owner_user_id IS NULL THEN
        NEW.lost_owner_user_id := COALESCE(NEW.owner_user_id, OLD.owner_user_id);
      END IF;

      -- Limpa next_action ao fechar
      NEW.next_action      := NULL;
      NEW.next_action_date := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_user_sales_cycles(p_owner_user_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(cycle_id uuid, cycle_status text, stage_entered_at timestamp with time zone, next_action text, next_action_date timestamp with time zone, owner_user_id uuid, lead_id uuid, lead_name text, lead_phone text, lead_email text, created_at timestamp with time zone, updated_at timestamp with time zone, closed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id    uuid;
  v_is_admin   boolean;
  v_owner      uuid;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN RETURN; END IF;

  v_user_id  := auth.uid();
  v_is_admin := public.is_admin();

  -- Seller pode ver apenas seus ciclos
  IF v_is_admin THEN
    v_owner := p_owner_user_id; -- NULL = todos
  ELSE
    v_owner := v_user_id;
  END IF;

  RETURN QUERY
  SELECT
    sc.id            AS cycle_id,
    sc.status::text  AS cycle_status,
    sc.stage_entered_at,
    sc.next_action,
    sc.next_action_date,
    sc.owner_user_id,
    sc.lead_id,
    l.name           AS lead_name,
    l.phone          AS lead_phone,
    l.email          AS lead_email,
    sc.created_at,
    sc.updated_at,
    sc.closed_at
  FROM public.sales_cycles sc
  JOIN public.leads l ON l.id = sc.lead_id
  WHERE sc.company_id = v_company_id
    AND (v_owner IS NULL OR sc.owner_user_id = v_owner)
    AND (p_status IS NULL OR sc.status = p_status)
  ORDER BY sc.updated_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_pool_cycles(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(cycle_id uuid, cycle_status text, stage_entered_at timestamp with time zone, next_action text, next_action_date timestamp with time zone, owner_user_id uuid, lead_id uuid, lead_name text, lead_phone text, lead_email text, created_at timestamp with time zone, updated_at timestamp with time zone, closed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    sc.id            AS cycle_id,
    sc.status::text  AS cycle_status,
    sc.stage_entered_at,
    sc.next_action,
    sc.next_action_date,
    sc.owner_user_id,
    sc.lead_id,
    l.name           AS lead_name,
    l.phone          AS lead_phone,
    l.email          AS lead_email,
    sc.created_at,
    sc.updated_at,
    sc.closed_at
  FROM public.sales_cycles sc
  JOIN public.leads l ON l.id = sc.lead_id
  WHERE sc.company_id = v_company_id
    AND sc.owner_user_id IS NULL
    AND sc.status = 'novo'
  ORDER BY sc.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_close_cycle_won(p_cycle_id uuid, p_won_value numeric DEFAULT NULL::numeric, p_revenue_date_ref date DEFAULT NULL::date, p_won_note text DEFAULT NULL::text, p_product_id uuid DEFAULT NULL::uuid, p_won_unit_price numeric DEFAULT NULL::numeric, p_payment_method text DEFAULT NULL::text, p_payment_type text DEFAULT NULL::text, p_entry_amount numeric DEFAULT NULL::numeric, p_installments_count integer DEFAULT NULL::integer, p_installment_amount numeric DEFAULT NULL::numeric, p_payment_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
  v_won_owner_user_id uuid;
  v_won_note text;
  v_payment_notes text;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'company_not_found');
  END IF;

  SELECT *
    INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'cycle_not_found');
  END IF;

  IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Ciclo já está fechado como ' || v_cycle.status
    );
  END IF;

  v_won_owner_user_id := COALESCE(v_cycle.owner_user_id, auth.uid());
  v_won_note := NULLIF(TRIM(p_won_note), '');
  v_payment_notes := NULLIF(TRIM(p_payment_notes), '');

  UPDATE public.sales_cycles
  SET
    status = 'ganho',
    previous_status = v_cycle.status,
    stage_entered_at = v_now,
    won_at = v_now,
    closed_at = v_now,
    won_total = COALESCE(p_won_value, v_cycle.won_total, 0),
    won_owner_user_id = v_won_owner_user_id,
    revenue_seller_ref_date = p_revenue_date_ref,
    won_value_source = CASE
      WHEN p_revenue_date_ref IS NOT NULL THEN 'revenue'
      ELSE 'manual'
    END,
    won_note = v_won_note,
    product_id = p_product_id,
    won_unit_price = p_won_unit_price,
    payment_method = p_payment_method,
    payment_type = p_payment_type,
    entry_amount = p_entry_amount,
    installments_count = p_installments_count,
    installment_amount = p_installment_amount,
    payment_notes = v_payment_notes,
    next_action = NULL,
    next_action_date = NULL,
    updated_at = v_now
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  VALUES (
    p_cycle_id,
    v_company_id,
    'closed_won',
    jsonb_build_object(
      'from_status', v_cycle.status,
      'to_status', 'ganho',
      'won_total', COALESCE(p_won_value, v_cycle.won_total, 0),
      'won_owner_user_id', v_won_owner_user_id,
      'revenue_seller_ref_date', p_revenue_date_ref,
      'won_note', v_won_note,
      'product_id', p_product_id,
      'won_unit_price', p_won_unit_price,
      'payment_method', p_payment_method,
      'payment_type', p_payment_type,
      'entry_amount', p_entry_amount,
      'installments_count', p_installments_count,
      'installment_amount', p_installment_amount,
      'payment_notes', v_payment_notes
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', p_cycle_id,
    'status', 'ganho',
    'previous_status', v_cycle.status,
    'won_at', v_now,
    'closed_at', v_now,
    'won_total', COALESCE(p_won_value, v_cycle.won_total, 0),
    'won_owner_user_id', v_won_owner_user_id
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_close_cycle_lost(p_cycle_id uuid, p_lost_reason text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_action_channel text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
  v_reason text;
  v_note text;
  v_lost_owner_user_id uuid;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'company_not_found');
  END IF;

  SELECT *
    INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'cycle_not_found');
  END IF;

  IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Ciclo já está fechado como ' || v_cycle.status
    );
  END IF;

  v_reason := COALESCE(NULLIF(TRIM(p_lost_reason), ''), 'Não informado');
  v_note := NULLIF(TRIM(p_note), '');
  v_lost_owner_user_id := COALESCE(v_cycle.owner_user_id, auth.uid());

  UPDATE public.sales_cycles
  SET
    status = 'perdido',
    previous_status = v_cycle.status,
    stage_entered_at = v_now,
    lost_at = v_now,
    closed_at = v_now,
    lost_reason = v_reason,
    lost_owner_user_id = v_lost_owner_user_id,
    next_action = NULL,
    next_action_date = NULL,
    updated_at = v_now
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  VALUES (
    p_cycle_id,
    v_company_id,
    'closed_lost',
    jsonb_build_object(
      'from_status', v_cycle.status,
      'to_status', 'perdido',
      'lost_reason', v_reason,
      'lost_owner_user_id', v_lost_owner_user_id,
      'note', v_note,
      'action_channel', p_action_channel
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', p_cycle_id,
    'status', 'perdido',
    'previous_status', v_cycle.status,
    'lost_at', v_now,
    'closed_at', v_now,
    'lost_reason', v_reason
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_move_cycle_stage(p_cycle_id uuid, p_to_status text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_cycle      public.sales_cycles%ROWTYPE;
  v_now        timestamptz := now();
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  SELECT *
  INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_not_found');
  END IF;

  IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_already_closed');
  END IF;

  IF p_to_status IN ('ganho', 'perdido') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Use rpc_close_cycle_won/rpc_close_cycle_lost para fechamento terminal'
    );
  END IF;

  UPDATE public.sales_cycles
  SET
    previous_status  = status,
    status           = p_to_status::lead_status,
    stage_entered_at = v_now,
    updated_at       = v_now
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  VALUES (
    p_cycle_id,
    v_company_id,
    'stage_changed',
    jsonb_build_object(
      'from_status', v_cycle.status,
      'to_status', p_to_status,
      'payload', p_metadata
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_move_cycle_stage_checkpoint(p_cycle_id uuid, p_to_status text, p_checkpoint jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id       uuid;
  v_cycle            public.sales_cycles%ROWTYPE;
  v_next_action      text;
  v_next_action_date timestamptz;
  v_now              timestamptz := now();
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  SELECT *
  INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_not_found');
  END IF;

  IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_already_closed');
  END IF;

  IF p_to_status IN ('ganho', 'perdido') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Use rpc_close_cycle_won/rpc_close_cycle_lost para fechamento terminal'
    );
  END IF;

  v_next_action := p_checkpoint->>'next_action';
  v_next_action_date := (p_checkpoint->>'next_action_date')::timestamptz;

  UPDATE public.sales_cycles
  SET
    previous_status  = status,
    status           = p_to_status::lead_status,
    stage_entered_at = v_now,
    next_action      = COALESCE(v_next_action, next_action),
    next_action_date = COALESCE(v_next_action_date, next_action_date),
    updated_at       = v_now
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  VALUES (
    p_cycle_id,
    v_company_id,
    'stage_changed',
    jsonb_build_object(
      'from_status', v_cycle.status,
      'to_status', p_to_status,
      'checkpoint', p_checkpoint,
      'action_channel', p_checkpoint->>'action_channel',
      'action_result', p_checkpoint->>'action_result',
      'result_detail', p_checkpoint->>'result_detail',
      'note', p_checkpoint->>'note',
      'next_action', p_checkpoint->>'next_action',
      'next_action_date', p_checkpoint->>'next_action_date',
      'lost_reason', p_checkpoint->>'lost_reason'
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_assign_cycle_owner(p_cycle_id uuid, p_owner_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
  v_event_type text;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'company_not_found');
  END IF;

  SELECT *
  INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'cycle_not_found');
  END IF;

  IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'cycle_already_closed');
  END IF;

  IF v_cycle.owner_user_id IS NOT DISTINCT FROM p_owner_user_id THEN
    RETURN jsonb_build_object('success', true, 'no_change', true);
  END IF;

  v_event_type := CASE
    WHEN v_cycle.owner_user_id IS NULL THEN 'owner_assigned'
    ELSE 'owner_reassigned'
  END;

  UPDATE public.sales_cycles
  SET
    owner_user_id = p_owner_user_id,
    updated_at = v_now
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  VALUES (
    p_cycle_id,
    v_company_id,
    v_event_type,
    jsonb_build_object(
      'previous_owner_user_id', v_cycle.owner_user_id,
      'new_owner_user_id', p_owner_user_id,
      'from_status', v_cycle.status,
      'to_status', v_cycle.status,
      'source', 'single_assign',
      'rule', 'assign_keeps_current_status'
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_reassign_cycle_owner(p_cycle_id uuid, p_owner_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
  v_event_type text;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  SELECT *
  INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_not_found');
  END IF;

  IF v_cycle.owner_user_id IS NOT DISTINCT FROM p_owner_user_id THEN
    RETURN jsonb_build_object('success', true, 'no_change', true);
  END IF;

  v_event_type := CASE
    WHEN v_cycle.owner_user_id IS NULL THEN 'owner_assigned'
    ELSE 'owner_reassigned'
  END;

  UPDATE public.sales_cycles
  SET
    owner_user_id = p_owner_user_id,
    updated_at = v_now
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  VALUES (
    p_cycle_id,
    v_company_id,
    v_event_type,
    jsonb_build_object(
      'previous_owner_user_id', v_cycle.owner_user_id,
      'new_owner_user_id', p_owner_user_id,
      'from_status', v_cycle.status,
      'to_status', v_cycle.status,
      'source', 'single_reassign'
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_bulk_assign_cycles_owner(p_cycle_ids uuid[], p_owner_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_cycle_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
  v_updated integer := 0;
  v_event_type text;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  FOREACH v_cycle_id IN ARRAY p_cycle_ids
  LOOP
    SELECT *
    INTO v_cycle
    FROM public.sales_cycles
    WHERE id = v_cycle_id
      AND company_id = v_company_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_cycle.owner_user_id IS NOT DISTINCT FROM p_owner_user_id THEN
      CONTINUE;
    END IF;

    v_event_type := CASE
      WHEN v_cycle.owner_user_id IS NULL THEN 'owner_assigned'
      ELSE 'owner_reassigned'
    END;

    UPDATE public.sales_cycles
    SET
      owner_user_id = p_owner_user_id,
      updated_at = v_now
    WHERE id = v_cycle_id
      AND company_id = v_company_id;

    INSERT INTO public.cycle_events (
      cycle_id,
      company_id,
      event_type,
      metadata,
      created_by,
      occurred_at
    )
    VALUES (
      v_cycle_id,
      v_company_id,
      v_event_type,
      jsonb_build_object(
        'previous_owner_user_id', v_cycle.owner_user_id,
        'new_owner_user_id', p_owner_user_id,
        'from_status', v_cycle.status,
        'to_status', v_cycle.status,
        'source', 'bulk_assign'
      ),
      auth.uid(),
      v_now
    );

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_bulk_assign_round_robin(p_cycle_ids uuid[], p_owner_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_total_owners integer;
  v_updated integer := 0;
  i integer;
  v_cycle_id uuid;
  v_owner_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
  v_event_type text;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  v_total_owners := array_length(p_owner_ids, 1);

  IF v_total_owners IS NULL OR v_total_owners = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_owners_provided');
  END IF;

  FOR i IN 1 .. array_length(p_cycle_ids, 1)
  LOOP
    v_cycle_id := p_cycle_ids[i];
    v_owner_id := p_owner_ids[((i - 1) % v_total_owners) + 1];

    SELECT *
    INTO v_cycle
    FROM public.sales_cycles
    WHERE id = v_cycle_id
      AND company_id = v_company_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_cycle.owner_user_id IS NOT DISTINCT FROM v_owner_id THEN
      CONTINUE;
    END IF;

    v_event_type := CASE
      WHEN v_cycle.owner_user_id IS NULL THEN 'owner_assigned'
      ELSE 'owner_reassigned'
    END;

    UPDATE public.sales_cycles
    SET
      owner_user_id = v_owner_id,
      updated_at = v_now
    WHERE id = v_cycle_id
      AND company_id = v_company_id;

    INSERT INTO public.cycle_events (
      cycle_id,
      company_id,
      event_type,
      metadata,
      created_by,
      occurred_at
    )
    VALUES (
      v_cycle_id,
      v_company_id,
      v_event_type,
      jsonb_build_object(
        'previous_owner_user_id', v_cycle.owner_user_id,
        'new_owner_user_id', v_owner_id,
        'from_status', v_cycle.status,
        'to_status', v_cycle.status,
        'source', 'round_robin'
      ),
      auth.uid(),
      v_now
    );

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_set_next_action(p_cycle_id uuid, p_next_action text, p_next_action_date timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'company_not_found');
  END IF;

  SELECT *
  INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'cycle_not_found');
  END IF;

  IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Não é possível definir próxima ação em ciclo fechado'
    );
  END IF;

  UPDATE public.sales_cycles
  SET
    next_action = p_next_action,
    next_action_date = p_next_action_date,
    updated_at = v_now
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  VALUES (
    p_cycle_id,
    v_company_id,
    'next_action_set',
    jsonb_build_object(
      'previous_next_action', v_cycle.next_action,
      'previous_next_action_date', v_cycle.next_action_date,
      'new_next_action', p_next_action,
      'new_next_action_date', p_next_action_date
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_bulk_return_cycles_to_pool(p_cycle_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_cycle_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
  v_updated integer := 0;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  FOREACH v_cycle_id IN ARRAY p_cycle_ids
  LOOP
    SELECT *
    INTO v_cycle
    FROM public.sales_cycles
    WHERE id = v_cycle_id
      AND company_id = v_company_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
      CONTINUE;
    END IF;

    IF v_cycle.owner_user_id IS NULL AND v_cycle.status = 'novo' THEN
      CONTINUE;
    END IF;

    UPDATE public.sales_cycles
    SET
      owner_user_id = NULL,
      previous_status = status,
      status = 'novo',
      stage_entered_at = v_now,
      updated_at = v_now
    WHERE id = v_cycle_id
      AND company_id = v_company_id;

    INSERT INTO public.cycle_events (
      cycle_id,
      company_id,
      event_type,
      metadata,
      created_by,
      occurred_at
    )
    VALUES (
      v_cycle_id,
      v_company_id,
      'returned_to_pool',
      jsonb_build_object(
        'previous_owner_user_id', v_cycle.owner_user_id,
        'new_owner_user_id', NULL,
        'previous_status', v_cycle.status,
        'new_status', 'novo',
        'previous_group_id', v_cycle.current_group_id,
        'source', 'admin_bulk_return'
      ),
      auth.uid(),
      v_now
    );

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_bulk_return_cycles_to_pool_self(p_cycle_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_cycle_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
  v_updated integer := 0;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  v_user_id := auth.uid();

  FOREACH v_cycle_id IN ARRAY p_cycle_ids
  LOOP
    SELECT *
    INTO v_cycle
    FROM public.sales_cycles
    WHERE id = v_cycle_id
      AND company_id = v_company_id
      AND owner_user_id = v_user_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
      CONTINUE;
    END IF;

    UPDATE public.sales_cycles
    SET
      owner_user_id = NULL,
      previous_status = status,
      status = 'novo',
      stage_entered_at = v_now,
      updated_at = v_now
    WHERE id = v_cycle_id
      AND company_id = v_company_id
      AND owner_user_id = v_user_id;

    INSERT INTO public.cycle_events (
      cycle_id,
      company_id,
      event_type,
      metadata,
      created_by,
      occurred_at
    )
    VALUES (
      v_cycle_id,
      v_company_id,
      'returned_to_pool',
      jsonb_build_object(
        'previous_owner_user_id', v_user_id,
        'new_owner_user_id', NULL,
        'previous_status', v_cycle.status,
        'new_status', 'novo',
        'previous_group_id', v_cycle.current_group_id,
        'source', 'self_return'
      ),
      v_user_id,
      v_now
    );

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_return_cycle_to_pool_with_reason(p_cycle_id uuid, p_reason text, p_details text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  SELECT *
  INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_not_found');
  END IF;

  IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_already_closed');
  END IF;

  UPDATE public.sales_cycles
  SET
    owner_user_id = NULL,
    status = 'novo',
    previous_status = v_cycle.status,
    stage_entered_at = v_now,
    updated_at = v_now
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  VALUES (
    p_cycle_id,
    v_company_id,
    'returned_to_pool',
    jsonb_build_object(
      'previous_owner_user_id', v_cycle.owner_user_id,
      'new_owner_user_id', NULL,
      'previous_status', v_cycle.status,
      'new_status', 'novo',
      'previous_group_id', v_cycle.current_group_id,
      'reason', p_reason,
      'details', p_details,
      'source', 'card_return'
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_recall_group_to_pool(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_rec record;
  v_now timestamptz := now();
  v_updated integer := 0;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  FOR v_rec IN
    SELECT id, status, owner_user_id, current_group_id
    FROM public.sales_cycles
    WHERE current_group_id = p_group_id
      AND company_id = v_company_id
      AND status NOT IN ('ganho', 'perdido', 'cancelado')
      AND owner_user_id IS NOT NULL
  LOOP
    UPDATE public.sales_cycles
    SET
      owner_user_id = NULL,
      previous_status = status,
      status = 'novo',
      stage_entered_at = v_now,
      updated_at = v_now
    WHERE id = v_rec.id
      AND company_id = v_company_id;

    INSERT INTO public.cycle_events (
      cycle_id,
      company_id,
      event_type,
      metadata,
      created_by,
      occurred_at
    )
    VALUES (
      v_rec.id,
      v_company_id,
      'returned_to_pool',
      jsonb_build_object(
        'previous_owner_user_id', v_rec.owner_user_id,
        'new_owner_user_id', NULL,
        'previous_status', v_rec.status,
        'new_status', 'novo',
        'previous_group_id', v_rec.current_group_id,
        'source', 'group_recall'
      ),
      auth.uid(),
      v_now
    );

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_set_cycle_group(p_cycle_id uuid, p_group_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_cycle.current_group_id IS NOT DISTINCT FROM p_group_id THEN
    RETURN true;
  END IF;

  UPDATE public.sales_cycles
  SET
    current_group_id = p_group_id,
    updated_at = v_now
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  INSERT INTO public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  VALUES (
    p_cycle_id,
    v_company_id,
    'group_changed',
    jsonb_build_object(
      'previous_group_id', v_cycle.current_group_id,
      'new_group_id', p_group_id,
      'source', 'single_set_group'
    ),
    auth.uid(),
    v_now
  );

  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_bulk_set_cycles_group(p_cycle_ids uuid[], p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_cycle_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
  v_updated integer := 0;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  FOREACH v_cycle_id IN ARRAY p_cycle_ids
  LOOP
    SELECT *
    INTO v_cycle
    FROM public.sales_cycles
    WHERE id = v_cycle_id
      AND company_id = v_company_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_cycle.current_group_id IS NOT DISTINCT FROM p_group_id THEN
      CONTINUE;
    END IF;

    UPDATE public.sales_cycles
    SET
      current_group_id = p_group_id,
      updated_at = v_now
    WHERE id = v_cycle_id
      AND company_id = v_company_id;

    INSERT INTO public.cycle_events (
      cycle_id,
      company_id,
      event_type,
      metadata,
      created_by,
      occurred_at
    )
    VALUES (
      v_cycle_id,
      v_company_id,
      'group_changed',
      jsonb_build_object(
        'previous_group_id', v_cycle.current_group_id,
        'new_group_id', p_group_id,
        'source', 'bulk_set_group'
      ),
      auth.uid(),
      v_now
    );

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_log_ai_analysis(p_cycle_id uuid, p_suggestion jsonb, p_conversation_excerpt text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_now timestamptz := now();
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sales_cycles
    WHERE id = p_cycle_id
      AND company_id = v_company_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_not_found');
  END IF;

  INSERT INTO public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  VALUES (
    p_cycle_id,
    v_company_id,
    'ai_analysis_generated',
    jsonb_build_object(
      'suggestion', COALESCE(p_suggestion, '{}'::jsonb),
      'conversation_excerpt', NULLIF(TRIM(p_conversation_excerpt), '')
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_log_ai_suggestion_applied(p_cycle_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_now timestamptz := now();
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sales_cycles
    WHERE id = p_cycle_id
      AND company_id = v_company_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_not_found');
  END IF;

  INSERT INTO public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  VALUES (
    p_cycle_id,
    v_company_id,
    'ai_suggestion_applied',
    COALESCE(p_payload, '{}'::jsonb),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_log_ai_suggestion_rejected(p_cycle_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_now timestamptz := now();
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sales_cycles
    WHERE id = p_cycle_id
      AND company_id = v_company_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_not_found');
  END IF;

  INSERT INTO public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  VALUES (
    p_cycle_id,
    v_company_id,
    'ai_suggestion_rejected',
    COALESCE(p_payload, '{}'::jsonb),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_cycles_status_totals(p_owner_user_id uuid, p_group_id uuid DEFAULT NULL::uuid, p_search_term text DEFAULT NULL::text)
 RETURNS TABLE(status text, total bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_digits text;
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN RETURN; END IF;

  v_digits := regexp_replace(COALESCE(p_search_term, ''), '\D', '', 'g');

  RETURN QUERY
  SELECT sc.status::text, COUNT(*)::bigint
  FROM public.sales_cycles sc
  JOIN public.leads l
    ON l.id = sc.lead_id
   AND l.deleted_at IS NULL
  LEFT JOIN public.lead_profiles lp
    ON lp.lead_id = sc.lead_id
   AND lp.company_id = sc.company_id
  WHERE sc.company_id = v_company_id
    AND sc.owner_user_id = p_owner_user_id
    AND (p_group_id IS NULL OR sc.current_group_id = p_group_id)
    AND (
      p_search_term IS NULL
      OR p_search_term = ''
      OR l.name ILIKE '%' || p_search_term || '%'
      OR l.phone ILIKE '%' || p_search_term || '%'
      OR l.email ILIKE '%' || p_search_term || '%'
      OR (
        length(v_digits) = 11
        AND lp.cpf ILIKE '%' || v_digits || '%'
      )
    )
  GROUP BY sc.status;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_cycle_ai_context(p_cycle_id uuid, p_events_limit integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_cycle record;
  v_recent_events jsonb := '[]'::jsonb;
  v_limit integer := GREATEST(COALESCE(p_events_limit, 12), 1);
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  SELECT
    sc.id AS cycle_id,
    sc.status::text AS cycle_status,
    sc.owner_user_id,
    sc.next_action,
    sc.next_action_date,
    sc.current_group_id,
    lg.name AS current_group_name,
    l.id AS lead_id,
    l.name AS lead_name,
    l.phone AS lead_phone,
    l.email AS lead_email
  INTO v_cycle
  FROM public.sales_cycles sc
  JOIN public.leads l
    ON l.id = sc.lead_id
   AND l.deleted_at IS NULL
  LEFT JOIN public.lead_groups lg
    ON lg.id = sc.current_group_id
   AND lg.company_id = sc.company_id
  WHERE sc.id = p_cycle_id
    AND sc.company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_not_found');
  END IF;

  SELECT COALESCE(
    jsonb_agg(event_row.event_obj ORDER BY event_row.occurred_at DESC),
    '[]'::jsonb
  )
  INTO v_recent_events
  FROM (
    SELECT
      ce.occurred_at,
      jsonb_build_object(
        'event_type', ce.event_type,
        'occurred_at', ce.occurred_at,
        'from_status', COALESCE(
          ce.metadata->>'from_status',
          ce.metadata->'payload'->>'from_status',
          ce.metadata->'checkpoint'->>'from_status',
          ce.metadata->>'previous_status',
          ce.metadata->>'original_status'
        ),
        'to_status', COALESCE(
          ce.metadata->>'to_status',
          ce.metadata->'payload'->>'to_status',
          ce.metadata->'checkpoint'->>'to_status',
          ce.metadata->>'applied_status',
          ce.metadata->>'new_status'
        ),
        'action_channel', COALESCE(
          ce.metadata->>'action_channel',
          ce.metadata->'payload'->>'action_channel',
          ce.metadata->'checkpoint'->>'action_channel',
          ce.metadata->'suggestion'->>'action_channel'
        ),
        'action_result', COALESCE(
          ce.metadata->>'action_result',
          ce.metadata->'payload'->>'action_result',
          ce.metadata->'checkpoint'->>'action_result',
          ce.metadata->'suggestion'->>'action_result'
        ),
        'result_detail', COALESCE(
          ce.metadata->>'result_detail',
          ce.metadata->'payload'->>'result_detail',
          ce.metadata->'checkpoint'->>'result_detail',
          ce.metadata->'suggestion'->>'result_detail'
        ),
        'next_action', COALESCE(
          ce.metadata->>'next_action',
          ce.metadata->'payload'->>'next_action',
          ce.metadata->'checkpoint'->>'next_action',
          ce.metadata->>'new_next_action'
        ),
        'next_action_date', COALESCE(
          ce.metadata->>'next_action_date',
          ce.metadata->'payload'->>'next_action_date',
          ce.metadata->'checkpoint'->>'next_action_date',
          ce.metadata->>'new_next_action_date'
        ),
        'lost_reason', COALESCE(
          ce.metadata->>'lost_reason',
          ce.metadata->'payload'->>'lost_reason',
          ce.metadata->'checkpoint'->>'lost_reason',
          ce.metadata->'suggestion'->>'close_reason'
        ),
        'source', COALESCE(
          ce.metadata->>'source',
          ce.metadata->'payload'->>'source'
        )
      ) AS event_obj
    FROM public.cycle_events ce
    WHERE ce.company_id = v_company_id
      AND ce.cycle_id = p_cycle_id
    ORDER BY ce.occurred_at DESC
    LIMIT v_limit
  ) AS event_row;

  RETURN jsonb_build_object(
    'success', true,
    'cycle', jsonb_build_object(
      'id', v_cycle.cycle_id,
      'status', v_cycle.cycle_status,
      'owner_user_id', v_cycle.owner_user_id,
      'next_action', v_cycle.next_action,
      'next_action_date', v_cycle.next_action_date,
      'current_group_id', v_cycle.current_group_id,
      'current_group_name', v_cycle.current_group_name
    ),
    'lead', jsonb_build_object(
      'id', v_cycle.lead_id,
      'name', v_cycle.lead_name,
      'phone', v_cycle.lead_phone,
      'email', v_cycle.lead_email
    ),
    'recent_events', v_recent_events
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_apply_ai_open_suggestion(p_cycle_id uuid, p_to_status text, p_next_action text DEFAULT NULL::text, p_next_action_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_summary text DEFAULT NULL::text, p_suggestion jsonb DEFAULT '{}'::jsonb, p_source text DEFAULT 'ai_copilot_detail'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_cycle public.sales_cycles%ROWTYPE;
  v_now timestamptz := now();
  v_to_status public.lead_status;
  v_next_action text;
  v_next_action_date timestamptz;
  v_summary text;
  v_source text;
  v_status_changed boolean := false;
  v_action_changed boolean := false;
BEGIN
  v_company_id := public.current_company_id();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  IF p_to_status IS NULL OR p_to_status NOT IN ('novo', 'contato', 'respondeu', 'negociacao', 'pausado') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_open_status');
  END IF;

  SELECT *
  INTO v_cycle
  FROM public.sales_cycles
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_not_found');
  END IF;

  IF v_cycle.status IN ('ganho', 'perdido', 'cancelado') THEN
    RETURN jsonb_build_object('success', false, 'error', 'cycle_already_closed');
  END IF;

  v_to_status := p_to_status::public.lead_status;
  v_summary := NULLIF(TRIM(COALESCE(p_summary, '')), '');
  v_source := COALESCE(NULLIF(TRIM(COALESCE(p_source, '')), ''), 'ai_copilot_detail');
  v_next_action := NULLIF(TRIM(COALESCE(p_next_action, '')), '');
  v_next_action_date := p_next_action_date;

  IF v_to_status = 'novo' THEN
    v_next_action := NULL;
    v_next_action_date := NULL;
  END IF;

  IF v_next_action IS NULL THEN
    v_next_action_date := NULL;
  END IF;

  v_status_changed := v_cycle.status IS DISTINCT FROM v_to_status;
  v_action_changed :=
    v_cycle.next_action IS DISTINCT FROM v_next_action
    OR v_cycle.next_action_date IS DISTINCT FROM v_next_action_date;

    UPDATE public.sales_cycles
  SET
    previous_status = CASE
      WHEN v_status_changed THEN v_cycle.status::text
      ELSE previous_status
    END,
    status = CASE
      WHEN v_status_changed THEN v_to_status
      ELSE status
    END,
    stage_entered_at = CASE
      WHEN v_status_changed THEN v_now
      ELSE stage_entered_at
    END,
    next_action = v_next_action,
    next_action_date = v_next_action_date,
    updated_at = v_now
  WHERE id = p_cycle_id
    AND company_id = v_company_id;

  IF v_status_changed THEN
    INSERT INTO public.cycle_events (
      cycle_id,
      company_id,
      event_type,
      metadata,
      created_by,
      occurred_at
    )
    VALUES (
      p_cycle_id,
      v_company_id,
      'stage_changed',
      jsonb_build_object(
        'from_status', v_cycle.status,
        'to_status', v_to_status::text,
        'action_channel', p_suggestion->>'action_channel',
        'action_result', p_suggestion->>'action_result',
        'result_detail', p_suggestion->>'result_detail',
        'note', v_summary,
        'next_action', v_next_action,
        'next_action_date', v_next_action_date,
        'source', v_source,
        'applied_by_ai', true
      ),
      auth.uid(),
      v_now
    );
  END IF;

  IF NOT v_status_changed AND v_action_changed THEN
    INSERT INTO public.cycle_events (
      cycle_id,
      company_id,
      event_type,
      metadata,
      created_by,
      occurred_at
    )
    VALUES (
      p_cycle_id,
      v_company_id,
      'next_action_set',
      jsonb_build_object(
        'previous_next_action', v_cycle.next_action,
        'previous_next_action_date', v_cycle.next_action_date,
        'new_next_action', v_next_action,
        'new_next_action_date', v_next_action_date,
        'note', v_summary,
        'source', v_source,
        'applied_by_ai', true
      ),
      auth.uid(),
      v_now
    );
  END IF;

  INSERT INTO public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  VALUES (
    p_cycle_id,
    v_company_id,
    'ai_suggestion_applied',
    jsonb_build_object(
      'original_status', v_cycle.status,
      'applied_status', v_to_status::text,
      'next_action', v_next_action,
      'next_action_date', v_next_action_date,
      'edited_summary', v_summary,
      'suggestion', COALESCE(p_suggestion, '{}'::jsonb),
      'source', v_source
    ),
    auth.uid(),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', p_cycle_id,
    'status', v_to_status::text,
    'previous_status', v_cycle.status,
    'next_action', v_next_action,
    'next_action_date', v_next_action_date
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_execution_day_calendars_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_close_rate_real(p_owner_user_id uuid DEFAULT NULL::uuid, p_days_window integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_is_admin boolean;
  v_vendor_id uuid;
  v_days_window integer;
  v_start timestamptz;
  v_end timestamptz;

  v_company_worked integer := 0;
  v_company_wins integer := 0;
  v_vendor_worked integer := 0;
  v_vendor_wins integer := 0;
BEGIN
  v_company_id := public.current_company_id();
  v_user_id := auth.uid();
  v_is_admin := public.is_admin();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'days_window', COALESCE(p_days_window, 90),
      'vendor', jsonb_build_object(
        'owner_user_id', NULL,
        'wins', 0,
        'worked', 0,
        'close_rate', NULL
      ),
      'company', jsonb_build_object(
        'owner_user_id', NULL,
        'wins', 0,
        'worked', 0,
        'close_rate', NULL
      ),
      'error_message', 'company_not_found'
    );
  END IF;

  v_days_window := GREATEST(COALESCE(p_days_window, 90), 1);
  v_start := now() - make_interval(days => v_days_window);
  v_end := now();

  IF v_is_admin THEN
    v_vendor_id := p_owner_user_id;
  ELSE
    v_vendor_id := v_user_id;
  END IF;

  WITH company_base AS (
    SELECT
      sc.id,
      sc.status
    FROM public.sales_cycles sc
    WHERE sc.company_id = v_company_id
      AND COALESCE(sc.first_worked_at, sc.stage_entered_at, sc.created_at) >= v_start
      AND COALESCE(sc.first_worked_at, sc.stage_entered_at, sc.created_at) <= v_end
      AND sc.status <> 'novo'
  )
  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE status = 'ganho')::integer
  INTO
    v_company_worked,
    v_company_wins
  FROM company_base;

  IF v_vendor_id IS NOT NULL THEN
    WITH vendor_base AS (
      SELECT
        sc.id,
        sc.status
      FROM public.sales_cycles sc
      WHERE sc.company_id = v_company_id
        AND COALESCE(sc.won_owner_user_id, sc.owner_user_id) = v_vendor_id
        AND COALESCE(sc.first_worked_at, sc.stage_entered_at, sc.created_at) >= v_start
        AND COALESCE(sc.first_worked_at, sc.stage_entered_at, sc.created_at) <= v_end
        AND sc.status <> 'novo'
    )
    SELECT
      COUNT(*)::integer,
      COUNT(*) FILTER (WHERE status = 'ganho')::integer
    INTO
      v_vendor_worked,
      v_vendor_wins
    FROM vendor_base;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'days_window', v_days_window,
    'vendor', jsonb_build_object(
      'owner_user_id', v_vendor_id,
      'wins', COALESCE(v_vendor_wins, 0),
      'worked', COALESCE(v_vendor_worked, 0),
      'close_rate',
        CASE
          WHEN COALESCE(v_vendor_worked, 0) > 0
            THEN ROUND((v_vendor_wins::numeric / v_vendor_worked::numeric), 4)
          ELSE NULL
        END
    ),
    'company', jsonb_build_object(
      'owner_user_id', NULL,
      'wins', COALESCE(v_company_wins, 0),
      'worked', COALESCE(v_company_worked, 0),
      'close_rate',
        CASE
          WHEN COALESCE(v_company_worked, 0) > 0
            THEN ROUND((v_company_wins::numeric / v_company_worked::numeric), 4)
          ELSE NULL
        END
    )
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_revenue_sales_details_by_day(p_ref_date date, p_owner_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(cycle_id uuid, lead_id uuid, lead_name text, seller_id uuid, seller_name text, seller_email text, product_id uuid, product_name text, product_category text, won_total numeric, won_unit_price numeric, payment_method text, payment_type text, won_at timestamp with time zone, revenue_seller_ref_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_is_admin boolean;
  v_owner_filter uuid;
BEGIN
  v_company_id := public.current_company_id();
  v_user_id := auth.uid();
  v_is_admin := public.is_admin();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não identificada';
  END IF;

  IF NOT v_is_admin THEN
    v_owner_filter := v_user_id;
  ELSE
    v_owner_filter := p_owner_id;
  END IF;

  RETURN QUERY
  SELECT
    sc.id AS cycle_id,
    sc.lead_id,
    l.name AS lead_name,
    COALESCE(sc.won_owner_user_id, sc.owner_user_id) AS seller_id,
    p.full_name AS seller_name,
    p.email AS seller_email,
    sc.product_id,
    pr.name AS product_name,
    pr.category AS product_category,
    COALESCE(sc.won_total, 0)::numeric AS won_total,
    sc.won_unit_price,
    sc.payment_method::text,
    sc.payment_type::text,
    sc.won_at,
    sc.revenue_seller_ref_date::date
  FROM public.sales_cycles sc
  LEFT JOIN public.leads l
    ON l.id = sc.lead_id
   AND l.company_id = sc.company_id
  LEFT JOIN public.profiles p
    ON p.id = COALESCE(sc.won_owner_user_id, sc.owner_user_id)
   AND p.company_id = sc.company_id
  LEFT JOIN public.products pr
    ON pr.id = sc.product_id
   AND pr.company_id = sc.company_id
  WHERE sc.company_id = v_company_id
    AND sc.status = 'ganho'
    AND COALESCE(
      sc.revenue_seller_ref_date::date,
      (sc.won_at AT TIME ZONE 'America/Sao_Paulo')::date,
      (sc.closed_at AT TIME ZONE 'America/Sao_Paulo')::date
    ) = p_ref_date
    AND (
      v_owner_filter IS NULL
      OR COALESCE(sc.won_owner_user_id, sc.owner_user_id) = v_owner_filter
    )
  ORDER BY sc.won_at DESC NULLS LAST, sc.updated_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_company_memberships_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_active_company_membership(p_company_id uuid, p_roles text[] DEFAULT NULL::text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.company_memberships cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = p_company_id
        AND cm.is_active = true
        AND (
          p_roles IS NULL
          OR cm.role = ANY(p_roles)
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_platform_admin = true
        AND COALESCE(p.is_active_global, true) = true
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_company_admin(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT public.has_active_company_membership(p_company_id, ARRAY['admin']);
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_company_memberships()
 RETURNS TABLE(company_id uuid, company_name text, trade_name text, legal_name text, role text, is_active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT
    c.id AS company_id,
    c.name AS company_name,
    c.trade_name,
    c.legal_name,
    cm.role,
    cm.is_active
  FROM public.company_memberships cm
  JOIN public.companies c
    ON c.id = cm.company_id
  WHERE cm.user_id = auth.uid()
    AND cm.is_active = true
  ORDER BY
    COALESCE(c.trade_name, c.name, c.legal_name) ASC NULLS LAST;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_set_user_role_for_company(p_company_id uuid, p_user_id uuid, p_role text)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_admin_id uuid;
  v_next_role text;
  v_old_role text;
BEGIN
  v_admin_id := auth.uid();
  v_next_role := lower(btrim(coalesce(p_role, '')));

  IF p_company_id IS NULL THEN
    RETURN QUERY SELECT false, 'Empresa obrigatória.';
    RETURN;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'Usuário obrigatório.';
    RETURN;
  END IF;

  IF v_next_role NOT IN ('admin', 'manager', 'member') THEN
    RETURN QUERY SELECT false, 'Role inválido. Valores aceitos: admin, manager, member.';
    RETURN;
  END IF;

  IF NOT public.has_active_company_membership(p_company_id, ARRAY['admin']) THEN
    RETURN QUERY SELECT false, 'Acesso negado: admin ativo da empresa obrigatório.';
    RETURN;
  END IF;

  SELECT cm.role
    INTO v_old_role
  FROM public.company_memberships cm
  WHERE cm.company_id = p_company_id
    AND cm.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Usuário não possui vínculo com esta empresa.';
    RETURN;
  END IF;

  UPDATE public.company_memberships
     SET role = v_next_role,
         updated_at = now(),
         metadata = metadata || jsonb_build_object(
           'last_role_change_source', 'fn_set_user_role_for_company',
           'last_role_change_at', now()
         )
   WHERE company_id = p_company_id
     AND user_id = p_user_id;

  IF v_old_role IS DISTINCT FROM v_next_role THEN
    INSERT INTO public.admin_events (
      company_id,
      actor_user_id,
      target_user_id,
      event_type,
      metadata
    ) VALUES (
      p_company_id,
      v_admin_id,
      p_user_id,
      'role_changed',
      jsonb_build_object(
        'role_old', v_old_role,
        'role_new', v_next_role,
        'source', 'fn_set_user_role_for_company'
      )
    );
  END IF;

  RETURN QUERY SELECT true, 'Role do usuário atualizado para: ' || v_next_role;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_seller_access_for_company(p_company_id uuid, p_seller_id uuid, p_role text, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_admin_id uuid;
  v_next_role text;
  v_old_role text;
  v_old_active boolean;
  v_events text[] := '{}';
  v_returned_to_pool_count integer := 0;
  v_now timestamptz := now();
begin
  if p_company_id is null then
    raise exception 'Empresa obrigatória';
  end if;

  if p_seller_id is null then
    raise exception 'Usuário obrigatório';
  end if;

  if p_is_active is null then
    raise exception 'Status ativo/inativo obrigatório';
  end if;

  if not public.has_active_company_membership(
    p_company_id,
    array['admin']
  ) then
    raise exception 'Acesso negado: admin ativo da empresa obrigatório';
  end if;

  v_admin_id := auth.uid();
  v_next_role := lower(btrim(coalesce(p_role, '')));

  if v_next_role not in ('admin', 'manager', 'member') then
    raise exception 'Role inválido. Valores aceitos: admin, manager, member';
  end if;

  select
    cm.role,
    cm.is_active
  into
    v_old_role,
    v_old_active
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = p_seller_id;

  if not found then
    raise exception 'Usuário não possui vínculo com esta empresa';
  end if;

  update public.company_memberships
  set
    role = v_next_role,
    is_active = p_is_active,
    updated_at = v_now,
    metadata = metadata || jsonb_build_object(
      'last_access_update_source',
      'rpc_admin_update_seller_access_for_company',
      'last_access_update_at',
      v_now
    )
  where company_id = p_company_id
    and user_id = p_seller_id;

  if v_old_role is distinct from v_next_role then
    insert into public.admin_events (
      company_id,
      actor_user_id,
      target_user_id,
      event_type,
      metadata
    )
    values (
      p_company_id,
      v_admin_id,
      p_seller_id,
      'role_changed',
      jsonb_build_object(
        'role_old',
        v_old_role,
        'role_new',
        v_next_role
      )
    );

    v_events := array_append(v_events, 'role_changed');
  end if;

  if coalesce(v_old_active, false) = true
    and p_is_active = false then
    with returned_cycles as (
      update public.sales_cycles
      set
        owner_user_id = null,
        updated_at = v_now
      where company_id = p_company_id
        and owner_user_id = p_seller_id
        and (
          status is null
          or status not in ('ganho', 'perdido', 'cancelado')
        )
      returning id
    ),
    inserted_events as (
      insert into public.cycle_events (
        cycle_id,
        company_id,
        event_type,
        metadata,
        created_by,
        occurred_at
      )
      select
        returned_cycles.id,
        p_company_id,
        'returned_to_pool',
        jsonb_build_object(
          'reason',
          'seller_deactivated',
          'details',
          'Ciclo devolvido automaticamente ao Pool após a desativação do responsável.',
          'previous_owner',
          p_seller_id,
          'source',
          'seller_access_update'
        ),
        v_admin_id,
        v_now
      from returned_cycles
      returning cycle_id
    )
    select count(*)
    into v_returned_to_pool_count
    from inserted_events;
  end if;

  if v_old_active is distinct from p_is_active then
    insert into public.admin_events (
      company_id,
      actor_user_id,
      target_user_id,
      event_type,
      metadata
    )
    values (
      p_company_id,
      v_admin_id,
      p_seller_id,
      case
        when p_is_active then 'seller_activated'
        else 'seller_deactivated'
      end,
      jsonb_build_object(
        'is_active_old',
        v_old_active,
        'is_active_new',
        p_is_active,
        'active_cycles_returned_to_pool',
        v_returned_to_pool_count
      )
    );

    v_events := array_append(
      v_events,
      case
        when p_is_active then 'seller_activated'
        else 'seller_deactivated'
      end
    );
  end if;

  return jsonb_build_object(
    'ok',
    true,
    'company_id',
    p_company_id,
    'seller_id',
    p_seller_id,
    'events',
    to_jsonb(v_events),
    'active_cycles_returned_to_pool',
    v_returned_to_pool_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_admin_list_sellers_stats_for_company(p_company_id uuid, p_days integer DEFAULT 30)
 RETURNS TABLE(seller_id uuid, full_name text, email text, role text, is_active boolean, active_cycles_count bigint, novo_count bigint, contato_count bigint, respondeu_count bigint, negociacao_count bigint, ganho_count_period bigint, perdido_count_period bigint, last_activity_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_period_start timestamptz;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa obrigatória';
  END IF;

  IF NOT public.has_active_company_membership(p_company_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'Acesso negado: admin ativo da empresa obrigatório';
  END IF;

  v_period_start := now() - (COALESCE(p_days, 30) || ' days')::interval;

  RETURN QUERY
  SELECT
    p.id AS seller_id,
    p.full_name,
    p.email,
    cm.role,
    cm.is_active,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status NOT IN ('ganho', 'perdido')
    ) AS active_cycles_count,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'novo'
    ) AS novo_count,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'contato'
    ) AS contato_count,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'respondeu'
    ) AS respondeu_count,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'negociacao'
    ) AS negociacao_count,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'ganho'
        AND sc.updated_at >= v_period_start
    ) AS ganho_count_period,
    COUNT(DISTINCT sc.id) FILTER (
      WHERE sc.status = 'perdido'
        AND sc.updated_at >= v_period_start
    ) AS perdido_count_period,
    MAX(sc.updated_at) AS last_activity_at
  FROM public.company_memberships cm
  JOIN public.profiles p
    ON p.id = cm.user_id
  LEFT JOIN public.sales_cycles sc
    ON sc.owner_user_id = cm.user_id
   AND sc.company_id = p_company_id
  WHERE cm.company_id = p_company_id
    AND cm.role IN ('admin', 'manager', 'member')
  GROUP BY
    p.id,
    p.full_name,
    p.email,
    cm.role,
    cm.is_active
  ORDER BY
    p.full_name ASC NULLS LAST;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_set_next_action_for_company(p_company_id uuid, p_cycle_id uuid, p_next_action text, p_next_action_date timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_membership_role text;
  v_is_admin_or_manager boolean := false;
  v_cycle public.sales_cycles%rowtype;
  v_now timestamptz := now();
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error_message', 'not_authenticated');
  end if;

  if p_company_id is null then
    return jsonb_build_object('success', false, 'error_message', 'company_not_found');
  end if;

  select cm.role
    into v_membership_role
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = v_actor_id
    and cm.is_active = true
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error_message', 'membership_not_found');
  end if;

  v_is_admin_or_manager := v_membership_role in ('admin', 'manager');

  select *
    into v_cycle
  from public.sales_cycles
  where id = p_cycle_id
    and company_id = p_company_id;

  if not found then
    return jsonb_build_object('success', false, 'error_message', 'cycle_not_found');
  end if;

  if not v_is_admin_or_manager and v_cycle.owner_user_id is distinct from v_actor_id then
    return jsonb_build_object('success', false, 'error_message', 'permission_denied');
  end if;

  if v_cycle.status in ('ganho', 'perdido', 'cancelado') then
    return jsonb_build_object(
      'success', false,
      'error_message', 'Não é possível definir próxima ação em ciclo fechado'
    );
  end if;

  update public.sales_cycles
  set
    next_action = p_next_action,
    next_action_date = p_next_action_date,
    updated_at = v_now
  where id = p_cycle_id
    and company_id = p_company_id;

  insert into public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  values (
    p_cycle_id,
    p_company_id,
    'next_action_set',
    jsonb_build_object(
      'previous_next_action', v_cycle.next_action,
      'previous_next_action_date', v_cycle.next_action_date,
      'new_next_action', p_next_action,
      'new_next_action_date', p_next_action_date
    ),
    v_actor_id,
    v_now
  );

  return jsonb_build_object('success', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_move_cycle_stage_for_company(p_company_id uuid, p_cycle_id uuid, p_to_status text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_membership_role text;
  v_is_admin_or_manager boolean := false;
  v_cycle public.sales_cycles%rowtype;
  v_now timestamptz := now();
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if p_company_id is null then
    return jsonb_build_object('success', false, 'error', 'company_not_found');
  end if;

  select cm.role
    into v_membership_role
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = v_actor_id
    and cm.is_active = true
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'membership_not_found');
  end if;

  v_is_admin_or_manager := v_membership_role in ('admin', 'manager');

  select *
    into v_cycle
  from public.sales_cycles
  where id = p_cycle_id
    and company_id = p_company_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'cycle_not_found');
  end if;

  if not v_is_admin_or_manager and v_cycle.owner_user_id is distinct from v_actor_id then
    return jsonb_build_object('success', false, 'error', 'permission_denied');
  end if;

  if v_cycle.status in ('ganho', 'perdido', 'cancelado') then
    return jsonb_build_object('success', false, 'error', 'cycle_already_closed');
  end if;

  if p_to_status in ('ganho', 'perdido') then
    return jsonb_build_object(
      'success', false,
      'error', 'Use rpc_close_cycle_won_for_company/rpc_close_cycle_lost_for_company para fechamento terminal'
    );
  end if;

  update public.sales_cycles
  set
    previous_status = status,
    status = p_to_status::lead_status,
    stage_entered_at = v_now,
    updated_at = v_now
  where id = p_cycle_id
    and company_id = p_company_id;

  insert into public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  values (
    p_cycle_id,
    p_company_id,
    'stage_changed',
    jsonb_build_object(
      'from_status', v_cycle.status,
      'to_status', p_to_status,
      'payload', coalesce(p_metadata, '{}'::jsonb)
    ),
    v_actor_id,
    v_now
  );

  return jsonb_build_object('success', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_move_cycle_stage_checkpoint_for_company(p_company_id uuid, p_cycle_id uuid, p_to_status text, p_checkpoint jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_membership_role text;
  v_is_admin_or_manager boolean := false;
  v_cycle public.sales_cycles%rowtype;
  v_next_action text;
  v_next_action_date timestamptz;
  v_now timestamptz := now();
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if p_company_id is null then
    return jsonb_build_object('success', false, 'error', 'company_not_found');
  end if;

  select cm.role
    into v_membership_role
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = v_actor_id
    and cm.is_active = true
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'membership_not_found');
  end if;

  v_is_admin_or_manager := v_membership_role in ('admin', 'manager');

  select *
    into v_cycle
  from public.sales_cycles
  where id = p_cycle_id
    and company_id = p_company_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'cycle_not_found');
  end if;

  if not v_is_admin_or_manager and v_cycle.owner_user_id is distinct from v_actor_id then
    return jsonb_build_object('success', false, 'error', 'permission_denied');
  end if;

  if v_cycle.status in ('ganho', 'perdido', 'cancelado') then
    return jsonb_build_object('success', false, 'error', 'cycle_already_closed');
  end if;

  if p_to_status in ('ganho', 'perdido') then
    return jsonb_build_object(
      'success', false,
      'error', 'Use rpc_close_cycle_won_for_company/rpc_close_cycle_lost_for_company para fechamento terminal'
    );
  end if;

  v_next_action := nullif(p_checkpoint->>'next_action', '');

  v_next_action_date := case
    when nullif(p_checkpoint->>'next_action_date', '') is null then null
    else (p_checkpoint->>'next_action_date')::timestamptz
  end;

  update public.sales_cycles
  set
    previous_status = status,
    status = p_to_status::lead_status,
    stage_entered_at = v_now,
    next_action = coalesce(v_next_action, next_action),
    next_action_date = coalesce(v_next_action_date, next_action_date),
    updated_at = v_now
  where id = p_cycle_id
    and company_id = p_company_id;

  insert into public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  values (
    p_cycle_id,
    p_company_id,
    'stage_changed',
    jsonb_build_object(
      'from_status', v_cycle.status,
      'to_status', p_to_status,
      'checkpoint', coalesce(p_checkpoint, '{}'::jsonb),
      'action_channel', p_checkpoint->>'action_channel',
      'action_result', p_checkpoint->>'action_result',
      'result_detail', p_checkpoint->>'result_detail',
      'note', p_checkpoint->>'note',
      'next_action', p_checkpoint->>'next_action',
      'next_action_date', p_checkpoint->>'next_action_date',
      'lost_reason', p_checkpoint->>'lost_reason'
    ),
    v_actor_id,
    v_now
  );

  return jsonb_build_object('success', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_close_cycle_lost_for_company(p_company_id uuid, p_cycle_id uuid, p_lost_reason text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_action_channel text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_membership_role text;
  v_is_admin_or_manager boolean := false;
  v_cycle public.sales_cycles%rowtype;
  v_now timestamptz := now();
  v_reason text;
  v_note text;
  v_lost_owner_user_id uuid;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error_message', 'not_authenticated');
  end if;

  if p_company_id is null then
    return jsonb_build_object('success', false, 'error_message', 'company_not_found');
  end if;

  select cm.role
    into v_membership_role
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = v_actor_id
    and cm.is_active = true
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error_message', 'membership_not_found');
  end if;

  v_is_admin_or_manager := v_membership_role in ('admin', 'manager');

  select *
    into v_cycle
  from public.sales_cycles
  where id = p_cycle_id
    and company_id = p_company_id;

  if not found then
    return jsonb_build_object('success', false, 'error_message', 'cycle_not_found');
  end if;

  if not v_is_admin_or_manager and v_cycle.owner_user_id is distinct from v_actor_id then
    return jsonb_build_object('success', false, 'error_message', 'permission_denied');
  end if;

  if v_cycle.status in ('ganho', 'perdido', 'cancelado') then
    return jsonb_build_object(
      'success', false,
      'error_message', 'Ciclo já está fechado como ' || v_cycle.status
    );
  end if;

  v_reason := coalesce(nullif(trim(p_lost_reason), ''), 'Não informado');
  v_note := nullif(trim(p_note), '');
  v_lost_owner_user_id := coalesce(v_cycle.owner_user_id, v_actor_id);

  update public.sales_cycles
  set
    status = 'perdido',
    previous_status = v_cycle.status,
    stage_entered_at = v_now,
    lost_at = v_now,
    closed_at = v_now,
    lost_reason = v_reason,
    lost_owner_user_id = v_lost_owner_user_id,
    next_action = null,
    next_action_date = null,
    updated_at = v_now
  where id = p_cycle_id
    and company_id = p_company_id;

  insert into public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  values (
    p_cycle_id,
    p_company_id,
    'closed_lost',
    jsonb_build_object(
      'from_status', v_cycle.status,
      'to_status', 'perdido',
      'lost_reason', v_reason,
      'lost_owner_user_id', v_lost_owner_user_id,
      'note', v_note,
      'action_channel', p_action_channel
    ),
    v_actor_id,
    v_now
  );

  return jsonb_build_object(
    'success', true,
    'id', p_cycle_id,
    'status', 'perdido',
    'previous_status', v_cycle.status,
    'lost_at', v_now,
    'closed_at', v_now,
    'lost_reason', v_reason
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_close_cycle_won_for_company(p_company_id uuid, p_cycle_id uuid, p_won_value numeric DEFAULT NULL::numeric, p_revenue_date_ref date DEFAULT NULL::date, p_won_note text DEFAULT NULL::text, p_product_id uuid DEFAULT NULL::uuid, p_won_unit_price numeric DEFAULT NULL::numeric, p_payment_method text DEFAULT NULL::text, p_payment_type text DEFAULT NULL::text, p_entry_amount numeric DEFAULT NULL::numeric, p_installments_count integer DEFAULT NULL::integer, p_installment_amount numeric DEFAULT NULL::numeric, p_payment_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_membership_role text;
  v_is_admin_or_manager boolean := false;
  v_cycle public.sales_cycles%rowtype;
  v_now timestamptz := now();
  v_won_owner_user_id uuid;
  v_won_note text;
  v_payment_notes text;
  v_won_total numeric;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error_message', 'not_authenticated');
  end if;

  if p_company_id is null then
    return jsonb_build_object('success', false, 'error_message', 'company_not_found');
  end if;

  select cm.role
    into v_membership_role
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = v_actor_id
    and cm.is_active = true
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error_message', 'membership_not_found');
  end if;

  v_is_admin_or_manager := v_membership_role in ('admin', 'manager');

  select *
    into v_cycle
  from public.sales_cycles
  where id = p_cycle_id
    and company_id = p_company_id;

  if not found then
    return jsonb_build_object('success', false, 'error_message', 'cycle_not_found');
  end if;

  if not v_is_admin_or_manager and v_cycle.owner_user_id is distinct from v_actor_id then
    return jsonb_build_object('success', false, 'error_message', 'permission_denied');
  end if;

  if v_cycle.status in ('ganho', 'perdido', 'cancelado') then
    return jsonb_build_object(
      'success', false,
      'error_message', 'Ciclo já está fechado como ' || v_cycle.status
    );
  end if;

  v_won_owner_user_id := coalesce(v_cycle.owner_user_id, v_actor_id);
  v_won_note := nullif(trim(p_won_note), '');
  v_payment_notes := nullif(trim(p_payment_notes), '');
  v_won_total := coalesce(p_won_value, v_cycle.won_total, 0);

  update public.sales_cycles
  set
    status = 'ganho',
    previous_status = v_cycle.status,
    stage_entered_at = v_now,
    won_at = v_now,
    closed_at = v_now,
    won_total = v_won_total,
    won_owner_user_id = v_won_owner_user_id,
    revenue_seller_ref_date = p_revenue_date_ref,
    won_value_source = case
      when p_revenue_date_ref is not null then 'revenue'
      else 'manual'
    end,
    won_note = v_won_note,
    product_id = p_product_id,
    won_unit_price = p_won_unit_price,
    payment_method = p_payment_method,
    payment_type = p_payment_type,
    entry_amount = p_entry_amount,
    installments_count = p_installments_count,
    installment_amount = p_installment_amount,
    payment_notes = v_payment_notes,
    next_action = null,
    next_action_date = null,
    updated_at = v_now
  where id = p_cycle_id
    and company_id = p_company_id;

  insert into public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  values (
    p_cycle_id,
    p_company_id,
    'closed_won',
    jsonb_build_object(
      'from_status', v_cycle.status,
      'to_status', 'ganho',
      'won_total', v_won_total,
      'won_owner_user_id', v_won_owner_user_id,
      'revenue_seller_ref_date', p_revenue_date_ref,
      'won_note', v_won_note,
      'product_id', p_product_id,
      'won_unit_price', p_won_unit_price,
      'payment_method', p_payment_method,
      'payment_type', p_payment_type,
      'entry_amount', p_entry_amount,
      'installments_count', p_installments_count,
      'installment_amount', p_installment_amount,
      'payment_notes', v_payment_notes
    ),
    v_actor_id,
    v_now
  );

  return jsonb_build_object(
    'success', true,
    'id', p_cycle_id,
    'status', 'ganho',
    'previous_status', v_cycle.status,
    'won_at', v_now,
    'closed_at', v_now,
    'won_total', v_won_total,
    'won_owner_user_id', v_won_owner_user_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_assign_cycle_owner_for_company(p_company_id uuid, p_cycle_id uuid, p_owner_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_membership_role text;
  v_cycle public.sales_cycles%rowtype;
  v_now timestamptz := now();
  v_event_type text;
  v_target_exists boolean := false;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error_message', 'not_authenticated');
  end if;

  if p_company_id is null then
    return jsonb_build_object('success', false, 'error_message', 'company_not_found');
  end if;

  if p_owner_user_id is null then
    return jsonb_build_object('success', false, 'error_message', 'owner_user_id_required');
  end if;

  select cm.role
    into v_membership_role
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = v_actor_id
    and cm.is_active = true
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error_message', 'membership_not_found');
  end if;

  if v_membership_role not in ('admin', 'manager') then
    return jsonb_build_object('success', false, 'error_message', 'permission_denied');
  end if;

  select exists (
    select 1
    from public.company_memberships cm
    where cm.company_id = p_company_id
      and cm.user_id = p_owner_user_id
      and cm.is_active = true
  )
  into v_target_exists;

  if not v_target_exists then
    return jsonb_build_object('success', false, 'error_message', 'owner_membership_not_found');
  end if;

  select *
    into v_cycle
  from public.sales_cycles
  where id = p_cycle_id
    and company_id = p_company_id;

  if not found then
    return jsonb_build_object('success', false, 'error_message', 'cycle_not_found');
  end if;

  if v_cycle.status in ('ganho', 'perdido', 'cancelado') then
    return jsonb_build_object('success', false, 'error_message', 'cycle_already_closed');
  end if;

  if v_cycle.owner_user_id is not distinct from p_owner_user_id then
    return jsonb_build_object('success', true, 'no_change', true);
  end if;

  v_event_type := case
    when v_cycle.owner_user_id is null then 'owner_assigned'
    else 'owner_reassigned'
  end;

  update public.sales_cycles
  set
    owner_user_id = p_owner_user_id,
    updated_at = v_now
  where id = p_cycle_id
    and company_id = p_company_id;

  insert into public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  values (
    p_cycle_id,
    p_company_id,
    v_event_type,
    jsonb_build_object(
      'previous_owner_user_id', v_cycle.owner_user_id,
      'new_owner_user_id', p_owner_user_id,
      'from_status', v_cycle.status,
      'to_status', v_cycle.status,
      'source', 'single_assign',
      'rule', 'assign_keeps_current_status'
    ),
    v_actor_id,
    v_now
  );

  return jsonb_build_object('success', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_cycle_ai_context_for_company(p_company_id uuid, p_cycle_id uuid, p_events_limit integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_membership_role text;
  v_is_admin_or_manager boolean := false;
  v_cycle record;
  v_recent_events jsonb := '[]'::jsonb;
  v_limit integer := greatest(coalesce(p_events_limit, 12), 1);
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if p_company_id is null then
    return jsonb_build_object('success', false, 'error', 'company_not_found');
  end if;

  select cm.role
    into v_membership_role
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = v_actor_id
    and cm.is_active = true
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'membership_not_found');
  end if;

  v_is_admin_or_manager := v_membership_role in ('admin', 'manager');

  select
    sc.id as cycle_id,
    sc.status::text as cycle_status,
    sc.owner_user_id,
    sc.next_action,
    sc.next_action_date,
    sc.current_group_id,
    lg.name as current_group_name,
    l.id as lead_id,
    l.name as lead_name,
    l.phone as lead_phone,
    l.email as lead_email
  into v_cycle
  from public.sales_cycles sc
  join public.leads l
    on l.id = sc.lead_id
   and l.company_id = sc.company_id
  left join public.lead_groups lg
    on lg.id = sc.current_group_id
   and lg.company_id = sc.company_id
  where sc.id = p_cycle_id
    and sc.company_id = p_company_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'cycle_not_found');
  end if;

  if not v_is_admin_or_manager and v_cycle.owner_user_id is distinct from v_actor_id then
    return jsonb_build_object('success', false, 'error', 'permission_denied');
  end if;

  select coalesce(
    jsonb_agg(event_row.event_obj order by event_row.occurred_at desc),
    '[]'::jsonb
  )
  into v_recent_events
  from (
    select
      ce.occurred_at,
      jsonb_build_object(
        'event_type', ce.event_type,
        'occurred_at', ce.occurred_at,
        'from_status', coalesce(
          ce.metadata->>'from_status',
          ce.metadata->'payload'->>'from_status',
          ce.metadata->'checkpoint'->>'from_status',
          ce.metadata->>'previous_status',
          ce.metadata->>'original_status'
        ),
        'to_status', coalesce(
          ce.metadata->>'to_status',
          ce.metadata->'payload'->>'to_status',
          ce.metadata->'checkpoint'->>'to_status',
          ce.metadata->>'applied_status',
          ce.metadata->>'new_status'
        ),
        'action_channel', coalesce(
          ce.metadata->>'action_channel',
          ce.metadata->'payload'->>'action_channel',
          ce.metadata->'checkpoint'->>'action_channel',
          ce.metadata->'suggestion'->>'action_channel'
        ),
        'action_result', coalesce(
          ce.metadata->>'action_result',
          ce.metadata->'payload'->>'action_result',
          ce.metadata->'checkpoint'->>'action_result',
          ce.metadata->'suggestion'->>'action_result'
        ),
        'result_detail', coalesce(
          ce.metadata->>'result_detail',
          ce.metadata->'payload'->>'result_detail',
          ce.metadata->'checkpoint'->>'result_detail',
          ce.metadata->'suggestion'->>'result_detail'
        ),
        'next_action', coalesce(
          ce.metadata->>'next_action',
          ce.metadata->'payload'->>'next_action',
          ce.metadata->'checkpoint'->>'next_action',
          ce.metadata->>'new_next_action'
        ),
        'next_action_date', coalesce(
          ce.metadata->>'next_action_date',
          ce.metadata->'payload'->>'next_action_date',
          ce.metadata->'checkpoint'->>'next_action_date',
          ce.metadata->>'new_next_action_date'
        ),
        'lost_reason', coalesce(
          ce.metadata->>'lost_reason',
          ce.metadata->'payload'->>'lost_reason',
          ce.metadata->'checkpoint'->>'lost_reason',
          ce.metadata->'suggestion'->>'close_reason'
        ),
        'source', coalesce(
          ce.metadata->>'source',
          ce.metadata->'payload'->>'source'
        )
      ) as event_obj
    from public.cycle_events ce
    where ce.company_id = p_company_id
      and ce.cycle_id = p_cycle_id
    order by ce.occurred_at desc
    limit v_limit
  ) as event_row;

  return jsonb_build_object(
    'success', true,
    'cycle', jsonb_build_object(
      'id', v_cycle.cycle_id,
      'status', v_cycle.cycle_status,
      'owner_user_id', v_cycle.owner_user_id,
      'next_action', v_cycle.next_action,
      'next_action_date', v_cycle.next_action_date,
      'current_group_id', v_cycle.current_group_id,
      'current_group_name', v_cycle.current_group_name
    ),
    'lead', jsonb_build_object(
      'id', v_cycle.lead_id,
      'name', v_cycle.lead_name,
      'phone', v_cycle.lead_phone,
      'email', v_cycle.lead_email
    ),
    'recent_events', v_recent_events
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_apply_ai_open_suggestion_for_company(p_company_id uuid, p_cycle_id uuid, p_to_status text, p_next_action text DEFAULT NULL::text, p_next_action_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_summary text DEFAULT NULL::text, p_suggestion jsonb DEFAULT '{}'::jsonb, p_source text DEFAULT 'ai_copilot_detail'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_membership_role text;
  v_is_admin_or_manager boolean := false;
  v_cycle public.sales_cycles%rowtype;
  v_now timestamptz := now();
  v_to_status public.lead_status;
  v_next_action text;
  v_next_action_date timestamptz;
  v_summary text;
  v_source text;
  v_status_changed boolean := false;
  v_action_changed boolean := false;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if p_company_id is null then
    return jsonb_build_object('success', false, 'error', 'company_not_found');
  end if;

  select cm.role
    into v_membership_role
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = v_actor_id
    and cm.is_active = true
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'membership_not_found');
  end if;

  v_is_admin_or_manager := v_membership_role in ('admin', 'manager');

  if p_to_status is null or p_to_status not in ('novo', 'contato', 'respondeu', 'negociacao', 'pausado') then
    return jsonb_build_object('success', false, 'error', 'invalid_open_status');
  end if;

  select *
    into v_cycle
  from public.sales_cycles
  where id = p_cycle_id
    and company_id = p_company_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'cycle_not_found');
  end if;

  if not v_is_admin_or_manager and v_cycle.owner_user_id is distinct from v_actor_id then
    return jsonb_build_object('success', false, 'error', 'permission_denied');
  end if;

  if v_cycle.status in ('ganho', 'perdido', 'cancelado') then
    return jsonb_build_object('success', false, 'error', 'cycle_already_closed');
  end if;

  v_to_status := p_to_status::public.lead_status;
  v_summary := nullif(trim(coalesce(p_summary, '')), '');
  v_source := coalesce(nullif(trim(coalesce(p_source, '')), ''), 'ai_copilot_detail');
  v_next_action := nullif(trim(coalesce(p_next_action, '')), '');
  v_next_action_date := p_next_action_date;

  if v_to_status = 'novo' then
    v_next_action := null;
    v_next_action_date := null;
  end if;

  if v_next_action is null then
    v_next_action_date := null;
  end if;

  v_status_changed := v_cycle.status is distinct from v_to_status;
  v_action_changed :=
    v_cycle.next_action is distinct from v_next_action
    or v_cycle.next_action_date is distinct from v_next_action_date;

  update public.sales_cycles
  set
    previous_status = case
      when v_status_changed then v_cycle.status::text
      else previous_status
    end,
    status = case
      when v_status_changed then v_to_status
      else status
    end,
    stage_entered_at = case
      when v_status_changed then v_now
      else stage_entered_at
    end,
    next_action = v_next_action,
    next_action_date = v_next_action_date,
    updated_at = v_now
  where id = p_cycle_id
    and company_id = p_company_id;

  if v_status_changed then
    insert into public.cycle_events (
      cycle_id,
      company_id,
      event_type,
      metadata,
      created_by,
      occurred_at
    )
    values (
      p_cycle_id,
      p_company_id,
      'stage_changed',
      jsonb_build_object(
        'from_status', v_cycle.status,
        'to_status', v_to_status::text,
        'action_channel', p_suggestion->>'action_channel',
        'action_result', p_suggestion->>'action_result',
        'result_detail', p_suggestion->>'result_detail',
        'note', v_summary,
        'next_action', v_next_action,
        'next_action_date', v_next_action_date,
        'source', v_source,
        'applied_by_ai', true
      ),
      v_actor_id,
      v_now
    );
  end if;

  if not v_status_changed and v_action_changed then
    insert into public.cycle_events (
      cycle_id,
      company_id,
      event_type,
      metadata,
      created_by,
      occurred_at
    )
    values (
      p_cycle_id,
      p_company_id,
      'next_action_set',
      jsonb_build_object(
        'previous_next_action', v_cycle.next_action,
        'previous_next_action_date', v_cycle.next_action_date,
        'new_next_action', v_next_action,
        'new_next_action_date', v_next_action_date,
        'note', v_summary,
        'source', v_source,
        'applied_by_ai', true
      ),
      v_actor_id,
      v_now
    );
  end if;

  insert into public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  values (
    p_cycle_id,
    p_company_id,
    'ai_suggestion_applied',
    jsonb_build_object(
      'original_status', v_cycle.status,
      'applied_status', v_to_status::text,
      'next_action', v_next_action,
      'next_action_date', v_next_action_date,
      'edited_summary', v_summary,
      'suggestion', coalesce(p_suggestion, '{}'::jsonb),
      'source', v_source
    ),
    v_actor_id,
    v_now
  );

  return jsonb_build_object(
    'success', true,
    'id', p_cycle_id,
    'status', v_to_status::text,
    'previous_status', v_cycle.status,
    'next_action', v_next_action,
    'next_action_date', v_next_action_date
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.has_company_membership_strict(p_company_id uuid, p_roles text[] DEFAULT NULL::text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select exists (
    select 1
    from public.company_memberships cm
    where cm.user_id = auth.uid()
      and cm.company_id = p_company_id
      and cm.is_active = true
      and (
        p_roles is null
        or cm.role = any(p_roles)
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.can_access_lead_profile_strict(p_company_id uuid, p_lead_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
 SET row_security TO 'off'
AS $function$
  select exists (
    select 1
    from public.leads l
    where l.id = p_lead_id
      and l.company_id = p_company_id
      and (
        public.has_company_membership_strict(p_company_id, array['admin', 'manager'])
        or (
          l.deleted_at is null
          and public.has_company_membership_strict(p_company_id, null)
          and exists (
            select 1
            from public.sales_cycles sc
            where sc.company_id = p_company_id
              and sc.lead_id = p_lead_id
              and sc.owner_user_id = auth.uid()
          )
        )
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_platform_admin_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
 SET row_security TO 'off'
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_platform_admin = true
      and coalesce(p.is_active_global, true) = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.can_select_company_membership_strict(p_company_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
 SET row_security TO 'off'
AS $function$
  select
    p_user_id = auth.uid()
    or public.is_platform_admin_active()
    or exists (
      select 1
      from public.company_memberships cm
      where cm.company_id = p_company_id
        and cm.user_id = auth.uid()
        and cm.is_active = true
        and cm.role = any(array['admin', 'manager'])
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_select_profile_strict(p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
 SET row_security TO 'off'
AS $function$
  select
    p_profile_id = auth.uid()
    or public.is_platform_admin_active()
    or exists (
      select 1
      from public.company_memberships actor_cm
      join public.company_memberships target_cm
        on target_cm.company_id = actor_cm.company_id
      where actor_cm.user_id = auth.uid()
        and actor_cm.is_active = true
        and actor_cm.role = any(array['admin', 'manager'])
        and target_cm.user_id = p_profile_id
        and target_cm.is_active = true
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_select_sales_cycle_strict(p_company_id uuid, p_owner_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
 SET row_security TO 'off'
AS $function$
  select
    exists (
      select 1
      from public.company_memberships cm
      where cm.company_id = p_company_id
        and cm.user_id = auth.uid()
        and cm.is_active = true
        and cm.role = any(array['admin', 'manager'])
    )
    or (
      p_owner_user_id = auth.uid()
      and exists (
        select 1
        from public.company_memberships cm
        where cm.company_id = p_company_id
          and cm.user_id = auth.uid()
          and cm.is_active = true
      )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_write_sales_cycle_strict(p_company_id uuid, p_owner_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
 SET row_security TO 'off'
AS $function$
  select
    (
      exists (
        select 1
        from public.company_memberships actor_cm
        where actor_cm.company_id = p_company_id
          and actor_cm.user_id = auth.uid()
          and actor_cm.is_active = true
          and actor_cm.role = any(array['admin', 'manager'])
      )
      and (
        p_owner_user_id is null
        or exists (
          select 1
          from public.company_memberships target_cm
          where target_cm.company_id = p_company_id
            and target_cm.user_id = p_owner_user_id
            and target_cm.is_active = true
        )
      )
    )
    or (
      p_owner_user_id = auth.uid()
      and exists (
        select 1
        from public.company_memberships cm
        where cm.company_id = p_company_id
          and cm.user_id = auth.uid()
          and cm.is_active = true
      )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_select_lead_base_strict(p_company_id uuid, p_lead_id uuid, p_owner_id uuid, p_created_by uuid, p_deleted_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
 SET row_security TO 'off'
AS $function$
  select
    public.has_company_membership_strict(p_company_id, array['admin', 'manager'])
    or (
      p_deleted_at is null
      and public.has_company_membership_strict(p_company_id, null)
      and (
        p_owner_id = auth.uid()
        or p_created_by = auth.uid()
        or exists (
          select 1
          from public.sales_cycles sc
          where sc.company_id = p_company_id
            and sc.lead_id = p_lead_id
            and sc.owner_user_id = auth.uid()
        )
      )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_update_lead_base_strict(p_company_id uuid, p_lead_id uuid, p_owner_id uuid, p_created_by uuid, p_deleted_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
 SET row_security TO 'off'
AS $function$
  select
    public.has_company_membership_strict(p_company_id, array['admin', 'manager'])
    or (
      p_deleted_at is null
      and public.has_company_membership_strict(p_company_id, null)
      and (
        p_owner_id = auth.uid()
        or p_created_by = auth.uid()
        or exists (
          select 1
          from public.sales_cycles sc
          where sc.company_id = p_company_id
            and sc.lead_id = p_lead_id
            and sc.owner_user_id = auth.uid()
        )
      )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_revenue_sales_details_by_day_for_company(p_company_id uuid, p_ref_date date, p_owner_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(cycle_id uuid, lead_id uuid, lead_name text, seller_id uuid, seller_name text, seller_email text, product_id uuid, product_name text, product_category text, won_total numeric, won_unit_price numeric, payment_method text, payment_type text, won_at timestamp with time zone, revenue_seller_ref_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_user_id uuid;
  v_is_admin boolean;
  v_owner_filter uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_company_id is null then
    raise exception 'Empresa não informada';
  end if;

  if not public.has_company_membership_strict(p_company_id, null) then
    raise exception 'Usuário sem vínculo ativo com a empresa';
  end if;

  v_is_admin := public.has_company_membership_strict(p_company_id, array['admin']);

  if v_is_admin then
    v_owner_filter := p_owner_id;
  else
    v_owner_filter := v_user_id;
  end if;

  return query
  select
    sc.id as cycle_id,
    sc.lead_id,
    l.name as lead_name,
    coalesce(sc.won_owner_user_id, sc.owner_user_id) as seller_id,
    p.full_name as seller_name,
    p.email as seller_email,
    sc.product_id,
    pr.name as product_name,
    pr.category as product_category,
    coalesce(sc.won_total, 0)::numeric as won_total,
    sc.won_unit_price,
    sc.payment_method::text,
    sc.payment_type::text,
    sc.won_at,
    sc.revenue_seller_ref_date::date
  from public.sales_cycles sc
  left join public.leads l
    on l.id = sc.lead_id
   and l.company_id = sc.company_id
  left join public.profiles p
    on p.id = coalesce(sc.won_owner_user_id, sc.owner_user_id)
  left join public.products pr
    on pr.id = sc.product_id
   and pr.company_id = sc.company_id
  where sc.company_id = p_company_id
    and sc.status = 'ganho'
    and coalesce(
      sc.revenue_seller_ref_date::date,
      (sc.won_at at time zone 'America/Sao_Paulo')::date,
      (sc.closed_at at time zone 'America/Sao_Paulo')::date
    ) = p_ref_date
    and (
      v_owner_filter is null
      or coalesce(sc.won_owner_user_id, sc.owner_user_id) = v_owner_filter
    )
  order by sc.won_at desc nulls last, sc.updated_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_create_revenue_extra_source_for_company(p_company_id uuid, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_company_id is null then
    raise exception 'Empresa não informada';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'Nome não pode estar vazio';
  end if;

  if not public.has_company_membership_strict(p_company_id, array['admin']) then
    raise exception 'Apenas administradores podem criar fontes de faturamento';
  end if;

  insert into public.revenue_extra_sources (
    company_id,
    name,
    created_by
  )
  values (
    p_company_id,
    trim(p_name),
    auth.uid()
  )
  returning id into v_new_id;

  return v_new_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_upsert_revenue_daily_override_for_company(p_company_id uuid, p_source_kind text, p_source_id uuid, p_ref_date date, p_real_value numeric, p_reason text, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_source_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_company_id is null then
    raise exception 'Empresa não informada';
  end if;

  if p_source_kind not in ('seller', 'extra') then
    raise exception 'source_kind deve ser seller ou extra';
  end if;

  if p_source_id is null then
    raise exception 'Fonte não informada';
  end if;

  if p_ref_date is null then
    raise exception 'Data de referência obrigatória';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'Motivo é obrigatório';
  end if;

  if not public.has_company_membership_strict(p_company_id, array['admin']) then
    raise exception 'Apenas administradores podem editar faturamento';
  end if;

  if p_source_kind = 'seller' then
    select cm.company_id
      into v_source_company_id
    from public.company_memberships cm
    where cm.company_id = p_company_id
      and cm.user_id = p_source_id
      and cm.is_active = true
    limit 1;
  else
    select res.company_id
      into v_source_company_id
    from public.revenue_extra_sources res
    where res.company_id = p_company_id
      and res.id = p_source_id
      and res.archived_at is null
    limit 1;
  end if;

  if v_source_company_id is null or v_source_company_id <> p_company_id then
    raise exception 'Fonte não encontrada ou não pertence à empresa';
  end if;

  insert into public.revenue_overrides_daily (
    company_id,
    source_kind,
    source_id,
    ref_date,
    real_value,
    reason,
    notes,
    edited_by
  )
  values (
    p_company_id,
    p_source_kind,
    p_source_id,
    p_ref_date,
    coalesce(p_real_value, 0),
    trim(p_reason),
    p_notes,
    auth.uid()
  )
  on conflict (company_id, source_kind, source_id, ref_date)
  do update set
    real_value = excluded.real_value,
    reason = excluded.reason,
    notes = excluded.notes,
    edited_by = auth.uid(),
    edited_at = now();

  return jsonb_build_object('success', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_revenue_goal(p_company_id uuid, p_owner_id uuid, p_date_start date, p_date_end date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_goal_value numeric := 0;
  v_ticket_medio numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_company_id is null then
    raise exception 'Empresa não informada';
  end if;

  if p_date_start is null or p_date_end is null then
    raise exception 'Período da meta é obrigatório';
  end if;

  if not public.has_company_membership_strict(p_company_id, null) then
    raise exception 'Usuário sem vínculo ativo com a empresa';
  end if;

  select
    coalesce(rg.goal_value, 0),
    coalesce(rg.ticket_medio, 0)
  into
    v_goal_value,
    v_ticket_medio
  from public.revenue_goals rg
  where rg.company_id = p_company_id
    and rg.owner_id is not distinct from p_owner_id
    and rg.date_start = p_date_start
    and rg.date_end = p_date_end
  limit 1;

  return json_build_object(
    'success', true,
    'goal_value', coalesce(v_goal_value, 0),
    'ticket_medio', coalesce(v_ticket_medio, 0)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_upsert_revenue_goal(p_company_id uuid, p_owner_id uuid, p_date_start date, p_date_end date, p_goal_value numeric, p_ticket_medio numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_existing_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_company_id is null then
    raise exception 'Empresa não informada';
  end if;

  if p_date_start is null or p_date_end is null then
    raise exception 'Período da meta é obrigatório';
  end if;

  if p_date_end < p_date_start then
    raise exception 'Data final não pode ser menor que a data inicial';
  end if;

  if not public.has_company_membership_strict(p_company_id, array['admin']) then
    raise exception 'Apenas administradores podem editar metas';
  end if;

  if p_owner_id is not null and not exists (
    select 1
    from public.company_memberships cm
    where cm.company_id = p_company_id
      and cm.user_id = p_owner_id
      and cm.is_active = true
  ) then
    raise exception 'Vendedor não pertence à empresa ou está inativo';
  end if;

  select rg.id
    into v_existing_id
  from public.revenue_goals rg
  where rg.company_id = p_company_id
    and rg.owner_id is not distinct from p_owner_id
    and rg.date_start = p_date_start
    and rg.date_end = p_date_end
  limit 1;

  if v_existing_id is not null then
    update public.revenue_goals
    set
      goal_value = greatest(0, coalesce(p_goal_value, 0)),
      ticket_medio = greatest(0, coalesce(p_ticket_medio, 0)),
      updated_at = now()
    where id = v_existing_id;
  else
    insert into public.revenue_goals (
      company_id,
      owner_id,
      date_start,
      date_end,
      goal_value,
      ticket_medio,
      created_by
    )
    values (
      p_company_id,
      p_owner_id,
      p_date_start,
      p_date_end,
      greatest(0, coalesce(p_goal_value, 0)),
      greatest(0, coalesce(p_ticket_medio, 0)),
      auth.uid()
    );
  end if;

  return json_build_object('success', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_close_rate_real_for_company(p_company_id uuid, p_owner_user_id uuid DEFAULT NULL::uuid, p_days_window integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_days_window integer := greatest(coalesce(p_days_window, 90), 1);
  v_start_at timestamptz := now() - (greatest(coalesce(p_days_window, 90), 1)::text || ' days')::interval;
  v_is_admin_or_manager boolean := false;
  v_effective_owner_id uuid;

  v_company_wins integer := 0;
  v_company_worked integer := 0;
  v_company_rate numeric := 0;

  v_vendor_wins integer := 0;
  v_vendor_worked integer := 0;
  v_vendor_rate numeric := 0;
begin
  if v_actor_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_company_id is null then
    raise exception 'Empresa não informada';
  end if;

  if not public.has_company_membership_strict(p_company_id, null) then
    raise exception 'Usuário sem vínculo ativo com a empresa';
  end if;

  v_is_admin_or_manager := public.has_company_membership_strict(
    p_company_id,
    array['admin', 'manager']
  );

  if v_is_admin_or_manager then
    v_effective_owner_id := p_owner_user_id;

    if v_effective_owner_id is not null and not exists (
      select 1
      from public.company_memberships cm
      where cm.company_id = p_company_id
        and cm.user_id = v_effective_owner_id
        and cm.is_active = true
    ) then
      raise exception 'Vendedor não pertence à empresa ou está inativo';
    end if;
  else
    v_effective_owner_id := v_actor_id;
  end if;

  select count(*)
    into v_company_worked
  from public.sales_cycles sc
  where sc.company_id = p_company_id
    and sc.status in ('contato', 'respondeu', 'negociacao', 'ganho', 'perdido')
    and coalesce(sc.first_worked_at, sc.updated_at, sc.created_at) >= v_start_at;

  select count(*)
    into v_company_wins
  from public.sales_cycles sc
  where sc.company_id = p_company_id
    and sc.status = 'ganho'
    and coalesce(sc.won_at, sc.closed_at, sc.updated_at) >= v_start_at;

  v_company_rate :=
    case
      when v_company_worked > 0 then v_company_wins::numeric / v_company_worked::numeric
      else null
    end;

  if v_effective_owner_id is not null then
    select count(*)
      into v_vendor_worked
    from public.sales_cycles sc
    where sc.company_id = p_company_id
      and sc.owner_user_id = v_effective_owner_id
      and sc.status in ('contato', 'respondeu', 'negociacao', 'ganho', 'perdido')
      and coalesce(sc.first_worked_at, sc.updated_at, sc.created_at) >= v_start_at;

    select count(*)
      into v_vendor_wins
    from public.sales_cycles sc
    where sc.company_id = p_company_id
      and coalesce(sc.won_owner_user_id, sc.owner_user_id) = v_effective_owner_id
      and sc.status = 'ganho'
      and coalesce(sc.won_at, sc.closed_at, sc.updated_at) >= v_start_at;

    v_vendor_rate :=
      case
        when v_vendor_worked > 0 then v_vendor_wins::numeric / v_vendor_worked::numeric
        else null
      end;
  end if;

  return jsonb_build_object(
    'success', true,
    'days_window', v_days_window,
    'vendor', jsonb_build_object(
      'owner_user_id', v_effective_owner_id,
      'wins', coalesce(v_vendor_wins, 0),
      'worked', coalesce(v_vendor_worked, 0),
      'close_rate', v_vendor_rate
    ),
    'company', jsonb_build_object(
      'owner_user_id', null,
      'wins', coalesce(v_company_wins, 0),
      'worked', coalesce(v_company_worked, 0),
      'close_rate', v_company_rate
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_sales_cycle_metrics_v1_for_company_base(p_company_id uuid, p_owner_user_id uuid DEFAULT NULL::uuid, p_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_is_admin_or_manager boolean := false;
  v_owner_filter uuid;
  v_month date;
  v_month_start date;
  v_month_end date;
  v_counts_by_status record;
  v_current_wins integer := 0;
  v_worked_count integer := 0;
  v_total_open integer := 0;
  v_total_pool integer := 0;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_company_id is null then
    raise exception 'Empresa não informada';
  end if;

  if not public.has_company_membership_strict(p_company_id, null) then
    raise exception 'Usuário sem vínculo ativo com a empresa';
  end if;

  v_is_admin_or_manager := public.has_company_membership_strict(
    p_company_id,
    array['admin', 'manager']
  );

  if v_is_admin_or_manager then
    v_owner_filter := p_owner_user_id;

    if v_owner_filter is not null and not exists (
      select 1
      from public.company_memberships cm
      where cm.company_id = p_company_id
        and cm.user_id = v_owner_filter
        and cm.is_active = true
    ) then
      raise exception 'Vendedor não pertence à empresa ou está inativo';
    end if;
  else
    v_owner_filter := v_user_id;
  end if;

  if p_month is not null then
    v_month := date_trunc('month', p_month)::date;
  else
    v_month := date_trunc('month', now())::date;
  end if;

  v_month_start := v_month;
  v_month_end := (date_trunc('month', v_month)::date + interval '1 month')::date;

  select count(*)
    into v_current_wins
  from public.sales_cycles sc
  where sc.company_id = p_company_id
    and sc.status = 'ganho'
    and coalesce(
      sc.revenue_seller_ref_date::date,
      (sc.won_at at time zone 'America/Sao_Paulo')::date,
      (sc.closed_at at time zone 'America/Sao_Paulo')::date
    ) >= v_month_start
    and coalesce(
      sc.revenue_seller_ref_date::date,
      (sc.won_at at time zone 'America/Sao_Paulo')::date,
      (sc.closed_at at time zone 'America/Sao_Paulo')::date
    ) < v_month_end
    and (
      v_owner_filter is null
      or coalesce(sc.won_owner_user_id, sc.owner_user_id) = v_owner_filter
    );

  select count(*)
    into v_worked_count
  from public.sales_cycles sc
  where sc.company_id = p_company_id
    and sc.status != 'novo'
    and (
      (
        sc.stage_entered_at >= v_month_start
        and sc.stage_entered_at < v_month_end
        and (v_owner_filter is null or sc.owner_user_id = v_owner_filter)
      )
      or (
        sc.status = 'ganho'
        and coalesce(
          sc.revenue_seller_ref_date::date,
          (sc.won_at at time zone 'America/Sao_Paulo')::date,
          (sc.closed_at at time zone 'America/Sao_Paulo')::date
        ) >= v_month_start
        and coalesce(
          sc.revenue_seller_ref_date::date,
          (sc.won_at at time zone 'America/Sao_Paulo')::date,
          (sc.closed_at at time zone 'America/Sao_Paulo')::date
        ) < v_month_end
        and (
          v_owner_filter is null
          or coalesce(sc.won_owner_user_id, sc.owner_user_id) = v_owner_filter
        )
      )
    );

  select count(*)
    into v_total_open
  from public.sales_cycles sc
  where sc.company_id = p_company_id
    and sc.status not in ('ganho', 'perdido')
    and (v_owner_filter is null or sc.owner_user_id = v_owner_filter);

  if v_is_admin_or_manager and v_owner_filter is null then
    select count(*)
      into v_total_pool
    from public.sales_cycles sc
    where sc.company_id = p_company_id
      and sc.owner_user_id is null
      and sc.status = 'novo';
  else
    v_total_pool := 0;
  end if;

  with scoped_cycles as (
    select sc.status
    from public.sales_cycles sc
    where sc.company_id = p_company_id
      and (
        (
          sc.status = 'ganho'
          and coalesce(
            sc.revenue_seller_ref_date::date,
            (sc.won_at at time zone 'America/Sao_Paulo')::date,
            (sc.closed_at at time zone 'America/Sao_Paulo')::date
          ) >= v_month_start
          and coalesce(
            sc.revenue_seller_ref_date::date,
            (sc.won_at at time zone 'America/Sao_Paulo')::date,
            (sc.closed_at at time zone 'America/Sao_Paulo')::date
          ) < v_month_end
          and (
            v_owner_filter is null
            or coalesce(sc.won_owner_user_id, sc.owner_user_id) = v_owner_filter
          )
        )
        or (
          sc.status <> 'ganho'
          and sc.stage_entered_at >= v_month_start
          and sc.stage_entered_at < v_month_end
          and (v_owner_filter is null or sc.owner_user_id = v_owner_filter)
        )
      )
  ),
  status_counts as (
    select status, count(*) as cnt
    from scoped_cycles
    group by status
  )
  select
    coalesce((select cnt from status_counts where status = 'novo'), 0) as novo,
    coalesce((select cnt from status_counts where status = 'contato'), 0) as contato,
    coalesce((select cnt from status_counts where status = 'respondeu'), 0) as respondeu,
    coalesce((select cnt from status_counts where status = 'negociacao'), 0) as negociacao,
    coalesce((select cnt from status_counts where status = 'ganho'), 0) as ganho,
    coalesce((select cnt from status_counts where status = 'perdido'), 0) as perdido
  into v_counts_by_status;

  return jsonb_build_object(
    'company_id', p_company_id::text,
    'month_start', v_month_start::text,
    'month_end', v_month_end::text,
    'owner_user_id', case when v_owner_filter is null then null else v_owner_filter::text end,
    'is_admin', v_is_admin_or_manager,
    'current_wins', coalesce(v_current_wins, 0),
    'worked_count', coalesce(v_worked_count, 0),
    'total_open', coalesce(v_total_open, 0),
    'total_pool', coalesce(v_total_pool, 0),
    'counts_by_status', jsonb_build_object(
      'novo', coalesce(v_counts_by_status.novo, 0),
      'contato', coalesce(v_counts_by_status.contato, 0),
      'respondeu', coalesce(v_counts_by_status.respondeu, 0),
      'negociacao', coalesce(v_counts_by_status.negociacao, 0),
      'ganho', coalesce(v_counts_by_status.ganho, 0),
      'perdido', coalesce(v_counts_by_status.perdido, 0)
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.report_stage_conversion_for_period(p_company_id uuid, p_date_start date, p_date_end date)
 RETURNS TABLE(step_order integer, from_stage text, to_stage text, entered bigint, progressed bigint, conversion numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_company_id is null then
    raise exception 'Empresa não informada';
  end if;

  if p_date_start is null or p_date_end is null then
    raise exception 'Período não informado';
  end if;

  if p_date_end < p_date_start then
    raise exception 'Período inválido';
  end if;

  if not public.has_company_membership_strict(p_company_id, null) then
    raise exception 'Usuário sem vínculo ativo com a empresa';
  end if;

  return query
  with steps as (
    select 1 as step_order, 'contato'::text as from_stage, 'respondeu'::text as to_stage
    union all
    select 2, 'respondeu', 'negociacao'
    union all
    select 3, 'negociacao', 'ganho'
  ),
  entered_counts as (
    select
      (ce.metadata->>'to_status')::text as stage,
      count(distinct ce.cycle_id) as n
    from public.cycle_events ce
    where ce.company_id = p_company_id
      and ce.event_type in ('stage_changed', 'stage_checkpoint', 'stage_moved')
      and ce.metadata->>'to_status' in ('contato', 'respondeu', 'negociacao')
      and (ce.occurred_at at time zone 'America/Sao_Paulo')::date between p_date_start and p_date_end
    group by ce.metadata->>'to_status'
  ),
  progressed_counts as (
    select
      (ce.metadata->>'from_status')::text as from_stage,
      (ce.metadata->>'to_status')::text as to_stage,
      count(distinct ce.cycle_id) as n
    from public.cycle_events ce
    where ce.company_id = p_company_id
      and ce.event_type in ('stage_changed', 'stage_checkpoint', 'stage_moved')
      and ce.metadata->>'from_status' in ('contato', 'respondeu', 'negociacao')
      and ce.metadata->>'to_status' in ('respondeu', 'negociacao', 'ganho')
      and (ce.occurred_at at time zone 'America/Sao_Paulo')::date between p_date_start and p_date_end
    group by ce.metadata->>'from_status', ce.metadata->>'to_status'
  )
  select
    s.step_order,
    s.from_stage,
    s.to_stage,
    coalesce(en.n, 0) as entered,
    coalesce(pr.n, 0) as progressed,
    case
      when coalesce(en.n, 0) = 0 then 0::numeric
      else round((coalesce(pr.n, 0)::numeric / en.n::numeric) * 100, 2)
    end as conversion
  from steps s
  left join entered_counts en
    on en.stage = s.from_stage
  left join progressed_counts pr
    on pr.from_stage = s.from_stage
   and pr.to_stage = s.to_stage
  order by s.step_order;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.report_stage_losses_for_period(p_company_id uuid, p_date_start date, p_date_end date)
 RETURNS TABLE(step_order integer, stage text, lost_to text, entered bigint, lost bigint, loss_rate numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_company_id is null then
    raise exception 'Empresa não informada';
  end if;

  if p_date_start is null or p_date_end is null then
    raise exception 'Período não informado';
  end if;

  if p_date_end < p_date_start then
    raise exception 'Período inválido';
  end if;

  if not public.has_company_membership_strict(p_company_id, null) then
    raise exception 'Usuário sem vínculo ativo com a empresa';
  end if;

  return query
  with steps as (
    select 1 as step_order, 'contato'::text as stage
    union all
    select 2, 'respondeu'
    union all
    select 3, 'negociacao'
  ),
  entered_counts as (
    select
      (ce.metadata->>'to_status')::text as stage,
      count(distinct ce.cycle_id) as n
    from public.cycle_events ce
    where ce.company_id = p_company_id
      and ce.event_type in ('stage_changed', 'stage_checkpoint', 'stage_moved')
      and ce.metadata->>'to_status' in ('contato', 'respondeu', 'negociacao')
      and (ce.occurred_at at time zone 'America/Sao_Paulo')::date between p_date_start and p_date_end
    group by ce.metadata->>'to_status'
  ),
  lost_counts as (
    select
      (ce.metadata->>'from_status')::text as stage,
      count(distinct ce.cycle_id) as n
    from public.cycle_events ce
    where ce.company_id = p_company_id
      and ce.event_type in ('stage_changed', 'stage_checkpoint', 'stage_moved', 'cycle_lost', 'closed_lost')
      and (
        ce.metadata->>'to_status' = 'perdido'
        or ce.event_type in ('cycle_lost', 'closed_lost')
      )
      and ce.metadata->>'from_status' in ('contato', 'respondeu', 'negociacao')
      and (ce.occurred_at at time zone 'America/Sao_Paulo')::date between p_date_start and p_date_end
    group by ce.metadata->>'from_status'
  )
  select
    s.step_order,
    s.stage,
    'perdido'::text as lost_to,
    coalesce(en.n, 0) as entered,
    coalesce(lo.n, 0) as lost,
    case
      when coalesce(en.n, 0) = 0 then 0::numeric
      else round((coalesce(lo.n, 0)::numeric / en.n::numeric) * 100, 2)
    end as loss_rate
  from steps s
  left join entered_counts en
    on en.stage = s.stage
  left join lost_counts lo
    on lo.stage = s.stage
  order by s.step_order;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.report_stage_time_summary_for_period(p_company_id uuid, p_date_start date, p_date_end date)
 RETURNS TABLE(from_stage text, moves bigint, avg_seconds numeric, median_seconds numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_company_id is null then
    raise exception 'Empresa não informada';
  end if;

  if p_date_start is null or p_date_end is null then
    raise exception 'Período não informado';
  end if;

  if p_date_end < p_date_start then
    raise exception 'Período inválido';
  end if;

  if not public.has_company_membership_strict(p_company_id, null) then
    raise exception 'Usuário sem vínculo ativo com a empresa';
  end if;

  return query
  with stage_durations as (
    select
      (ce.metadata->>'from_status')::text as from_stage,
      greatest(
        0,
        extract(
          epoch from (
            ce.occurred_at - coalesce(
              (
                select ce2.occurred_at
                from public.cycle_events ce2
                where ce2.cycle_id = ce.cycle_id
                  and ce2.company_id = p_company_id
                  and ce2.event_type in ('stage_changed', 'stage_checkpoint', 'stage_moved')
                  and ce2.metadata->>'to_status' = ce.metadata->>'from_status'
                  and ce2.occurred_at < ce.occurred_at
                order by ce2.occurred_at desc
                limit 1
              ),
              (
                select sc.created_at
                from public.sales_cycles sc
                where sc.id = ce.cycle_id
                  and sc.company_id = p_company_id
              )
            )
          )
        )
      ) as seconds_in_stage
    from public.cycle_events ce
    where ce.company_id = p_company_id
      and ce.event_type in ('stage_changed', 'stage_checkpoint', 'stage_moved')
      and ce.metadata->>'from_status' in ('contato', 'respondeu', 'negociacao')
      and ce.metadata->>'to_status' is not null
      and (ce.occurred_at at time zone 'America/Sao_Paulo')::date between p_date_start and p_date_end
  )
  select
    sd.from_stage,
    count(*) as moves,
    round(avg(sd.seconds_in_stage)::numeric, 0) as avg_seconds,
    round(percentile_cont(0.5) within group (order by sd.seconds_in_stage)::numeric, 0) as median_seconds
  from stage_durations sd
  where sd.seconds_in_stage > 0
  group by sd.from_stage
  order by avg_seconds desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_company_sla_rules_for_company(p_company_id uuid)
 RETURNS TABLE(id uuid, company_id uuid, status text, target_minutes integer, warning_minutes integer, danger_minutes integer, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'p_company_id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.company_memberships cm
    JOIN public.profiles p
      ON p.id = cm.user_id
    WHERE cm.company_id = p_company_id
      AND cm.user_id = auth.uid()
      AND cm.is_active = true
      AND COALESCE(p.is_active_global, true) = true
  ) THEN
    RAISE EXCEPTION 'Usuário sem vínculo ativo com a empresa.';
  END IF;

  RETURN QUERY
  SELECT
    sr.id,
    sr.company_id,
    sr.status,
    sr.target_minutes,
    sr.warning_minutes,
    sr.danger_minutes,
    sr.created_at,
    sr.updated_at
  FROM public.sla_rules sr
  WHERE sr.company_id = p_company_id
  ORDER BY sr.status;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_platform_set_company_status(p_company_id uuid, p_platform_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_current_status text;
  v_next_status text := lower(btrim(coalesce(p_platform_status, '')));
  v_membership record;
  v_backup jsonb;
  v_restore_active boolean;
  v_now timestamptz := now();
begin
  if v_actor_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'not_authenticated'
    );
  end if;

  if p_company_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'company_not_found'
    );
  end if;

  if v_next_status not in ('active', 'blocked') then
    return jsonb_build_object(
      'success', false,
      'error', 'invalid_platform_status'
    );
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_actor_id
      and p.is_platform_admin = true
      and coalesce(p.is_active_global, true) = true
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'platform_admin_required'
    );
  end if;

  select c.platform_status
    into v_current_status
  from public.companies c
  where c.id = p_company_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'company_not_found'
    );
  end if;

  if v_current_status = v_next_status then
    return jsonb_build_object(
      'success', true,
      'changed', false,
      'platform_status', v_current_status
    );
  end if;

  update public.companies
  set
    platform_status = v_next_status,
    platform_status_updated_at = v_now
  where id = p_company_id;

  if v_next_status = 'blocked' then
    for v_membership in
      select
        cm.id,
        cm.is_active,
        cm.metadata
      from public.company_memberships cm
      where cm.company_id = p_company_id
      for update
    loop
      update public.company_memberships
      set
        is_active = false,
        metadata = jsonb_set(
          coalesce(v_membership.metadata, '{}'::jsonb),
          '{platform_company_block_backup}',
          jsonb_build_object(
            'is_active', v_membership.is_active,
            'blocked_at', v_now,
            'blocked_by', v_actor_id
          ),
          true
        )
      where id = v_membership.id;
    end loop;
  else
    for v_membership in
      select
        cm.id,
        cm.is_active,
        cm.metadata
      from public.company_memberships cm
      where cm.company_id = p_company_id
      for update
    loop
      v_backup := coalesce(
        v_membership.metadata,
        '{}'::jsonb
      ) -> 'platform_company_block_backup';

      v_restore_active := case
        when v_backup ? 'is_active'
          then (v_backup ->> 'is_active')::boolean
        else v_membership.is_active
      end;

      update public.company_memberships
      set
        is_active = v_restore_active,
        metadata = coalesce(
          v_membership.metadata,
          '{}'::jsonb
        ) - 'platform_company_block_backup'
      where id = v_membership.id;
    end loop;
  end if;

  insert into public.admin_events (
    company_id,
    actor_user_id,
    target_user_id,
    event_type,
    metadata
  )
  values (
    p_company_id,
    v_actor_id,
    null,
    'company_platform_status_changed',
    jsonb_build_object(
      'from_status', v_current_status,
      'to_status', v_next_status,
      'source', 'platform_company_status_control'
    )
  );

  return jsonb_build_object(
    'success', true,
    'changed', true,
    'platform_status', v_next_status
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_create_successor_cycle_for_company(p_company_id uuid, p_source_cycle_id uuid, p_opportunity_type text, p_assignment_mode text, p_owner_user_id uuid DEFAULT NULL::uuid, p_group_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_is_admin_or_manager boolean := false;
  v_source public.sales_cycles%rowtype;
  v_source_terminal_owner_id uuid;
  v_destination_owner_id uuid := null;
  v_candidate_owner_id uuid;
  v_existing_active_cycle_id uuid;
  v_new_cycle_id uuid;
  v_type text := lower(btrim(coalesce(p_opportunity_type, '')));
  v_mode text := lower(btrim(coalesce(p_assignment_mode, '')));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_now timestamptz := now();
begin
  if v_actor_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'not_authenticated'
    );
  end if;

  if p_company_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'company_not_found'
    );
  end if;

  if p_source_cycle_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'source_cycle_not_found'
    );
  end if;

  if v_type not in (
    'reativacao',
    'renovacao',
    'recompra',
    'upgrade',
    'novo_produto'
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'invalid_opportunity_type'
    );
  end if;

  if v_mode not in (
    'same_seller',
    'pool',
    'auto_balance',
    'specific_seller'
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'invalid_assignment_mode'
    );
  end if;

  select cm.role
    into v_actor_role
  from public.company_memberships cm
  join public.profiles p
    on p.id = cm.user_id
  where cm.company_id = p_company_id
    and cm.user_id = v_actor_id
    and cm.is_active = true
    and coalesce(p.is_active_global, true) = true
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'membership_not_found'
    );
  end if;

  v_is_admin_or_manager := v_actor_role in ('admin', 'manager');

  select *
    into v_source
  from public.sales_cycles
  where id = p_source_cycle_id
    and company_id = p_company_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'source_cycle_not_found'
    );
  end if;

  if v_source.status not in ('ganho', 'perdido') then
    return jsonb_build_object(
      'success', false,
      'error', 'source_cycle_not_terminal'
    );
  end if;

  if not exists (
    select 1
    from public.leads l
    where l.id = v_source.lead_id
      and l.company_id = p_company_id
      and l.deleted_at is null
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'lead_not_available'
    );
  end if;

  v_source_terminal_owner_id := case
    when v_source.status = 'ganho' then v_source.won_owner_user_id
    when v_source.status = 'perdido' then v_source.lost_owner_user_id
    else null
  end;

  if not v_is_admin_or_manager
    and v_source.owner_user_id is distinct from v_actor_id
    and v_source_terminal_owner_id is distinct from v_actor_id
  then
    return jsonb_build_object(
      'success', false,
      'error', 'permission_denied'
    );
  end if;

  if not v_is_admin_or_manager
    and v_mode <> 'same_seller'
  then
    return jsonb_build_object(
      'success', false,
      'error', 'destination_change_requires_manager'
    );
  end if;

  if p_group_id is not null
    and not exists (
      select 1
      from public.lead_groups lg
      where lg.id = p_group_id
        and lg.company_id = p_company_id
        and lg.archived_at is null
    )
  then
    return jsonb_build_object(
      'success', false,
      'error', 'invalid_group'
    );
  end if;

  select sc.id
    into v_existing_active_cycle_id
  from public.sales_cycles sc
  where sc.company_id = p_company_id
    and sc.lead_id = v_source.lead_id
    and sc.status not in ('ganho', 'perdido')
  limit 1;

  if v_existing_active_cycle_id is not null then
    return jsonb_build_object(
      'success', false,
      'error', 'active_cycle_exists',
      'active_cycle_id', v_existing_active_cycle_id
    );
  end if;

  if v_mode = 'same_seller' then
    if not v_is_admin_or_manager then
      v_destination_owner_id := v_actor_id;
    else
      v_candidate_owner_id := coalesce(
        v_source_terminal_owner_id,
        v_source.owner_user_id
      );

      if v_candidate_owner_id is not null then
        select cm.user_id
          into v_destination_owner_id
        from public.company_memberships cm
        join public.profiles p
          on p.id = cm.user_id
        where cm.company_id = p_company_id
          and cm.user_id = v_candidate_owner_id
          and cm.is_active = true
          and coalesce(p.is_active_global, true) = true
        limit 1;
      end if;
    end if;
  end if;

  if v_mode = 'pool' then
    if not v_is_admin_or_manager then
      return jsonb_build_object(
        'success', false,
        'error', 'destination_change_requires_manager'
      );
    end if;

    v_destination_owner_id := null;
  end if;

  if v_mode = 'specific_seller' then
    if not v_is_admin_or_manager then
      return jsonb_build_object(
        'success', false,
        'error', 'destination_change_requires_manager'
      );
    end if;

    if p_owner_user_id is null then
      return jsonb_build_object(
        'success', false,
        'error', 'owner_required'
      );
    end if;

    select cm.user_id
      into v_destination_owner_id
    from public.company_memberships cm
    join public.profiles p
      on p.id = cm.user_id
    where cm.company_id = p_company_id
      and cm.user_id = p_owner_user_id
      and cm.is_active = true
      and coalesce(p.is_active_global, true) = true
    limit 1;

    if v_destination_owner_id is null then
      return jsonb_build_object(
        'success', false,
        'error', 'invalid_owner'
      );
    end if;
  end if;

  if v_mode = 'auto_balance' then
    if not v_is_admin_or_manager then
      return jsonb_build_object(
        'success', false,
        'error', 'destination_change_requires_manager'
      );
    end if;

    select cm.user_id
      into v_destination_owner_id
    from public.company_memberships cm
    join public.profiles p
      on p.id = cm.user_id
    left join public.sales_cycles active_cycle
      on active_cycle.company_id = p_company_id
     and active_cycle.owner_user_id = cm.user_id
     and active_cycle.status in (
       'novo',
       'contato',
       'respondeu',
       'negociacao',
       'pausado'
     )
    where cm.company_id = p_company_id
      and cm.is_active = true
      and cm.role in ('member', 'manager')
      and coalesce(p.is_active_global, true) = true
    group by cm.user_id, p.full_name, p.email
    order by
      count(active_cycle.id) asc,
      coalesce(
        nullif(p.full_name, ''),
        nullif(p.email, ''),
        cm.user_id::text
      ) asc,
      cm.user_id asc
    limit 1;

    if v_destination_owner_id is null then
      return jsonb_build_object(
        'success', false,
        'error', 'auto_distribution_unavailable'
      );
    end if;
  end if;

  insert into public.sales_cycles (
    company_id,
    lead_id,
    owner_user_id,
    status,
    stage_entered_at,
    current_group_id,
    origin_cycle_id,
    opportunity_type,
    created_at,
    updated_at
  )
  values (
    p_company_id,
    v_source.lead_id,
    v_destination_owner_id,
    'novo'::lead_status,
    v_now,
    p_group_id,
    v_source.id,
    v_type,
    v_now,
    v_now
  )
  returning id
    into v_new_cycle_id;

  insert into public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  values
    (
      v_new_cycle_id,
      p_company_id,
      'cycle_created',
      jsonb_build_object(
        'source', 'successor_cycle',
        'entry_mode', 'successor_cycle',
        'origin_cycle_id', v_source.id,
        'origin_status', v_source.status,
        'opportunity_type', v_type,
        'assignment_mode', v_mode,
        'owner_user_id', v_destination_owner_id,
        'group_id', p_group_id,
        'note', v_note
      ),
      v_actor_id,
      v_now
    ),
    (
      v_source.id,
      p_company_id,
      'successor_cycle_created',
      jsonb_build_object(
        'successor_cycle_id', v_new_cycle_id,
        'opportunity_type', v_type,
        'assignment_mode', v_mode,
        'owner_user_id', v_destination_owner_id,
        'group_id', p_group_id,
        'note', v_note
      ),
      v_actor_id,
      v_now
    );

  if p_group_id is not null then
    insert into public.lead_group_cycles (
      company_id,
      group_id,
      cycle_id,
      attached_by,
      attached_at
    )
    values (
      p_company_id,
      p_group_id,
      v_new_cycle_id,
      v_actor_id,
      v_now
    );

    insert into public.cycle_events (
      cycle_id,
      company_id,
      event_type,
      metadata,
      created_by,
      occurred_at
    )
    values (
      v_new_cycle_id,
      p_company_id,
      'group_attached',
      jsonb_build_object(
        'group_id', p_group_id,
        'source', 'successor_cycle'
      ),
      v_actor_id,
      v_now
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'cycle_id', v_new_cycle_id,
    'lead_id', v_source.lead_id,
    'origin_cycle_id', v_source.id,
    'owner_user_id', v_destination_owner_id,
    'assignment_mode', v_mode,
    'opportunity_type', v_type,
    'group_id', p_group_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_save_ai_coaching_for_company(p_company_id uuid, p_cycle_id uuid, p_coaching jsonb, p_yolen_decision jsonb DEFAULT '{}'::jsonb, p_source text DEFAULT 'ai_copilot_detail'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_membership_role text;
  v_is_admin_or_manager boolean := false;
  v_cycle_owner_user_id uuid;
  v_note_id uuid;
  v_now timestamptz := now();
  v_source text;
  v_summary text;
begin
  if v_actor_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'not_authenticated'
    );
  end if;

  if p_company_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'company_not_found'
    );
  end if;

  if p_cycle_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'cycle_not_found'
    );
  end if;

  if p_coaching is null
    or jsonb_typeof(p_coaching) <> 'object'
  then
    return jsonb_build_object(
      'success', false,
      'error', 'invalid_coaching'
    );
  end if;

  v_summary := nullif(
    trim(
      coalesce(
        p_coaching->>'conversation_summary',
        ''
      )
    ),
    ''
  );

  if v_summary is null then
    return jsonb_build_object(
      'success', false,
      'error', 'missing_conversation_summary'
    );
  end if;

  select cm.role
    into v_membership_role
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = v_actor_id
    and cm.is_active = true
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'membership_not_found'
    );
  end if;

  v_is_admin_or_manager :=
    v_membership_role in ('admin', 'manager');

  select sc.owner_user_id
    into v_cycle_owner_user_id
  from public.sales_cycles sc
  where sc.id = p_cycle_id
    and sc.company_id = p_company_id;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'cycle_not_found'
    );
  end if;

  if not v_is_admin_or_manager
    and v_cycle_owner_user_id is distinct from v_actor_id
  then
    return jsonb_build_object(
      'success', false,
      'error', 'permission_denied'
    );
  end if;

  v_source := coalesce(
    nullif(
      trim(
        coalesce(
          p_source,
          ''
        )
      ),
      ''
    ),
    'ai_copilot_detail'
  );

  insert into public.ai_coaching_notes (
    company_id,
    cycle_id,
    created_by,
    source,
    coaching,
    yolen_decision,
    created_at
  )
  values (
    p_company_id,
    p_cycle_id,
    v_actor_id,
    v_source,
    p_coaching,
    coalesce(
      p_yolen_decision,
      '{}'::jsonb
    ),
    v_now
  )
  returning id into v_note_id;

  insert into public.cycle_events (
    company_id,
    cycle_id,
    event_type,
    created_by,
    metadata,
    occurred_at
  )
  values (
    p_company_id,
    p_cycle_id,
    'ai_coaching_saved',
    v_actor_id,
    jsonb_build_object(
      'coaching_note_id',
      v_note_id,
      'summary_preview',
      left(v_summary, 220),
      'source',
      v_source
    ),
    v_now
  );

  return jsonb_build_object(
    'success', true,
    'id', v_note_id,
    'occurred_at', v_now
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_list_ai_coaching_for_cycle_for_company(p_company_id uuid, p_cycle_id uuid, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_membership_role text;
  v_is_admin_or_manager boolean := false;
  v_cycle_owner_user_id uuid;
  v_limit integer := least(
    greatest(
      coalesce(p_limit, 10),
      1
    ),
    50
  );
  v_items jsonb := '[]'::jsonb;
begin
  if v_actor_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'not_authenticated'
    );
  end if;

  if p_company_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'company_not_found'
    );
  end if;

  select cm.role
    into v_membership_role
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = v_actor_id
    and cm.is_active = true
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'membership_not_found'
    );
  end if;

  v_is_admin_or_manager :=
    v_membership_role in ('admin', 'manager');

  select sc.owner_user_id
    into v_cycle_owner_user_id
  from public.sales_cycles sc
  where sc.id = p_cycle_id
    and sc.company_id = p_company_id;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'cycle_not_found'
    );
  end if;

  if not v_is_admin_or_manager
    and v_cycle_owner_user_id is distinct from v_actor_id
  then
    return jsonb_build_object(
      'success', false,
      'error', 'permission_denied'
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',
        note.id,
        'created_at',
        note.created_at,
        'source',
        note.source,
        'coaching',
        note.coaching,
        'yolen_decision',
        note.yolen_decision
      )
      order by note.created_at desc
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      acn.id,
      acn.created_at,
      acn.source,
      acn.coaching,
      acn.yolen_decision
    from public.ai_coaching_notes acn
    where acn.company_id = p_company_id
      and acn.cycle_id = p_cycle_id
    order by acn.created_at desc
    limit v_limit
  ) note;

  return jsonb_build_object(
    'success', true,
    'items', v_items
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_ingest_site_lead(p_company_id uuid, p_created_by uuid, p_api_key_id uuid, p_source text, p_name text, p_phone text, p_email text, p_document text, p_notes text, p_campaign_name text, p_external_key text, p_external_id text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(result text, lead_id uuid, cycle_id uuid, error_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_existing_lead_id uuid;
  v_existing_deleted_at timestamptz;
  v_existing_external_key text;
  v_lead_id uuid;
  v_cycle_id uuid;
  v_lead_type text;
begin
  if not exists (
    select 1
    from public.company_lead_api_keys k
    where k.id = p_api_key_id
      and k.company_id = p_company_id
      and k.revoked_at is null
  ) then
    raise exception 'Chave de integração inválida ou revogada.' using errcode = '42501';
  end if;

  select
    l.id,
    l.deleted_at,
    l.external_key
  into
    v_existing_lead_id,
    v_existing_deleted_at,
    v_existing_external_key
  from public.leads l
  left join public.lead_profiles lp
    on lp.lead_id = l.id
   and lp.company_id = l.company_id
  where l.company_id = p_company_id
    and (
      (p_external_key is not null and l.external_key = p_external_key)
      or (p_document is not null and (l.cpf_cnpj = p_document or lp.cpf = p_document or lp.cnpj = p_document))
      or (p_phone is not null and l.phone_norm = p_phone)
      or (p_email is not null and l.email_norm = p_email)
    )
  order by
    case when p_external_key is not null and l.external_key = p_external_key then 0 else 1 end,
    l.created_at asc
  limit 1;

  if v_existing_lead_id is not null then
    select sc.id
      into v_cycle_id
    from public.sales_cycles sc
    where sc.company_id = p_company_id
      and sc.lead_id = v_existing_lead_id
    order by sc.created_at desc
    limit 1;

    update public.company_lead_api_keys
       set last_used_at = now(),
           last_used_lead_id = v_existing_lead_id
     where id = p_api_key_id;

    if p_external_key is not null and v_existing_external_key = p_external_key then
      return query select 'duplicate'::text, v_existing_lead_id, v_cycle_id, null::text;
      return;
    end if;

    if v_existing_deleted_at is not null then
      return query select 'conflict'::text, v_existing_lead_id, v_cycle_id, 'deleted_lead_conflict'::text;
      return;
    end if;

    return query select 'conflict'::text, v_existing_lead_id, v_cycle_id, 'active_lead_conflict'::text;
    return;
  end if;

  v_lead_type := case
    when length(coalesce(p_document, '')) = 11 then 'PF'
    when length(coalesce(p_document, '')) = 14 then 'PJ'
    else null
  end;

  insert into public.leads (
    company_id,
    name,
    phone,
    phone_norm,
    email,
    email_norm,
    cpf_cnpj,
    notes,
    campaign_name,
    source,
    external_key,
    entry_mode,
    lead_origin_at,
    created_by
  )
  values (
    p_company_id,
    p_name,
    p_phone,
    p_phone,
    p_email,
    p_email,
    p_document,
    p_notes,
    p_campaign_name,
    p_source,
    p_external_key,
    'import_api',
    now(),
    p_created_by
  )
  returning id into v_lead_id;

  if v_lead_type is not null then
    insert into public.lead_profiles (
      lead_id,
      company_id,
      lead_type,
      cpf,
      cnpj,
      email,
      address_country
    )
    values (
      v_lead_id,
      p_company_id,
      v_lead_type,
      case when v_lead_type = 'PF' then p_document else null end,
      case when v_lead_type = 'PJ' then p_document else null end,
      p_email,
      'Brasil'
    )
    on conflict do nothing;
  end if;

  insert into public.sales_cycles (
    company_id,
    lead_id,
    owner_user_id,
    status,
    stage_entered_at
  )
  values (
    p_company_id,
    v_lead_id,
    null,
    'novo',
    now()
  )
  returning id into v_cycle_id;

  insert into public.cycle_events (
    company_id,
    cycle_id,
    event_type,
    created_by,
    metadata,
    occurred_at
  )
  values (
    p_company_id,
    v_cycle_id,
    'cycle_created',
    p_created_by,
    jsonb_strip_nulls(
      jsonb_build_object(
        'source', 'site_api',
        'entry_mode', 'import_api',
        'api_key_id', p_api_key_id,
        'source_label', p_source,
        'external_id', p_external_id,
        'campaign_name', p_campaign_name,
        'form_name', nullif(p_metadata ->> 'form_name', ''),
        'page_url', nullif(p_metadata ->> 'page_url', ''),
        'utm_source', nullif(p_metadata ->> 'utm_source', ''),
        'utm_medium', nullif(p_metadata ->> 'utm_medium', ''),
        'utm_campaign', nullif(p_metadata ->> 'utm_campaign', '')
      )
    ),
    now()
  );

  update public.company_lead_api_keys
     set last_used_at = now(),
         last_used_lead_id = v_lead_id
   where id = p_api_key_id;

  return query select 'created'::text, v_lead_id, v_cycle_id, null::text;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_assign_site_lead_round_robin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_entry_mode text;
  v_candidate_owner_ids uuid[] := array[]::uuid[];
  v_last_assigned_owner_id uuid;
  v_candidate_count integer := 0;
  v_last_position integer;
  v_next_position integer;
begin
  if new.owner_user_id is not null then
    return new;
  end if;

  select l.entry_mode
    into v_entry_mode
  from public.leads l
  where l.id = new.lead_id
    and l.company_id = new.company_id;

  if v_entry_mode is distinct from 'import_api' then
    return new;
  end if;

  insert into public.company_site_lead_distribution (company_id)
  values (new.company_id)
  on conflict (company_id) do nothing;

  select last_assigned_owner_id
    into v_last_assigned_owner_id
  from public.company_site_lead_distribution
  where company_id = new.company_id
  for update;

  select coalesce(
    array_agg(cm.user_id order by lower(coalesce(p.full_name, p.email, '')), cm.user_id),
    array[]::uuid[]
  )
    into v_candidate_owner_ids
  from public.company_memberships cm
  join public.profiles p
    on p.id = cm.user_id
  where cm.company_id = new.company_id
    and cm.is_active = true
    and cm.role = 'member'
    and coalesce(p.is_active_global, true) = true;

  v_candidate_count := coalesce(array_length(v_candidate_owner_ids, 1), 0);

  if v_candidate_count = 0 then
    return new;
  end if;

  v_last_position := array_position(v_candidate_owner_ids, v_last_assigned_owner_id);
  v_next_position := coalesce(v_last_position, 0) + 1;

  if v_next_position > v_candidate_count then
    v_next_position := 1;
  end if;

  new.owner_user_id := v_candidate_owner_ids[v_next_position];

  update public.company_site_lead_distribution
     set last_assigned_owner_id = new.owner_user_id,
         updated_at = now()
   where company_id = new.company_id;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_is_real_work_event(p_event_type text, p_metadata jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_event_type in ('quick_approach_contact','quick_call_done','quick_whats_sent','quick_answered_doubt','quick_scheduled','quick_proposal') then true
    when p_event_type in ('stage_changed','stage_moved') then (
      coalesce(p_metadata->>'from_status', p_metadata->'metadata'->>'from_status') = 'novo'
      and coalesce(p_metadata->>'to_status', p_metadata->'metadata'->>'to_status') in ('contato','respondeu','negociacao')
      and (
        (p_metadata->'checkpoint' is not null and p_metadata->'checkpoint' <> 'null'::jsonb and p_metadata->'checkpoint' <> '{}'::jsonb)
        or p_metadata->>'action_result' is not null
        or p_metadata->'metadata'->>'action_result' is not null
        or p_metadata->>'action_channel' is not null
        or p_metadata->'metadata'->>'action_channel' is not null
      )
    )
    else false
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_set_first_worked_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.fn_is_real_work_event(new.event_type, new.metadata) then
    return new;
  end if;

  update public.sales_cycles
     set first_worked_at = new.occurred_at
   where id = new.cycle_id
     and first_worked_at is null;

  update public.leads l
     set first_worked_at = new.occurred_at
    from public.sales_cycles sc
   where sc.id = new.cycle_id
     and sc.lead_id = l.id
     and l.first_worked_at is null;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_monthly_worked_opportunities(p_company_id uuid, p_owner_user_id uuid DEFAULT NULL::uuid, p_month date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_is_admin_or_manager boolean := false;
  v_owner_filter uuid;
  v_month_start date;
  v_month_end date;
  v_worked_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_company_id is null then
    raise exception 'Empresa não informada';
  end if;

  if not public.has_company_membership_strict(p_company_id, null) then
    raise exception 'Usuário sem vínculo ativo com a empresa';
  end if;

  v_is_admin_or_manager := public.has_company_membership_strict(
    p_company_id,
    array['admin', 'manager']
  );

  if v_is_admin_or_manager then
    v_owner_filter := p_owner_user_id;
  else
    v_owner_filter := v_user_id;
  end if;

  v_month_start := date_trunc('month', coalesce(p_month, now()::date))::date;
  v_month_end := (v_month_start + interval '1 month')::date;

  select count(*)
    into v_worked_count
  from (
    select distinct on (ce.cycle_id) ce.cycle_id
    from public.cycle_events ce
    join public.sales_cycles sc on sc.id = ce.cycle_id
    where ce.company_id = p_company_id
      and (ce.occurred_at at time zone 'America/Sao_Paulo')::date >= v_month_start
      and (ce.occurred_at at time zone 'America/Sao_Paulo')::date < v_month_end
      and public.fn_is_real_work_event(ce.event_type, ce.metadata)
      and (v_owner_filter is null or sc.owner_user_id = v_owner_filter)
    order by ce.cycle_id, ce.occurred_at asc
  ) monthly_work;

  return coalesce(v_worked_count, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_sales_cycle_metrics_v1_for_company(p_company_id uuid, p_owner_user_id uuid DEFAULT NULL::uuid, p_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
AS $function$select public.rpc_get_sales_cycle_metrics_v1_for_company_base($1, $2, $3)$function$
;

-- -----------------------------------------------------------------------------
-- Views
-- -----------------------------------------------------------------------------

create or replace view public.v_pipeline_items with (security_invoker=true) as
 SELECT sc.id,
    sc.lead_id,
    l.name,
    l.phone,
    COALESCE(NULLIF(l.email, ''::text), lp.email) AS email,
    lp.cpf,
    lp.cnpj,
    COALESCE(NULLIF(lp.cpf, ''::text), NULLIF(lp.cnpj, ''::text), NULLIF(l.cpf_cnpj, ''::text)) AS document,
    sc.status,
    sc.stage_entered_at,
    sc.owner_user_id AS owner_id,
    sc.current_group_id AS group_id,
    sc.next_action,
    sc.next_action_date,
    sc.created_at,
    sc.company_id,
    regexp_replace(COALESCE(l.phone, ''::text), '\\D'::text, ''::text, 'g'::text) AS phone_digits,
    regexp_replace(COALESCE(NULLIF(lp.cpf, ''::text), NULLIF(lp.cnpj, ''::text), NULLIF(l.cpf_cnpj, ''::text), ''::text), '\\D'::text, ''::text, 'g'::text) AS document_digits,
    sc.updated_at,
    l.entry_mode,
    l.source,
    l.external_key,
    l.lead_origin_at
   FROM sales_cycles sc
     JOIN leads l ON l.id = sc.lead_id
     LEFT JOIN lead_profiles lp ON lp.lead_id = sc.lead_id AND lp.company_id = sc.company_id
  WHERE l.deleted_at IS NULL;;

create or replace view public.v_kanban_items as
 SELECT pipeline_item.id,
    pipeline_item.lead_id,
    pipeline_item.name,
    pipeline_item.phone,
    pipeline_item.email,
    pipeline_item.cpf,
    pipeline_item.cnpj,
    pipeline_item.document,
    pipeline_item.status,
    pipeline_item.stage_entered_at,
    pipeline_item.owner_id,
    pipeline_item.group_id,
    pipeline_item.next_action,
    pipeline_item.next_action_date,
    pipeline_item.created_at,
    pipeline_item.company_id,
    pipeline_item.phone_digits,
    pipeline_item.document_digits,
    pipeline_item.updated_at,
        CASE
            WHEN sales_cycle.status = 'ganho'::lead_status THEN (sales_cycle.won_at AT TIME ZONE 'America/Sao_Paulo'::text)::date
            WHEN sales_cycle.status = 'perdido'::lead_status THEN (sales_cycle.lost_at AT TIME ZONE 'America/Sao_Paulo'::text)::date
            ELSE NULL::date
        END AS terminal_closed_on,
        CASE
            WHEN sales_cycle.status = 'ganho'::lead_status THEN sales_cycle.won_total
            ELSE NULL::numeric
        END AS terminal_won_total,
        CASE
            WHEN sales_cycle.status = 'perdido'::lead_status THEN sales_cycle.lost_reason
            ELSE NULL::text
        END AS terminal_lost_reason,
        CASE
            WHEN sales_cycle.status = ANY (ARRAY['ganho'::lead_status, 'perdido'::lead_status]) THEN product.name
            ELSE NULL::text
        END AS terminal_product_name
   FROM v_pipeline_items pipeline_item
     JOIN sales_cycles sales_cycle ON sales_cycle.id = pipeline_item.id AND sales_cycle.company_id = pipeline_item.company_id
     LEFT JOIN products product ON product.id = sales_cycle.product_id AND product.company_id = sales_cycle.company_id;;

create or replace view public.v_pool_items_with_returns with (security_invoker=true) as
 WITH latest_returns AS (
         SELECT cycle_events.cycle_id,
            cycle_events.metadata ->> 'reason'::text AS last_return_reason,
            cycle_events.metadata ->> 'details'::text AS last_return_details,
            cycle_events.occurred_at AS last_return_at,
            cycle_events.created_by AS last_return_by,
            row_number() OVER (PARTITION BY cycle_events.cycle_id ORDER BY cycle_events.occurred_at DESC) AS rn
           FROM cycle_events
          WHERE cycle_events.event_type = 'returned_to_pool'::text
        )
 SELECT sc.id,
    sc.lead_id,
    l.name,
    l.phone,
    sc.created_at,
    sc.status,
    sc.owner_user_id AS owner_id,
    sc.current_group_id AS group_id,
    sc.company_id,
        CASE
            WHEN sc.current_group_id IS NOT NULL THEN jsonb_build_object('name', lg.name)
            ELSE NULL::jsonb
        END AS lead_groups,
    lr.last_return_reason,
    lr.last_return_details,
    lr.last_return_at,
    lr.last_return_by
   FROM sales_cycles sc
     LEFT JOIN leads l ON sc.lead_id = l.id
     LEFT JOIN lead_groups lg ON sc.current_group_id = lg.id
     LEFT JOIN latest_returns lr ON sc.id = lr.cycle_id AND lr.rn = 1
  WHERE sc.owner_user_id IS NULL AND sc.company_id = current_company_id();;

create or replace view public.v_revenue_daily_extra with (security_invoker=true) as
 WITH extra_overrides AS (
         SELECT rod.company_id,
            rod.source_id AS extra_id,
            rod.ref_date,
            0::numeric AS cockpit_value,
            COALESCE(rod.real_value, 0::numeric) AS real_value
           FROM revenue_overrides_daily rod
          WHERE rod.source_kind = 'extra'::text
        )
 SELECT company_id,
    extra_id,
    ref_date,
    cockpit_value,
    real_value,
    real_value - cockpit_value AS adjustment_value
   FROM extra_overrides
  ORDER BY company_id, extra_id, ref_date DESC;;

create or replace view public.v_revenue_daily_seller with (security_invoker=true) as
 WITH cockpit_values AS (
         SELECT sc.company_id,
            COALESCE(sc.won_owner_user_id, sc.owner_user_id) AS seller_id,
            COALESCE(sc.revenue_seller_ref_date::date, (sc.won_at AT TIME ZONE 'America/Sao_Paulo'::text)::date) AS ref_date,
            sum(COALESCE(sc.won_total, 0::numeric)) AS cockpit_value
           FROM sales_cycles sc
          WHERE sc.status = 'ganho'::lead_status AND COALESCE(sc.won_owner_user_id, sc.owner_user_id) IS NOT NULL AND sc.won_at IS NOT NULL
          GROUP BY sc.company_id, (COALESCE(sc.won_owner_user_id, sc.owner_user_id)), (COALESCE(sc.revenue_seller_ref_date::date, (sc.won_at AT TIME ZONE 'America/Sao_Paulo'::text)::date))
        ), with_overrides AS (
         SELECT cv.company_id,
            cv.seller_id,
            cv.ref_date,
            cv.cockpit_value,
            COALESCE(rod.real_value, cv.cockpit_value) AS real_value
           FROM cockpit_values cv
             LEFT JOIN revenue_overrides_daily rod ON cv.company_id = rod.company_id AND rod.source_kind = 'seller'::text AND cv.seller_id = rod.source_id AND cv.ref_date = rod.ref_date
        )
 SELECT company_id,
    seller_id,
    ref_date,
    cockpit_value,
    real_value,
    real_value - cockpit_value AS adjustment_value
   FROM with_overrides
  ORDER BY company_id, seller_id, ref_date DESC;;

create or replace view public.vw_audit_sales_cycles_history with (security_invoker=true) as
 SELECT a.id AS audit_id,
    a.sales_cycle_id,
    a.operation,
    a.changed_at,
    COALESCE(u.email, 'Sistema'::character varying) AS changed_by_email,
    a.changes_summary,
    a.old_data,
    a.new_data
   FROM audit_sales_cycles a
     LEFT JOIN auth.users u ON a.changed_by = u.id
  ORDER BY a.changed_at DESC;;

create or replace view public.vw_lead_status_age with (security_invoker=true) as
 SELECT l.id AS lead_id,
    l.company_id,
    l.name,
    l.phone,
    l.status,
    l.created_at,
    COALESCE(e.moved_at, l.created_at) AS stage_started_at,
    EXTRACT(epoch FROM now() - COALESCE(e.moved_at, l.created_at))::integer AS seconds_in_status
   FROM leads l
     LEFT JOIN LATERAL ( SELECT e_1.moved_at
           FROM lead_stage_events e_1
          WHERE e_1.lead_id = l.id AND e_1.to_status = l.status
          ORDER BY e_1.moved_at DESC
         LIMIT 1) e ON true;;

create or replace view public.vw_revenue_by_seller_day with (security_invoker=true) as
 SELECT sc.company_id,
    date(sc.won_at) AS won_date,
    sc.won_owner_user_id,
    p.email AS seller_email,
    count(sc.id) AS deals_won,
    sum(sc.won_total) AS total_revenue,
    avg(sc.won_total) AS avg_deal_value,
    sum(sc.won_items) AS total_items
   FROM sales_cycles sc
     LEFT JOIN profiles p ON sc.won_owner_user_id = p.id
  WHERE sc.status = 'ganho'::lead_status AND sc.won_at IS NOT NULL
  GROUP BY sc.company_id, (date(sc.won_at)), sc.won_owner_user_id, p.email
  ORDER BY sc.company_id, (date(sc.won_at)) DESC, (sum(sc.won_total)) DESC;;

create or replace view public.vw_revenue_by_seller_total with (security_invoker=true) as
 SELECT sc.company_id,
    sc.won_owner_user_id,
    p.email AS seller_email,
    count(sc.id) AS total_deals_won,
    sum(sc.won_total) AS total_revenue,
    avg(sc.won_total) AS avg_deal_value,
    max(sc.won_at) AS last_won_date,
    sum(sc.won_items) AS total_items
   FROM sales_cycles sc
     LEFT JOIN profiles p ON sc.won_owner_user_id = p.id
  WHERE sc.status = 'ganho'::lead_status AND sc.won_at IS NOT NULL
  GROUP BY sc.company_id, sc.won_owner_user_id, p.email
  ORDER BY sc.company_id, (sum(sc.won_total)) DESC;;

create or replace view public.vw_sales_cycles_complete with (security_invoker=true) as
 SELECT sc.id,
    sc.company_id,
    sc.lead_id,
    sc.owner_user_id,
    COALESCE(p.email, 'N/A'::text)::character varying AS owner_email,
    sc.status,
    sc.previous_status,
    sc.stage_entered_at,
    sc.next_action,
    sc.next_action_date,
    sc.current_group_id,
    sc.created_at,
    sc.updated_at,
    sc.closed_at,
    sc.won_owner_user_id,
    sc.won_at,
    sc.won_total,
    sc.won_items,
    sc.won_note,
    sc.lost_reason,
    sc.lost_at,
    sc.lost_owner_user_id,
    COALESCE(p_lost.email, 'N/A'::text)::character varying AS lost_owner_email,
    sc.paused_at,
    sc.paused_reason,
    sc.canceled_at,
    sc.canceled_reason,
        CASE
            WHEN sc.status = 'ganho'::lead_status THEN 'Ganho'::text
            WHEN sc.status = 'perdido'::lead_status THEN 'Perdido'::text
            WHEN sc.status = 'pausado'::lead_status THEN 'Pausado'::text
            WHEN sc.status = 'cancelado'::lead_status THEN 'Cancelado'::text
            ELSE 'Em Andamento'::text
        END AS status_display,
    EXTRACT(day FROM COALESCE(sc.closed_at, now()) - sc.created_at) AS dias_em_ciclo,
        CASE
            WHEN sc.won_at IS NOT NULL THEN 'Ganho'::text
            WHEN sc.lost_at IS NOT NULL THEN 'Perdido'::text
            WHEN sc.canceled_at IS NOT NULL THEN 'Cancelado'::text
            WHEN sc.paused_at IS NOT NULL THEN 'Pausado'::text
            ELSE 'Ativo'::text
        END AS resultado_final
   FROM sales_cycles sc
     LEFT JOIN profiles p ON sc.owner_user_id = p.id
     LEFT JOIN profiles p_lost ON sc.lost_owner_user_id = p_lost.id;;

create or replace view public.vw_sales_cycles_with_revenue with (security_invoker=true) as
 SELECT sc.id,
    sc.lead_id,
    sc.company_id,
    sc.owner_user_id,
    sc.status,
    sc.won_total,
    sc.won_at,
    sc.created_at,
    sc.won_value_source,
    p.email AS owner_email,
    p.full_name AS owner_name,
    sc.revenue_seller_ref_date,
    COALESCE(
        CASE
            WHEN sc.won_value_source::text = 'revenue'::text AND rdp.real_value IS NOT NULL THEN rdp.real_value
            ELSE sc.won_total
        END, sc.won_total) AS final_won_value,
    rdp.real_value AS revenue_real_value,
    rdp.cockpit_value AS revenue_cockpit_value,
    sc.won_owner_user_id,
    sc.lost_at,
    sc.lost_reason,
    sc.canceled_at,
    sc.paused_at,
    sc.next_action_date,
    sc.updated_at,
    COALESCE(sc.won_owner_user_id, sc.owner_user_id) AS seller_id
   FROM sales_cycles sc
     LEFT JOIN profiles p ON COALESCE(sc.won_owner_user_id, sc.owner_user_id) = p.id
     LEFT JOIN v_revenue_daily_seller rdp ON COALESCE(sc.won_owner_user_id, sc.owner_user_id) = rdp.seller_id AND sc.revenue_seller_ref_date::date = rdp.ref_date AND sc.company_id = rdp.company_id;;

create or replace view public.vw_sales_funnel with (security_invoker=true) as
 SELECT sc.status,
    count(*) AS total_deals,
    count(
        CASE
            WHEN sc.won_at IS NOT NULL THEN 1
            ELSE NULL::integer
        END) AS deals_ganhos,
    count(
        CASE
            WHEN sc.lost_at IS NOT NULL THEN 1
            ELSE NULL::integer
        END) AS deals_perdidos,
    round(100.0 * count(
        CASE
            WHEN sc.won_at IS NOT NULL THEN 1
            ELSE NULL::integer
        END)::numeric / NULLIF(count(*), 0)::numeric, 2) AS taxa_conversao_pct,
    round(COALESCE(
        CASE
            WHEN count(
            CASE
                WHEN sc.won_at IS NOT NULL THEN 1
                ELSE NULL::integer
            END) > 0 THEN sum(
            CASE
                WHEN sc.won_at IS NOT NULL THEN scwr.final_won_value
                ELSE 0::numeric
            END) / count(
            CASE
                WHEN sc.won_at IS NOT NULL THEN 1
                ELSE NULL::integer
            END)::numeric
            ELSE 0::numeric
        END, 0::numeric), 2) AS valor_medio_ganho,
    COALESCE(sum(
        CASE
            WHEN sc.won_at IS NOT NULL THEN scwr.final_won_value
            ELSE 0::numeric
        END), 0::numeric) AS receita_total
   FROM sales_cycles sc
     LEFT JOIN vw_sales_cycles_with_revenue scwr ON sc.id = scwr.id
  WHERE sc.company_id IS NOT NULL
  GROUP BY sc.status
  ORDER BY (
        CASE sc.status
            WHEN 'novo'::lead_status THEN 1
            WHEN 'contato'::lead_status THEN 2
            WHEN 'respondeu'::lead_status THEN 3
            WHEN 'negociacao'::lead_status THEN 4
            WHEN 'ganho'::lead_status THEN 5
            WHEN 'perdido'::lead_status THEN 6
            ELSE 7
        END);;

create or replace view public.vw_sales_lost_analysis with (security_invoker=true) as
 SELECT sc.lost_reason AS motivo,
    count(*) AS total_deals_perdidos,
    round(100.0 * count(*)::numeric / NULLIF(( SELECT count(*) AS count
           FROM sales_cycles
          WHERE sales_cycles.lost_at IS NOT NULL), 0)::numeric, 2) AS percentual,
    COALESCE(sum(
        CASE
            WHEN sc.won_at IS NOT NULL THEN scwr.final_won_value
            ELSE 0::numeric
        END), 0::numeric) AS valor_estimado
   FROM sales_cycles sc
     LEFT JOIN vw_sales_cycles_with_revenue scwr ON sc.id = scwr.id
  WHERE sc.lost_at IS NOT NULL AND sc.company_id IS NOT NULL AND sc.lost_reason IS NOT NULL
  GROUP BY sc.lost_reason
  ORDER BY (count(*)) DESC;;

create or replace view public.vw_sales_monthly_analysis with (security_invoker=true) as
 SELECT date_trunc('month'::text, COALESCE(sc.won_at, sc.created_at))::date AS mes,
    count(*) AS total_deals_criados,
    count(
        CASE
            WHEN sc.won_at IS NOT NULL THEN 1
            ELSE NULL::integer
        END) AS deals_ganhos,
    count(
        CASE
            WHEN sc.lost_at IS NOT NULL THEN 1
            ELSE NULL::integer
        END) AS deals_perdidos,
    round(100.0 * count(
        CASE
            WHEN sc.won_at IS NOT NULL THEN 1
            ELSE NULL::integer
        END)::numeric / NULLIF(count(*), 0)::numeric, 2) AS taxa_conversao_pct,
    COALESCE(sum(
        CASE
            WHEN sc.won_at IS NOT NULL THEN scwr.final_won_value
            ELSE 0::numeric
        END), 0::numeric) AS receita_total,
    round(COALESCE(
        CASE
            WHEN count(
            CASE
                WHEN sc.won_at IS NOT NULL THEN 1
                ELSE NULL::integer
            END) > 0 THEN sum(
            CASE
                WHEN sc.won_at IS NOT NULL THEN scwr.final_won_value
                ELSE 0::numeric
            END) / count(
            CASE
                WHEN sc.won_at IS NOT NULL THEN 1
                ELSE NULL::integer
            END)::numeric
            ELSE 0::numeric
        END, 0::numeric), 2) AS receita_media_por_deal
   FROM sales_cycles sc
     LEFT JOIN vw_sales_cycles_with_revenue scwr ON sc.id = scwr.id
  WHERE sc.company_id IS NOT NULL
  GROUP BY (date_trunc('month'::text, COALESCE(sc.won_at, sc.created_at)))
  ORDER BY (date_trunc('month'::text, COALESCE(sc.won_at, sc.created_at))::date) DESC;;

create or replace view public.vw_sales_performance_by_owner with (security_invoker=true) as
 SELECT p.email AS owner_email,
    p.full_name AS owner_name,
    count(*) AS total_deals,
    count(
        CASE
            WHEN sc.won_at IS NOT NULL THEN 1
            ELSE NULL::integer
        END) AS deals_ganhos,
    count(
        CASE
            WHEN sc.lost_at IS NOT NULL THEN 1
            ELSE NULL::integer
        END) AS deals_perdidos,
    round(100.0 * count(
        CASE
            WHEN sc.won_at IS NOT NULL THEN 1
            ELSE NULL::integer
        END)::numeric / NULLIF(count(*), 0)::numeric, 2) AS taxa_conversao_pct,
    COALESCE(sum(
        CASE
            WHEN sc.won_at IS NOT NULL THEN scwr.final_won_value
            ELSE 0::numeric
        END), 0::numeric) AS valor_total_ganho,
    round(COALESCE(
        CASE
            WHEN count(
            CASE
                WHEN sc.won_at IS NOT NULL THEN 1
                ELSE NULL::integer
            END) > 0 THEN sum(
            CASE
                WHEN sc.won_at IS NOT NULL THEN scwr.final_won_value
                ELSE 0::numeric
            END) / count(
            CASE
                WHEN sc.won_at IS NOT NULL THEN 1
                ELSE NULL::integer
            END)::numeric
            ELSE 0::numeric
        END, 0::numeric), 2) AS ticket_medio,
    round(avg(EXTRACT(day FROM COALESCE(sc.won_at, now()) - sc.created_at)), 1) AS dias_medio_ciclo
   FROM sales_cycles sc
     LEFT JOIN profiles p ON sc.owner_user_id = p.id
     LEFT JOIN vw_sales_cycles_with_revenue scwr ON sc.id = scwr.id
  WHERE sc.company_id IS NOT NULL AND sc.owner_user_id IS NOT NULL
  GROUP BY p.id, p.email, p.full_name
  ORDER BY (round(100.0 * count(
        CASE
            WHEN sc.won_at IS NOT NULL THEN 1
            ELSE NULL::integer
        END)::numeric / NULLIF(count(*), 0)::numeric, 2)) DESC;;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

CREATE TRIGGER trigger_create_quick_actions AFTER INSERT ON companies FOR EACH ROW EXECUTE FUNCTION create_default_quick_actions();

CREATE TRIGGER trg_company_memberships_updated_at BEFORE UPDATE ON company_memberships FOR EACH ROW EXECUTE FUNCTION set_company_memberships_updated_at();

CREATE TRIGGER update_company_sla_rules_updated_at BEFORE UPDATE ON company_sla_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_cycle_events_first_worked AFTER INSERT ON cycle_events FOR EACH ROW EXECUTE FUNCTION trg_set_first_worked_at();

CREATE TRIGGER trg_execution_day_calendars_updated_at BEFORE UPDATE ON execution_day_calendars FOR EACH ROW EXECUTE FUNCTION set_execution_day_calendars_updated_at();

CREATE TRIGGER trg_lead_events_period_activity AFTER INSERT ON lead_events FOR EACH ROW EXECUTE FUNCTION handle_lead_event_period_activity();

CREATE TRIGGER trg_block_lead_profiles_key_update BEFORE UPDATE ON lead_profiles FOR EACH ROW EXECUTE FUNCTION block_lead_profiles_key_update();

CREATE TRIGGER trg_lead_profiles_updated_at BEFORE UPDATE ON lead_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_lead_user_priority_updated_at BEFORE UPDATE ON lead_user_priority FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_leads_period_activity AFTER UPDATE OF status, stage_entered_at ON leads FOR EACH ROW EXECUTE FUNCTION handle_lead_status_period_activity();

CREATE TRIGGER trg_log_lead_stage_change AFTER UPDATE OF status ON leads FOR EACH ROW EXECUTE FUNCTION log_lead_stage_change();

CREATE TRIGGER trg_log_lead_status_change AFTER UPDATE OF status ON leads FOR EACH ROW EXECUTE FUNCTION log_lead_status_change();

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION fn_products_updated_at();

CREATE TRIGGER trg_profile_details_updated_at BEFORE UPDATE ON profile_details FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_profiles_set_user_code BEFORE INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION profiles_set_user_code();

CREATE TRIGGER set_updated_at_revenue_goals BEFORE UPDATE ON revenue_goals FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_assign_site_lead_round_robin BEFORE INSERT ON sales_cycles FOR EACH ROW EXECUTE FUNCTION fn_assign_site_lead_round_robin();

CREATE TRIGGER trg_audit_sales_cycles_delete BEFORE DELETE ON sales_cycles FOR EACH ROW EXECUTE FUNCTION fn_audit_sales_cycles();

CREATE TRIGGER trg_audit_sales_cycles_insert AFTER INSERT ON sales_cycles FOR EACH ROW EXECUTE FUNCTION fn_audit_sales_cycles();

CREATE TRIGGER trg_audit_sales_cycles_update AFTER UPDATE ON sales_cycles FOR EACH ROW EXECUTE FUNCTION fn_audit_sales_cycles();

CREATE TRIGGER trg_auto_fill_closed_at BEFORE UPDATE ON sales_cycles FOR EACH ROW EXECUTE FUNCTION fn_auto_fill_closed_at();

CREATE TRIGGER trg_log_status_change BEFORE UPDATE ON sales_cycles FOR EACH ROW EXECUTE FUNCTION fn_log_status_change();

CREATE TRIGGER trg_sales_cycles_period_activity AFTER UPDATE OF status ON sales_cycles FOR EACH ROW EXECUTE FUNCTION handle_sales_cycle_period_activity();

CREATE TRIGGER trigger_handle_won_columns_freeze BEFORE UPDATE ON sales_cycles FOR EACH ROW WHEN (new.status IS DISTINCT FROM old.status) EXECUTE FUNCTION handle_won_columns_freeze();

CREATE TRIGGER trigger_handle_won_columns_reset BEFORE UPDATE ON sales_cycles FOR EACH ROW WHEN (new.status IS DISTINCT FROM old.status) EXECUTE FUNCTION handle_won_columns_reset();

CREATE TRIGGER trigger_sales_cycles_closed_at BEFORE UPDATE ON sales_cycles FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION handle_sales_cycle_closed_at();

CREATE TRIGGER trigger_sales_cycles_updated_at BEFORE UPDATE ON sales_cycles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.admin_events enable row level security;

alter table public.ai_coaching_notes enable row level security;

alter table public.audit_sales_cycles enable row level security;
alter table public.audit_sales_cycles force row level security;

alter table public.companies enable row level security;

alter table public.company_admin_invitations enable row level security;

alter table public.company_counters enable row level security;

alter table public.company_lead_api_keys enable row level security;

alter table public.company_memberships enable row level security;

alter table public.company_site_lead_distribution enable row level security;

alter table public.company_sla_rules enable row level security;

alter table public.competencies enable row level security;
alter table public.competencies force row level security;

alter table public.cycle_events enable row level security;
alter table public.cycle_events force row level security;

alter table public.demo_requests enable row level security;

alter table public.execution_day_calendars enable row level security;

alter table public.kv_store_4af580ad enable row level security;

alter table public.lead_conversation_analyses enable row level security;

alter table public.lead_events enable row level security;

alter table public.lead_group_cycles enable row level security;
alter table public.lead_group_cycles force row level security;

alter table public.lead_groups enable row level security;
alter table public.lead_groups force row level security;

alter table public.lead_interactions enable row level security;

alter table public.lead_list_members enable row level security;

alter table public.lead_lists enable row level security;

alter table public.lead_profiles enable row level security;

alter table public.lead_stage_events enable row level security;

alter table public.lead_status_history enable row level security;

alter table public.lead_user_priority enable row level security;

alter table public.leads enable row level security;

alter table public.pipeline_stages enable row level security;

alter table public.pipelines enable row level security;

alter table public.products enable row level security;

alter table public.profile_details enable row level security;

alter table public.profiles enable row level security;

alter table public.quick_actions_config enable row level security;

alter table public.revenue_extra_sources enable row level security;

alter table public.revenue_goals enable row level security;

alter table public.revenue_overrides_daily enable row level security;

alter table public.sales_cycle_period_activity enable row level security;

alter table public.sales_cycles enable row level security;
alter table public.sales_cycles force row level security;

alter table public.sla_rules enable row level security;

-- -----------------------------------------------------------------------------
-- Policies
-- -----------------------------------------------------------------------------

create policy admin_events_delete_block_authenticated on public.admin_events as permissive for delete to authenticated using (false);

create policy admin_events_insert_block_authenticated on public.admin_events as permissive for insert to authenticated with check (false);

create policy admin_events_select_by_admin_or_manager on public.admin_events as permissive for select to authenticated using (has_company_membership_strict(company_id, ARRAY['admin'::text, 'manager'::text]));

create policy admin_events_update_block_authenticated on public.admin_events as permissive for update to authenticated using (false) with check (false);

create policy "Inserir auditoria dos próprios deals" on public.audit_sales_cycles as permissive for insert to public with check ((changed_by = auth.uid() OR changed_by IS NULL OR is_admin_or_manager()) AND (EXISTS ( SELECT 1
   FROM sales_cycles sc
  WHERE sc.id = audit_sales_cycles.sales_cycle_id)));

create policy "Vendedor vê auditoria de seus deals" on public.audit_sales_cycles as permissive for select to public using ((EXISTS ( SELECT 1
   FROM sales_cycles sc
  WHERE sc.id = audit_sales_cycles.sales_cycle_id AND (sc.owner_user_id = auth.uid() OR is_admin_or_manager()))));

create policy "companies: members can read own company" on public.companies as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE p.id = auth.uid() AND p.company_id = companies.id)));

create policy companies_update_admin_manager on public.companies as permissive for update to public using (id = current_company_id() AND ("current_role"() = ANY (ARRAY['admin'::text, 'manager'::text]))) with check (id = current_company_id() AND ("current_role"() = ANY (ARRAY['admin'::text, 'manager'::text])));

create policy company_admin_invitations_insert_platform_admin on public.company_admin_invitations as permissive for insert to public with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE p.id = auth.uid() AND p.is_active = true AND p.is_platform_admin = true)));

create policy company_admin_invitations_select_platform_admin on public.company_admin_invitations as permissive for select to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE p.id = auth.uid() AND p.is_active = true AND p.is_platform_admin = true)));

create policy company_admin_invitations_update_platform_admin on public.company_admin_invitations as permissive for update to public using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE p.id = auth.uid() AND p.is_active = true AND p.is_platform_admin = true))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE p.id = auth.uid() AND p.is_active = true AND p.is_platform_admin = true)));

create policy company_counters_insert on public.company_counters as permissive for insert to public with check (company_id = current_company_id());

create policy company_counters_select on public.company_counters as permissive for select to public using (company_id = current_company_id());

create policy company_counters_update on public.company_counters as permissive for update to public using (company_id = current_company_id());

create policy company_memberships_delete_platform_admin on public.company_memberships as permissive for delete to authenticated using (is_platform_admin_active());

create policy company_memberships_insert_platform_admin on public.company_memberships as permissive for insert to authenticated with check (is_platform_admin_active());

create policy company_memberships_select_explicit_access on public.company_memberships as permissive for select to authenticated using (can_select_company_membership_strict(company_id, user_id));

create policy company_memberships_update_platform_admin on public.company_memberships as permissive for update to authenticated using (is_platform_admin_active()) with check (is_platform_admin_active());

create policy "Only admins can manage SLA rules" on public.company_sla_rules as permissive for all to public using ((auth.jwt() ->> 'role'::text) = 'admin'::text AND company_id = (( SELECT profiles.company_id
   FROM profiles
  WHERE profiles.id = auth.uid()))) with check ((auth.jwt() ->> 'role'::text) = 'admin'::text AND company_id = (( SELECT profiles.company_id
   FROM profiles
  WHERE profiles.id = auth.uid())));

create policy "Users can read SLA rules of their company" on public.company_sla_rules as permissive for select to public using (company_id = (( SELECT profiles.company_id
   FROM profiles
  WHERE profiles.id = auth.uid())));

create policy competencies_delete_admin on public.competencies as permissive for delete to public using (company_id = current_company_id() AND is_admin());

create policy competencies_select_company on public.competencies as permissive for select to public using (company_id = current_company_id());

create policy cycle_events_insert_by_membership_or_cycle_owner on public.cycle_events as permissive for insert to authenticated with check (created_by = (( SELECT auth.uid() AS uid)) AND (has_company_membership_strict(company_id, ARRAY['admin'::text, 'manager'::text]) OR has_company_membership_strict(company_id, NULL::text[]) AND (EXISTS ( SELECT 1
   FROM sales_cycles sc
  WHERE sc.id = cycle_events.cycle_id AND sc.company_id = cycle_events.company_id AND sc.owner_user_id = (( SELECT auth.uid() AS uid))))));

create policy cycle_events_select_by_membership_or_cycle_owner on public.cycle_events as permissive for select to authenticated using (has_company_membership_strict(company_id, ARRAY['admin'::text, 'manager'::text]) OR has_company_membership_strict(company_id, NULL::text[]) AND (EXISTS ( SELECT 1
   FROM sales_cycles sc
  WHERE sc.id = cycle_events.cycle_id AND sc.company_id = cycle_events.company_id AND sc.owner_user_id = (( SELECT auth.uid() AS uid)))));

create policy cycle_events_update_by_admin_or_manager on public.cycle_events as permissive for update to authenticated using (has_company_membership_strict(company_id, ARRAY['admin'::text, 'manager'::text])) with check (has_company_membership_strict(company_id, ARRAY['admin'::text, 'manager'::text]));

create policy demo_requests_select_none on public.demo_requests as permissive for select to anon, authenticated using (false);

create policy execution_day_calendars_delete_company_members_admins on public.execution_day_calendars as permissive for delete to authenticated using ((EXISTS ( SELECT 1
   FROM company_memberships cm
     JOIN profiles p ON p.id = cm.user_id
  WHERE cm.company_id = execution_day_calendars.company_id AND cm.user_id = auth.uid() AND cm.role = 'admin'::text AND cm.is_active = true AND COALESCE(p.is_active_global, true) = true)));

create policy execution_day_calendars_insert_company_members_admins on public.execution_day_calendars as permissive for insert to authenticated with check ((EXISTS ( SELECT 1
   FROM company_memberships cm
     JOIN profiles p ON p.id = cm.user_id
  WHERE cm.company_id = execution_day_calendars.company_id AND cm.user_id = auth.uid() AND cm.role = 'admin'::text AND cm.is_active = true AND COALESCE(p.is_active_global, true) = true)));

create policy execution_day_calendars_select_company_members on public.execution_day_calendars as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM company_memberships cm
     JOIN profiles p ON p.id = cm.user_id
  WHERE cm.company_id = execution_day_calendars.company_id AND cm.user_id = auth.uid() AND cm.is_active = true AND COALESCE(p.is_active_global, true) = true)));

create policy execution_day_calendars_update_company_members_admins on public.execution_day_calendars as permissive for update to authenticated using ((EXISTS ( SELECT 1
   FROM company_memberships cm
     JOIN profiles p ON p.id = cm.user_id
  WHERE cm.company_id = execution_day_calendars.company_id AND cm.user_id = auth.uid() AND cm.role = 'admin'::text AND cm.is_active = true AND COALESCE(p.is_active_global, true) = true))) with check ((EXISTS ( SELECT 1
   FROM company_memberships cm
     JOIN profiles p ON p.id = cm.user_id
  WHERE cm.company_id = execution_day_calendars.company_id AND cm.user_id = auth.uid() AND cm.role = 'admin'::text AND cm.is_active = true AND COALESCE(p.is_active_global, true) = true)));

create policy kv_store_internal_no_client_access on public.kv_store_4af580ad as restrictive for all to anon, authenticated using (false) with check (false);

create policy lca_insert_admin_or_lead_owner on public.lead_conversation_analyses as permissive for insert to authenticated with check (user_id = auth.uid() AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE p.id = auth.uid() AND p.company_id = lead_conversation_analyses.company_id AND (p.role = 'admin'::text OR (EXISTS ( SELECT 1
           FROM leads l
          WHERE l.id = lead_conversation_analyses.lead_id AND l.company_id = lead_conversation_analyses.company_id AND l.owner_id = auth.uid()))))));

create policy lca_select_admin_or_lead_owner on public.lead_conversation_analyses as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE p.id = auth.uid() AND p.company_id = lead_conversation_analyses.company_id AND (p.role = 'admin'::text OR (EXISTS ( SELECT 1
           FROM leads l
          WHERE l.id = lead_conversation_analyses.lead_id AND l.company_id = lead_conversation_analyses.company_id AND l.owner_id = auth.uid()))))));

create policy lead_events_insert_same_company on public.lead_events as permissive for insert to public with check (company_id = (( SELECT profiles.company_id
   FROM profiles
  WHERE profiles.id = auth.uid())));

create policy lead_group_cycles_delete_by_admin_or_manager on public.lead_group_cycles as permissive for delete to authenticated using (has_company_membership_strict(company_id, ARRAY['admin'::text, 'manager'::text]));

create policy lead_group_cycles_insert_by_admin_or_manager on public.lead_group_cycles as permissive for insert to authenticated with check (has_company_membership_strict(company_id, ARRAY['admin'::text, 'manager'::text]));

create policy lead_group_cycles_select_by_membership on public.lead_group_cycles as permissive for select to authenticated using (has_company_membership_strict(company_id, NULL::text[]));

create policy lead_group_cycles_update_by_admin_or_manager on public.lead_group_cycles as permissive for update to authenticated using (has_company_membership_strict(company_id, ARRAY['admin'::text, 'manager'::text])) with check (has_company_membership_strict(company_id, ARRAY['admin'::text, 'manager'::text]));

create policy lead_groups_delete_by_admin_or_manager on public.lead_groups as permissive for delete to authenticated using (has_company_membership_strict(company_id, ARRAY['admin'::text, 'manager'::text]));

create policy lead_groups_insert_by_admin_or_manager on public.lead_groups as permissive for insert to authenticated with check (has_company_membership_strict(company_id, ARRAY['admin'::text, 'manager'::text]));

create policy lead_groups_select_by_membership on public.lead_groups as permissive for select to authenticated using (has_company_membership_strict(company_id, NULL::text[]));

create policy lead_groups_update_by_admin_or_manager on public.lead_groups as permissive for update to authenticated using (has_company_membership_strict(company_id, ARRAY['admin'::text, 'manager'::text])) with check (has_company_membership_strict(company_id, ARRAY['admin'::text, 'manager'::text]));

create policy interactions_company_isolation on public.lead_interactions as permissive for all to public using (company_id = (( SELECT profiles.company_id
   FROM profiles
  WHERE profiles.id = auth.uid())));

create policy "users insert own interactions" on public.lead_interactions as permissive for insert to public with check (auth.uid() = user_id);

create policy "users view own interactions" on public.lead_interactions as permissive for select to public using (auth.uid() = user_id);

create policy llm_delete_company on public.lead_list_members as permissive for delete to authenticated using (company_id = (( SELECT p.company_id
   FROM profiles p
  WHERE p.id = auth.uid())));

create policy llm_insert_company on public.lead_list_members as permissive for insert to authenticated with check (company_id = (( SELECT p.company_id
   FROM profiles p
  WHERE p.id = auth.uid())));

create policy llm_select_company on public.lead_list_members as permissive for select to authenticated using (company_id = (( SELECT p.company_id
   FROM profiles p
  WHERE p.id = auth.uid())));

create policy llm_update_company on public.lead_list_members as permissive for update to authenticated using (company_id = (( SELECT p.company_id
   FROM profiles p
  WHERE p.id = auth.uid()))) with check (company_id = (( SELECT p.company_id
   FROM profiles p
  WHERE p.id = auth.uid())));

create policy ll_delete_company on public.lead_lists as permissive for delete to authenticated using (company_id = (( SELECT p.company_id
   FROM profiles p
  WHERE p.id = auth.uid())));

create policy ll_insert_company on public.lead_lists as permissive for insert to authenticated with check (company_id = (( SELECT p.company_id
   FROM profiles p
  WHERE p.id = auth.uid())));

create policy ll_select_company on public.lead_lists as permissive for select to authenticated using (company_id = (( SELECT p.company_id
   FROM profiles p
  WHERE p.id = auth.uid())));

create policy ll_update_company on public.lead_lists as permissive for update to authenticated using (company_id = (( SELECT p.company_id
   FROM profiles p
  WHERE p.id = auth.uid()))) with check (company_id = (( SELECT p.company_id
   FROM profiles p
  WHERE p.id = auth.uid())));

create policy lead_profiles_insert_by_operational_access on public.lead_profiles as permissive for insert to authenticated with check (can_access_lead_profile_strict(company_id, lead_id));

create policy lead_profiles_select_by_operational_access on public.lead_profiles as permissive for select to authenticated using (can_access_lead_profile_strict(company_id, lead_id));

create policy lead_profiles_update_by_operational_access on public.lead_profiles as permissive for update to authenticated using (can_access_lead_profile_strict(company_id, lead_id)) with check (can_access_lead_profile_strict(company_id, lead_id));

create policy lead_stage_events_insert on public.lead_stage_events as permissive for insert to public with check (company_id = current_company_id());

create policy lead_stage_events_select on public.lead_stage_events as permissive for select to public using (company_id = current_company_id());

create policy stage_events_company_isolation on public.lead_stage_events as permissive for all to public using (company_id = (( SELECT profiles.company_id
   FROM profiles
  WHERE profiles.id = auth.uid())));

create policy lead_status_history_insert on public.lead_status_history as permissive for insert to public with check (company_id = current_company_id());

create policy lead_status_history_select on public.lead_status_history as permissive for select to public using (company_id = current_company_id());

create policy "delete own priorities" on public.lead_user_priority as permissive for delete to public using (user_id = auth.uid());

create policy "insert own priorities" on public.lead_user_priority as permissive for insert to public with check (user_id = auth.uid());

create policy "select own priorities" on public.lead_user_priority as permissive for select to public using (user_id = auth.uid());

create policy "update own priorities" on public.lead_user_priority as permissive for update to public using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy leads_delete_block_authenticated on public.leads as permissive for delete to authenticated using (false);

create policy leads_insert_block_authenticated on public.leads as permissive for insert to authenticated with check (false);

create policy leads_select_by_base_record_access on public.leads as permissive for select to authenticated using (can_select_lead_base_strict(company_id, id, owner_id, created_by, deleted_at));

create policy leads_update_by_base_record_access on public.leads as permissive for update to authenticated using (can_update_lead_base_strict(company_id, id, owner_id, created_by, deleted_at)) with check (can_update_lead_base_strict(company_id, id, owner_id, created_by, deleted_at));

create policy pipeline_stages_select_same_company on public.pipeline_stages as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM pipelines p
     JOIN profiles pr ON pr.company_id = p.company_id
  WHERE p.id = pipeline_stages.pipeline_id AND pr.id = auth.uid())));

create policy pipelines_select_same_company on public.pipelines as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM profiles pr
  WHERE pr.id = auth.uid() AND pr.company_id = pipelines.company_id)));

create policy products_delete on public.products as permissive for delete to authenticated using ((EXISTS ( SELECT 1
   FROM company_memberships cm
     JOIN profiles p ON p.id = cm.user_id
  WHERE cm.company_id = products.company_id AND cm.user_id = auth.uid() AND cm.role = 'admin'::text AND cm.is_active = true AND COALESCE(p.is_active_global, true) = true)));

create policy products_insert on public.products as permissive for insert to authenticated with check ((EXISTS ( SELECT 1
   FROM company_memberships cm
     JOIN profiles p ON p.id = cm.user_id
  WHERE cm.company_id = products.company_id AND cm.user_id = auth.uid() AND cm.role = 'admin'::text AND cm.is_active = true AND COALESCE(p.is_active_global, true) = true)));

create policy products_select on public.products as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM company_memberships cm
     JOIN profiles p ON p.id = cm.user_id
  WHERE cm.company_id = products.company_id AND cm.user_id = auth.uid() AND cm.is_active = true AND COALESCE(p.is_active_global, true) = true)));

create policy products_update on public.products as permissive for update to authenticated using ((EXISTS ( SELECT 1
   FROM company_memberships cm
     JOIN profiles p ON p.id = cm.user_id
  WHERE cm.company_id = products.company_id AND cm.user_id = auth.uid() AND cm.role = 'admin'::text AND cm.is_active = true AND COALESCE(p.is_active_global, true) = true))) with check ((EXISTS ( SELECT 1
   FROM company_memberships cm
     JOIN profiles p ON p.id = cm.user_id
  WHERE cm.company_id = products.company_id AND cm.user_id = auth.uid() AND cm.role = 'admin'::text AND cm.is_active = true AND COALESCE(p.is_active_global, true) = true)));

create policy profile_details_select on public.profile_details as permissive for select to public using (auth.uid() IS NOT NULL);

create policy profiles_delete_block_authenticated on public.profiles as permissive for delete to authenticated using (false);

create policy profiles_insert_block_authenticated on public.profiles as permissive for insert to authenticated with check (false);

create policy profiles_select_by_global_access on public.profiles as permissive for select to authenticated using (can_select_profile_strict(id));

create policy profiles_update_own on public.profiles as permissive for update to authenticated using (id = (( SELECT auth.uid() AS uid))) with check (id = (( SELECT auth.uid() AS uid)));

create policy quick_actions_config_insert on public.quick_actions_config as permissive for insert to public with check (company_id = current_company_id() AND is_admin());

create policy quick_actions_config_select on public.quick_actions_config as permissive for select to public using (company_id = current_company_id());

create policy quick_actions_config_update on public.quick_actions_config as permissive for update to public using (company_id = current_company_id() AND is_admin());

create policy revenue_extra_sources_delete_by_admin on public.revenue_extra_sources as permissive for delete to authenticated using (has_company_membership_strict(company_id, ARRAY['admin'::text]));

create policy revenue_extra_sources_insert_by_admin on public.revenue_extra_sources as permissive for insert to authenticated with check (has_company_membership_strict(company_id, ARRAY['admin'::text]) AND created_by = (( SELECT auth.uid() AS uid)));

create policy revenue_extra_sources_select_by_membership on public.revenue_extra_sources as permissive for select to authenticated using (has_company_membership_strict(company_id, NULL::text[]));

create policy revenue_extra_sources_update_by_admin on public.revenue_extra_sources as permissive for update to authenticated using (has_company_membership_strict(company_id, ARRAY['admin'::text])) with check (has_company_membership_strict(company_id, ARRAY['admin'::text]));

create policy revenue_goals_delete_by_admin on public.revenue_goals as permissive for delete to authenticated using (has_company_membership_strict(company_id, ARRAY['admin'::text]));

create policy revenue_goals_insert_by_admin on public.revenue_goals as permissive for insert to authenticated with check (has_company_membership_strict(company_id, ARRAY['admin'::text]) AND created_by = (( SELECT auth.uid() AS uid)));

create policy revenue_goals_select_by_membership on public.revenue_goals as permissive for select to authenticated using (has_company_membership_strict(company_id, NULL::text[]));

create policy revenue_goals_update_by_admin on public.revenue_goals as permissive for update to authenticated using (has_company_membership_strict(company_id, ARRAY['admin'::text])) with check (has_company_membership_strict(company_id, ARRAY['admin'::text]));

create policy revenue_overrides_daily_delete_by_admin on public.revenue_overrides_daily as permissive for delete to authenticated using (has_company_membership_strict(company_id, ARRAY['admin'::text]));

create policy revenue_overrides_daily_insert_by_admin on public.revenue_overrides_daily as permissive for insert to authenticated with check (has_company_membership_strict(company_id, ARRAY['admin'::text]) AND edited_by = (( SELECT auth.uid() AS uid)));

create policy revenue_overrides_daily_select_by_membership on public.revenue_overrides_daily as permissive for select to authenticated using (has_company_membership_strict(company_id, NULL::text[]));

create policy revenue_overrides_daily_update_by_admin on public.revenue_overrides_daily as permissive for update to authenticated using (has_company_membership_strict(company_id, ARRAY['admin'::text])) with check (has_company_membership_strict(company_id, ARRAY['admin'::text]) AND edited_by = (( SELECT auth.uid() AS uid)));

create policy sales_cycle_period_activity_insert_by_membership on public.sales_cycle_period_activity as permissive for insert to authenticated with check ((EXISTS ( SELECT 1
   FROM company_memberships cm
  WHERE cm.company_id = sales_cycle_period_activity.company_id AND cm.user_id = (( SELECT auth.uid() AS uid)) AND cm.is_active = true)));

create policy sales_cycle_period_activity_select_by_membership on public.sales_cycle_period_activity as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM company_memberships cm
  WHERE cm.company_id = sales_cycle_period_activity.company_id AND cm.user_id = (( SELECT auth.uid() AS uid)) AND cm.is_active = true)));

create policy sales_cycle_period_activity_update_by_membership on public.sales_cycle_period_activity as permissive for update to authenticated using ((EXISTS ( SELECT 1
   FROM company_memberships cm
  WHERE cm.company_id = sales_cycle_period_activity.company_id AND cm.user_id = (( SELECT auth.uid() AS uid)) AND cm.is_active = true))) with check ((EXISTS ( SELECT 1
   FROM company_memberships cm
  WHERE cm.company_id = sales_cycle_period_activity.company_id AND cm.user_id = (( SELECT auth.uid() AS uid)) AND cm.is_active = true)));

create policy sales_cycles_delete_block_authenticated on public.sales_cycles as permissive for delete to authenticated using (false);

create policy sales_cycles_insert_by_operational_access on public.sales_cycles as permissive for insert to authenticated with check (can_write_sales_cycle_strict(company_id, owner_user_id));

create policy sales_cycles_select_by_operational_access on public.sales_cycles as permissive for select to authenticated using (can_select_sales_cycle_strict(company_id, owner_user_id));

create policy sales_cycles_update_by_operational_access on public.sales_cycles as permissive for update to authenticated using (can_select_sales_cycle_strict(company_id, owner_user_id)) with check (can_write_sales_cycle_strict(company_id, owner_user_id));

create policy sla_rules_company_isolation on public.sla_rules as permissive for all to public using (company_id = current_company_id());

-- -----------------------------------------------------------------------------
-- Comentários
-- -----------------------------------------------------------------------------

comment on table public.company_admin_invitations is 'Convites enviados pelo administrador da plataforma para ativação do primeiro administrador da empresa cliente.';

comment on table public.company_memberships is 'Fonte oficial de vínculo entre usuário global e empresa cliente. Substitui o uso operacional de profiles.company_id, profiles.role e profiles.is_active.';

comment on table public.competencies is 'Define os períodos (meses) de competência para métricas e metas. Cada empresa tem 1 ativa.';

comment on table public.cycle_events is 'Eventos qualificados dentro de um ciclo. FK composta garante isolamento de tenant.';

comment on table public.lead_group_cycles is 'Histórico M:N entre grupos e ciclos. FKs compostas e unique ativo com company_id.';

comment on table public.lead_groups is 'Grupos nomeados de leads (campanhas, listas, etc). Admin cria e gerencia. Multi-tenant via company_id.';

comment on table public.sales_cycles is 'Ciclos comerciais (oportunidades). Um lead pode ter múltiplos ciclos ao longo do tempo (recompra). owner_user_id pode ser NULL (POOL).';

comment on column public.companies.onboarding_status is 'Status de implantação da empresa: company_created, admin_invite_pending, admin_invited, admin_active, onboarding_done.';

comment on column public.companies.onboarding_status_updated_at is 'Momento da última alteração do status de onboarding da empresa.';

comment on column public.companies.platform_status is 'Status global da empresa na plataforma: active, blocked, cancelled, archived.';

comment on column public.companies.platform_status_updated_at is 'Momento da última alteração do status global da empresa na plataforma.';

comment on column public.company_admin_invitations.accepted_user_id is 'Usuário criado no Auth quando o convite for aceito.';

comment on column public.company_admin_invitations.company_id is 'Empresa cliente vinculada ao convite.';

comment on column public.company_admin_invitations.created_by is 'Administrador da plataforma que criou o convite.';

comment on column public.company_admin_invitations.email is 'E-mail do responsável que receberá o convite para ativar a conta de primeiro admin da empresa.';

comment on column public.company_admin_invitations.expires_at is 'Data de expiração do convite.';

comment on column public.company_admin_invitations.status is 'Status do convite: pending, accepted, expired, cancelled.';

comment on column public.company_admin_invitations.token_hash is 'Hash do token do convite. O token puro não deve ser salvo no banco.';

comment on column public.leads.deal_value is 'Valor do negócio (R$). Deve ser preenchido quando o lead for marcado como ganho (won).';

comment on column public.leads.deleted_at is 'Marca soft delete operacional do lead. Leads com deleted_at preenchido não devem aparecer no pipeline.';

comment on column public.leads.deleted_by is 'Usuário admin responsável pelo soft delete operacional do lead.';

comment on column public.leads.phone_digits is 'Telefone contendo somente números, gerado automaticamente para buscas exatas e indexadas.';

comment on column public.profiles.is_active_global is 'Status global da identidade do usuário. Status por empresa deve ficar em company_memberships.is_active.';

comment on column public.sales_cycles.entry_amount is 'Valor de entrada quando payment_type = entrada_parcelas';

comment on column public.sales_cycles.installment_amount is 'Valor de cada parcela';

comment on column public.sales_cycles.installments_count is 'Quantidade de parcelas';

comment on column public.sales_cycles.invoice_id is 'Referência à fatura/fonte de receita associada ao deal ganho';

comment on column public.sales_cycles.payment_method is 'Meio de pagamento: credito, debito, pix, dinheiro, boleto, transferencia, misto, outro';

comment on column public.sales_cycles.payment_notes is 'Observação de pagamento — obrigatória quando payment_method = misto';

comment on column public.sales_cycles.payment_type is 'Estrutura de negociação: avista, entrada_parcelas, parcelado_sem_entrada, recorrente, outro';

comment on column public.sales_cycles.product_id is 'Produto principal vendido neste ciclo (referência ao catálogo)';

comment on column public.sales_cycles.revenue_seller_ref_date is 'Data da receita associada (YYYY-MM-DD). Usada para linkar com v_revenue_daily_seller';

comment on column public.sales_cycles.won_at is 'Timestamp when deal was won';

comment on column public.sales_cycles.won_items is 'Number of items in the won deal';

comment on column public.sales_cycles.won_note is 'Observação livre registrada pelo vendedor no momento do fechamento como ganho';

comment on column public.sales_cycles.won_owner_user_id is 'User ID who closed the deal (frozen when status = ganho)';

comment on column public.sales_cycles.won_total is 'Total value of the won deal';

comment on column public.sales_cycles.won_unit_price is 'Valor comercial do produto principal da venda';

comment on column public.sales_cycles.won_value_source is 'Origem do valor: manual, revenue ou invoice';

comment on function public.assign_leads(p_company_id uuid, p_source text, p_limit integer, p_lead_ids uuid[], p_status text, p_search text, p_mode text, p_to_owner_id uuid, p_seller_ids uuid[], p_only_if_pool boolean, p_order_mode text) is 'assign_leads v2';

comment on function public.current_company_id() is 'Compatibilidade legada: retorna company_id somente quando o usuário possui exatamente uma empresa ativa. Para multiempresa, prefira RPCs com p_company_id explícito.';

comment on function public.fn_auto_fill_closed_at() is 'Fase 1: Garante que closed_at, won_at, lost_at, lost_reason e won_owner_user_id são preenchidos automaticamente quando o status muda para terminal (ganho/perdido/cancelado). Funciona como rede de segurança para updates diretos (ex: markDealWonWithRevenue em sales-analytics.ts).';

comment on function public.fn_set_user_role(p_user_id uuid, p_role text) is 'Wrapper legado. Usa current_company_id() e falha quando o usuário possui múltiplas empresas ativas.';

comment on function public.fn_set_user_role_for_company(p_company_id uuid, p_user_id uuid, p_role text) is 'Altera role de um usuário dentro de uma empresa específica usando company_memberships como fonte oficial.';

comment on function public.get_user_company_memberships() is 'Lista empresas ativas que o usuário autenticado pode acessar. Base para tela de seleção de empresa pós-login.';

comment on function public.handle_sales_cycle_closed_at() is 'Automático: seta closed_at quando ciclo fecha (ganho/perdido) e reseta se reabre.';

comment on function public.has_active_company_membership(p_company_id uuid, p_roles text[]) is 'Verifica se o usuário autenticado possui vínculo ativo com uma empresa, opcionalmente limitado por roles. Platform admin ativo passa pela verificação.';

comment on function public.is_admin() is 'Compatibilidade legada: true para platform admin ativo ou admin ativo em pelo menos uma empresa. Para ações por empresa, usar is_company_admin(p_company_id).';

comment on function public.reassign_owner_leads(p_company_id uuid, p_from_owner_id uuid, p_to_owner_id uuid, p_limit integer, p_status text, p_search text, p_order_mode text) is 'reassign_owner_leads v2';

comment on function public.round_robin_from_owner_leads(p_company_id uuid, p_from_owner_id uuid, p_seller_ids uuid[], p_limit integer, p_status text, p_search text, p_order_mode text) is 'round_robin_from_owner_leads v2';

comment on function public.rpc_admin_list_sellers_stats(p_days integer) is 'Wrapper legado. Usa current_company_id() e falha quando o usuário possui múltiplas empresas ativas.';

comment on function public.rpc_admin_list_sellers_stats_for_company(p_company_id uuid, p_days integer) is 'Lista usuários comerciais e estatísticas por empresa usando company_memberships como fonte oficial.';

comment on function public.rpc_admin_update_seller_access(p_seller_id uuid, p_role text, p_is_active boolean) is 'Wrapper legado. Usa current_company_id() e falha quando o usuário possui múltiplas empresas ativas.';

comment on function public.rpc_admin_update_seller_access_for_company(p_company_id uuid, p_seller_id uuid, p_role text, p_is_active boolean) is 'Atualiza role/status de um usuário dentro de uma empresa específica usando company_memberships.';

comment on function public.rpc_register_cycle_won(p_cycle_id uuid, p_won_total numeric, p_won_items integer, p_won_note text) is 'Register won cycle details (total value, items count, notes). Requires ganho status.';

comment on function public.update_updated_at_column() is 'Trigger genérico para atualizar updated_at antes de UPDATE.';

-- -----------------------------------------------------------------------------
-- Revogação explícita de privilégios em relações
-- -----------------------------------------------------------------------------

revoke all on table public.admin_events from public, anon, authenticated, service_role;

revoke all on table public.ai_coaching_notes from public, anon, authenticated, service_role;

revoke all on table public.audit_sales_cycles from public, anon, authenticated, service_role;

revoke all on table public.companies from public, anon, authenticated, service_role;

revoke all on table public.company_admin_invitations from public, anon, authenticated, service_role;

revoke all on table public.company_counters from public, anon, authenticated, service_role;

revoke all on table public.company_lead_api_keys from public, anon, authenticated, service_role;

revoke all on table public.company_memberships from public, anon, authenticated, service_role;

revoke all on table public.company_site_lead_distribution from public, anon, authenticated, service_role;

revoke all on table public.company_sla_rules from public, anon, authenticated, service_role;

revoke all on table public.competencies from public, anon, authenticated, service_role;

revoke all on table public.cycle_events from public, anon, authenticated, service_role;

revoke all on table public.demo_requests from public, anon, authenticated, service_role;

revoke all on table public.execution_day_calendars from public, anon, authenticated, service_role;

revoke all on table public.kv_store_4af580ad from public, anon, authenticated, service_role;

revoke all on table public.lead_conversation_analyses from public, anon, authenticated, service_role;

revoke all on table public.lead_events from public, anon, authenticated, service_role;

revoke all on table public.lead_group_cycles from public, anon, authenticated, service_role;

revoke all on table public.lead_groups from public, anon, authenticated, service_role;

revoke all on table public.lead_interactions from public, anon, authenticated, service_role;

revoke all on table public.lead_list_members from public, anon, authenticated, service_role;

revoke all on table public.lead_lists from public, anon, authenticated, service_role;

revoke all on table public.lead_profiles from public, anon, authenticated, service_role;

revoke all on table public.lead_stage_events from public, anon, authenticated, service_role;

revoke all on table public.lead_status_history from public, anon, authenticated, service_role;

revoke all on table public.lead_user_priority from public, anon, authenticated, service_role;

revoke all on table public.leads from public, anon, authenticated, service_role;

revoke all on table public.pipeline_stages from public, anon, authenticated, service_role;

revoke all on table public.pipelines from public, anon, authenticated, service_role;

revoke all on table public.products from public, anon, authenticated, service_role;

revoke all on table public.profile_details from public, anon, authenticated, service_role;

revoke all on table public.profiles from public, anon, authenticated, service_role;

revoke all on table public.quick_actions_config from public, anon, authenticated, service_role;

revoke all on table public.revenue_extra_sources from public, anon, authenticated, service_role;

revoke all on table public.revenue_goals from public, anon, authenticated, service_role;

revoke all on table public.revenue_overrides_daily from public, anon, authenticated, service_role;

revoke all on table public.sales_cycle_period_activity from public, anon, authenticated, service_role;

revoke all on table public.sales_cycles from public, anon, authenticated, service_role;

revoke all on table public.sla_rules from public, anon, authenticated, service_role;

revoke all on table public.v_pipeline_items from public, anon, authenticated, service_role;

revoke all on table public.v_kanban_items from public, anon, authenticated, service_role;

revoke all on table public.v_pool_items_with_returns from public, anon, authenticated, service_role;

revoke all on table public.v_revenue_daily_extra from public, anon, authenticated, service_role;

revoke all on table public.v_revenue_daily_seller from public, anon, authenticated, service_role;

revoke all on table public.vw_audit_sales_cycles_history from public, anon, authenticated, service_role;

revoke all on table public.vw_lead_status_age from public, anon, authenticated, service_role;

revoke all on table public.vw_revenue_by_seller_day from public, anon, authenticated, service_role;

revoke all on table public.vw_revenue_by_seller_total from public, anon, authenticated, service_role;

revoke all on table public.vw_sales_cycles_complete from public, anon, authenticated, service_role;

revoke all on table public.vw_sales_cycles_with_revenue from public, anon, authenticated, service_role;

revoke all on table public.vw_sales_funnel from public, anon, authenticated, service_role;

revoke all on table public.vw_sales_lost_analysis from public, anon, authenticated, service_role;

revoke all on table public.vw_sales_monthly_analysis from public, anon, authenticated, service_role;

revoke all on table public.vw_sales_performance_by_owner from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Privilégios em relações
-- -----------------------------------------------------------------------------

grant MAINTAIN on table public.admin_events to authenticated;

grant SELECT on table public.admin_events to authenticated;

grant DELETE on table public.admin_events to service_role;

grant INSERT on table public.admin_events to service_role;

grant MAINTAIN on table public.admin_events to service_role;

grant REFERENCES on table public.admin_events to service_role;

grant SELECT on table public.admin_events to service_role;

grant TRIGGER on table public.admin_events to service_role;

grant TRUNCATE on table public.admin_events to service_role;

grant UPDATE on table public.admin_events to service_role;

grant DELETE on table public.ai_coaching_notes to service_role;

grant INSERT on table public.ai_coaching_notes to service_role;

grant MAINTAIN on table public.ai_coaching_notes to service_role;

grant REFERENCES on table public.ai_coaching_notes to service_role;

grant SELECT on table public.ai_coaching_notes to service_role;

grant TRIGGER on table public.ai_coaching_notes to service_role;

grant TRUNCATE on table public.ai_coaching_notes to service_role;

grant UPDATE on table public.ai_coaching_notes to service_role;

grant DELETE on table public.audit_sales_cycles to authenticated;

grant INSERT on table public.audit_sales_cycles to authenticated;

grant MAINTAIN on table public.audit_sales_cycles to authenticated;

grant REFERENCES on table public.audit_sales_cycles to authenticated;

grant SELECT on table public.audit_sales_cycles to authenticated;

grant TRIGGER on table public.audit_sales_cycles to authenticated;

grant TRUNCATE on table public.audit_sales_cycles to authenticated;

grant UPDATE on table public.audit_sales_cycles to authenticated;

grant DELETE on table public.audit_sales_cycles to service_role;

grant INSERT on table public.audit_sales_cycles to service_role;

grant MAINTAIN on table public.audit_sales_cycles to service_role;

grant REFERENCES on table public.audit_sales_cycles to service_role;

grant SELECT on table public.audit_sales_cycles to service_role;

grant TRIGGER on table public.audit_sales_cycles to service_role;

grant TRUNCATE on table public.audit_sales_cycles to service_role;

grant UPDATE on table public.audit_sales_cycles to service_role;

grant DELETE on table public.companies to authenticated;

grant INSERT on table public.companies to authenticated;

grant MAINTAIN on table public.companies to authenticated;

grant REFERENCES on table public.companies to authenticated;

grant SELECT on table public.companies to authenticated;

grant TRIGGER on table public.companies to authenticated;

grant TRUNCATE on table public.companies to authenticated;

grant UPDATE on table public.companies to authenticated;

grant DELETE on table public.companies to service_role;

grant INSERT on table public.companies to service_role;

grant MAINTAIN on table public.companies to service_role;

grant REFERENCES on table public.companies to service_role;

grant SELECT on table public.companies to service_role;

grant TRIGGER on table public.companies to service_role;

grant TRUNCATE on table public.companies to service_role;

grant UPDATE on table public.companies to service_role;

grant DELETE on table public.company_admin_invitations to authenticated;

grant INSERT on table public.company_admin_invitations to authenticated;

grant MAINTAIN on table public.company_admin_invitations to authenticated;

grant REFERENCES on table public.company_admin_invitations to authenticated;

grant SELECT on table public.company_admin_invitations to authenticated;

grant TRIGGER on table public.company_admin_invitations to authenticated;

grant TRUNCATE on table public.company_admin_invitations to authenticated;

grant UPDATE on table public.company_admin_invitations to authenticated;

grant DELETE on table public.company_admin_invitations to service_role;

grant INSERT on table public.company_admin_invitations to service_role;

grant MAINTAIN on table public.company_admin_invitations to service_role;

grant REFERENCES on table public.company_admin_invitations to service_role;

grant SELECT on table public.company_admin_invitations to service_role;

grant TRIGGER on table public.company_admin_invitations to service_role;

grant TRUNCATE on table public.company_admin_invitations to service_role;

grant UPDATE on table public.company_admin_invitations to service_role;

grant DELETE on table public.company_counters to authenticated;

grant INSERT on table public.company_counters to authenticated;

grant MAINTAIN on table public.company_counters to authenticated;

grant REFERENCES on table public.company_counters to authenticated;

grant SELECT on table public.company_counters to authenticated;

grant TRIGGER on table public.company_counters to authenticated;

grant TRUNCATE on table public.company_counters to authenticated;

grant UPDATE on table public.company_counters to authenticated;

grant DELETE on table public.company_counters to service_role;

grant INSERT on table public.company_counters to service_role;

grant MAINTAIN on table public.company_counters to service_role;

grant REFERENCES on table public.company_counters to service_role;

grant SELECT on table public.company_counters to service_role;

grant TRIGGER on table public.company_counters to service_role;

grant TRUNCATE on table public.company_counters to service_role;

grant UPDATE on table public.company_counters to service_role;

grant DELETE on table public.company_lead_api_keys to service_role;

grant INSERT on table public.company_lead_api_keys to service_role;

grant MAINTAIN on table public.company_lead_api_keys to service_role;

grant REFERENCES on table public.company_lead_api_keys to service_role;

grant SELECT on table public.company_lead_api_keys to service_role;

grant TRIGGER on table public.company_lead_api_keys to service_role;

grant TRUNCATE on table public.company_lead_api_keys to service_role;

grant UPDATE on table public.company_lead_api_keys to service_role;

grant DELETE on table public.company_memberships to authenticated;

grant INSERT on table public.company_memberships to authenticated;

grant MAINTAIN on table public.company_memberships to authenticated;

grant SELECT on table public.company_memberships to authenticated;

grant UPDATE on table public.company_memberships to authenticated;

grant DELETE on table public.company_memberships to service_role;

grant INSERT on table public.company_memberships to service_role;

grant MAINTAIN on table public.company_memberships to service_role;

grant REFERENCES on table public.company_memberships to service_role;

grant SELECT on table public.company_memberships to service_role;

grant TRIGGER on table public.company_memberships to service_role;

grant TRUNCATE on table public.company_memberships to service_role;

grant UPDATE on table public.company_memberships to service_role;

grant DELETE on table public.company_site_lead_distribution to service_role;

grant INSERT on table public.company_site_lead_distribution to service_role;

grant MAINTAIN on table public.company_site_lead_distribution to service_role;

grant REFERENCES on table public.company_site_lead_distribution to service_role;

grant SELECT on table public.company_site_lead_distribution to service_role;

grant TRIGGER on table public.company_site_lead_distribution to service_role;

grant TRUNCATE on table public.company_site_lead_distribution to service_role;

grant UPDATE on table public.company_site_lead_distribution to service_role;

grant DELETE on table public.company_sla_rules to authenticated;

grant INSERT on table public.company_sla_rules to authenticated;

grant MAINTAIN on table public.company_sla_rules to authenticated;

grant REFERENCES on table public.company_sla_rules to authenticated;

grant SELECT on table public.company_sla_rules to authenticated;

grant TRIGGER on table public.company_sla_rules to authenticated;

grant TRUNCATE on table public.company_sla_rules to authenticated;

grant UPDATE on table public.company_sla_rules to authenticated;

grant DELETE on table public.company_sla_rules to service_role;

grant INSERT on table public.company_sla_rules to service_role;

grant MAINTAIN on table public.company_sla_rules to service_role;

grant REFERENCES on table public.company_sla_rules to service_role;

grant SELECT on table public.company_sla_rules to service_role;

grant TRIGGER on table public.company_sla_rules to service_role;

grant TRUNCATE on table public.company_sla_rules to service_role;

grant UPDATE on table public.company_sla_rules to service_role;

grant MAINTAIN on table public.competencies to authenticated;

grant REFERENCES on table public.competencies to authenticated;

grant SELECT on table public.competencies to authenticated;

grant TRIGGER on table public.competencies to authenticated;

grant TRUNCATE on table public.competencies to authenticated;

grant DELETE on table public.competencies to service_role;

grant INSERT on table public.competencies to service_role;

grant MAINTAIN on table public.competencies to service_role;

grant REFERENCES on table public.competencies to service_role;

grant SELECT on table public.competencies to service_role;

grant TRIGGER on table public.competencies to service_role;

grant TRUNCATE on table public.competencies to service_role;

grant UPDATE on table public.competencies to service_role;

grant INSERT on table public.cycle_events to authenticated;

grant MAINTAIN on table public.cycle_events to authenticated;

grant SELECT on table public.cycle_events to authenticated;

grant UPDATE on table public.cycle_events to authenticated;

grant DELETE on table public.cycle_events to service_role;

grant INSERT on table public.cycle_events to service_role;

grant MAINTAIN on table public.cycle_events to service_role;

grant REFERENCES on table public.cycle_events to service_role;

grant SELECT on table public.cycle_events to service_role;

grant TRIGGER on table public.cycle_events to service_role;

grant TRUNCATE on table public.cycle_events to service_role;

grant UPDATE on table public.cycle_events to service_role;

grant DELETE on table public.demo_requests to authenticated;

grant INSERT on table public.demo_requests to authenticated;

grant MAINTAIN on table public.demo_requests to authenticated;

grant REFERENCES on table public.demo_requests to authenticated;

grant SELECT on table public.demo_requests to authenticated;

grant TRIGGER on table public.demo_requests to authenticated;

grant TRUNCATE on table public.demo_requests to authenticated;

grant UPDATE on table public.demo_requests to authenticated;

grant DELETE on table public.demo_requests to service_role;

grant INSERT on table public.demo_requests to service_role;

grant MAINTAIN on table public.demo_requests to service_role;

grant REFERENCES on table public.demo_requests to service_role;

grant SELECT on table public.demo_requests to service_role;

grant TRIGGER on table public.demo_requests to service_role;

grant TRUNCATE on table public.demo_requests to service_role;

grant UPDATE on table public.demo_requests to service_role;

grant DELETE on table public.execution_day_calendars to authenticated;

grant INSERT on table public.execution_day_calendars to authenticated;

grant MAINTAIN on table public.execution_day_calendars to authenticated;

grant REFERENCES on table public.execution_day_calendars to authenticated;

grant SELECT on table public.execution_day_calendars to authenticated;

grant TRIGGER on table public.execution_day_calendars to authenticated;

grant TRUNCATE on table public.execution_day_calendars to authenticated;

grant UPDATE on table public.execution_day_calendars to authenticated;

grant DELETE on table public.execution_day_calendars to service_role;

grant INSERT on table public.execution_day_calendars to service_role;

grant MAINTAIN on table public.execution_day_calendars to service_role;

grant REFERENCES on table public.execution_day_calendars to service_role;

grant SELECT on table public.execution_day_calendars to service_role;

grant TRIGGER on table public.execution_day_calendars to service_role;

grant TRUNCATE on table public.execution_day_calendars to service_role;

grant UPDATE on table public.execution_day_calendars to service_role;

grant DELETE on table public.kv_store_4af580ad to authenticated;

grant INSERT on table public.kv_store_4af580ad to authenticated;

grant MAINTAIN on table public.kv_store_4af580ad to authenticated;

grant REFERENCES on table public.kv_store_4af580ad to authenticated;

grant SELECT on table public.kv_store_4af580ad to authenticated;

grant TRIGGER on table public.kv_store_4af580ad to authenticated;

grant TRUNCATE on table public.kv_store_4af580ad to authenticated;

grant UPDATE on table public.kv_store_4af580ad to authenticated;

grant DELETE on table public.kv_store_4af580ad to service_role;

grant INSERT on table public.kv_store_4af580ad to service_role;

grant MAINTAIN on table public.kv_store_4af580ad to service_role;

grant REFERENCES on table public.kv_store_4af580ad to service_role;

grant SELECT on table public.kv_store_4af580ad to service_role;

grant TRIGGER on table public.kv_store_4af580ad to service_role;

grant TRUNCATE on table public.kv_store_4af580ad to service_role;

grant UPDATE on table public.kv_store_4af580ad to service_role;

grant INSERT on table public.lead_conversation_analyses to authenticated;

grant MAINTAIN on table public.lead_conversation_analyses to authenticated;

grant REFERENCES on table public.lead_conversation_analyses to authenticated;

grant SELECT on table public.lead_conversation_analyses to authenticated;

grant TRIGGER on table public.lead_conversation_analyses to authenticated;

grant TRUNCATE on table public.lead_conversation_analyses to authenticated;

grant DELETE on table public.lead_conversation_analyses to service_role;

grant INSERT on table public.lead_conversation_analyses to service_role;

grant MAINTAIN on table public.lead_conversation_analyses to service_role;

grant REFERENCES on table public.lead_conversation_analyses to service_role;

grant SELECT on table public.lead_conversation_analyses to service_role;

grant TRIGGER on table public.lead_conversation_analyses to service_role;

grant TRUNCATE on table public.lead_conversation_analyses to service_role;

grant UPDATE on table public.lead_conversation_analyses to service_role;

grant DELETE on table public.lead_events to authenticated;

grant INSERT on table public.lead_events to authenticated;

grant MAINTAIN on table public.lead_events to authenticated;

grant REFERENCES on table public.lead_events to authenticated;

grant SELECT on table public.lead_events to authenticated;

grant TRIGGER on table public.lead_events to authenticated;

grant TRUNCATE on table public.lead_events to authenticated;

grant UPDATE on table public.lead_events to authenticated;

grant DELETE on table public.lead_events to service_role;

grant INSERT on table public.lead_events to service_role;

grant MAINTAIN on table public.lead_events to service_role;

grant REFERENCES on table public.lead_events to service_role;

grant SELECT on table public.lead_events to service_role;

grant TRIGGER on table public.lead_events to service_role;

grant TRUNCATE on table public.lead_events to service_role;

grant UPDATE on table public.lead_events to service_role;

grant DELETE on table public.lead_group_cycles to authenticated;

grant INSERT on table public.lead_group_cycles to authenticated;

grant MAINTAIN on table public.lead_group_cycles to authenticated;

grant SELECT on table public.lead_group_cycles to authenticated;

grant UPDATE on table public.lead_group_cycles to authenticated;

grant DELETE on table public.lead_group_cycles to service_role;

grant INSERT on table public.lead_group_cycles to service_role;

grant MAINTAIN on table public.lead_group_cycles to service_role;

grant REFERENCES on table public.lead_group_cycles to service_role;

grant SELECT on table public.lead_group_cycles to service_role;

grant TRIGGER on table public.lead_group_cycles to service_role;

grant TRUNCATE on table public.lead_group_cycles to service_role;

grant UPDATE on table public.lead_group_cycles to service_role;

grant DELETE on table public.lead_groups to authenticated;

grant INSERT on table public.lead_groups to authenticated;

grant MAINTAIN on table public.lead_groups to authenticated;

grant SELECT on table public.lead_groups to authenticated;

grant UPDATE on table public.lead_groups to authenticated;

grant DELETE on table public.lead_groups to service_role;

grant INSERT on table public.lead_groups to service_role;

grant MAINTAIN on table public.lead_groups to service_role;

grant REFERENCES on table public.lead_groups to service_role;

grant SELECT on table public.lead_groups to service_role;

grant TRIGGER on table public.lead_groups to service_role;

grant TRUNCATE on table public.lead_groups to service_role;

grant UPDATE on table public.lead_groups to service_role;

grant DELETE on table public.lead_interactions to authenticated;

grant INSERT on table public.lead_interactions to authenticated;

grant MAINTAIN on table public.lead_interactions to authenticated;

grant REFERENCES on table public.lead_interactions to authenticated;

grant SELECT on table public.lead_interactions to authenticated;

grant TRIGGER on table public.lead_interactions to authenticated;

grant TRUNCATE on table public.lead_interactions to authenticated;

grant UPDATE on table public.lead_interactions to authenticated;

grant DELETE on table public.lead_interactions to service_role;

grant INSERT on table public.lead_interactions to service_role;

grant MAINTAIN on table public.lead_interactions to service_role;

grant REFERENCES on table public.lead_interactions to service_role;

grant SELECT on table public.lead_interactions to service_role;

grant TRIGGER on table public.lead_interactions to service_role;

grant TRUNCATE on table public.lead_interactions to service_role;

grant UPDATE on table public.lead_interactions to service_role;

grant DELETE on table public.lead_list_members to authenticated;

grant INSERT on table public.lead_list_members to authenticated;

grant MAINTAIN on table public.lead_list_members to authenticated;

grant REFERENCES on table public.lead_list_members to authenticated;

grant SELECT on table public.lead_list_members to authenticated;

grant TRIGGER on table public.lead_list_members to authenticated;

grant TRUNCATE on table public.lead_list_members to authenticated;

grant UPDATE on table public.lead_list_members to authenticated;

grant DELETE on table public.lead_list_members to service_role;

grant INSERT on table public.lead_list_members to service_role;

grant MAINTAIN on table public.lead_list_members to service_role;

grant REFERENCES on table public.lead_list_members to service_role;

grant SELECT on table public.lead_list_members to service_role;

grant TRIGGER on table public.lead_list_members to service_role;

grant TRUNCATE on table public.lead_list_members to service_role;

grant UPDATE on table public.lead_list_members to service_role;

grant DELETE on table public.lead_lists to authenticated;

grant INSERT on table public.lead_lists to authenticated;

grant MAINTAIN on table public.lead_lists to authenticated;

grant REFERENCES on table public.lead_lists to authenticated;

grant SELECT on table public.lead_lists to authenticated;

grant TRIGGER on table public.lead_lists to authenticated;

grant TRUNCATE on table public.lead_lists to authenticated;

grant UPDATE on table public.lead_lists to authenticated;

grant DELETE on table public.lead_lists to service_role;

grant INSERT on table public.lead_lists to service_role;

grant MAINTAIN on table public.lead_lists to service_role;

grant REFERENCES on table public.lead_lists to service_role;

grant SELECT on table public.lead_lists to service_role;

grant TRIGGER on table public.lead_lists to service_role;

grant TRUNCATE on table public.lead_lists to service_role;

grant UPDATE on table public.lead_lists to service_role;

grant INSERT on table public.lead_profiles to authenticated;

grant MAINTAIN on table public.lead_profiles to authenticated;

grant SELECT on table public.lead_profiles to authenticated;

grant UPDATE on table public.lead_profiles to authenticated;

grant DELETE on table public.lead_profiles to service_role;

grant INSERT on table public.lead_profiles to service_role;

grant MAINTAIN on table public.lead_profiles to service_role;

grant REFERENCES on table public.lead_profiles to service_role;

grant SELECT on table public.lead_profiles to service_role;

grant TRIGGER on table public.lead_profiles to service_role;

grant TRUNCATE on table public.lead_profiles to service_role;

grant UPDATE on table public.lead_profiles to service_role;

grant DELETE on table public.lead_stage_events to authenticated;

grant INSERT on table public.lead_stage_events to authenticated;

grant MAINTAIN on table public.lead_stage_events to authenticated;

grant REFERENCES on table public.lead_stage_events to authenticated;

grant SELECT on table public.lead_stage_events to authenticated;

grant TRIGGER on table public.lead_stage_events to authenticated;

grant TRUNCATE on table public.lead_stage_events to authenticated;

grant UPDATE on table public.lead_stage_events to authenticated;

grant DELETE on table public.lead_stage_events to service_role;

grant INSERT on table public.lead_stage_events to service_role;

grant MAINTAIN on table public.lead_stage_events to service_role;

grant REFERENCES on table public.lead_stage_events to service_role;

grant SELECT on table public.lead_stage_events to service_role;

grant TRIGGER on table public.lead_stage_events to service_role;

grant TRUNCATE on table public.lead_stage_events to service_role;

grant UPDATE on table public.lead_stage_events to service_role;

grant DELETE on table public.lead_status_history to authenticated;

grant INSERT on table public.lead_status_history to authenticated;

grant MAINTAIN on table public.lead_status_history to authenticated;

grant REFERENCES on table public.lead_status_history to authenticated;

grant SELECT on table public.lead_status_history to authenticated;

grant TRIGGER on table public.lead_status_history to authenticated;

grant TRUNCATE on table public.lead_status_history to authenticated;

grant UPDATE on table public.lead_status_history to authenticated;

grant DELETE on table public.lead_status_history to service_role;

grant INSERT on table public.lead_status_history to service_role;

grant MAINTAIN on table public.lead_status_history to service_role;

grant REFERENCES on table public.lead_status_history to service_role;

grant SELECT on table public.lead_status_history to service_role;

grant TRIGGER on table public.lead_status_history to service_role;

grant TRUNCATE on table public.lead_status_history to service_role;

grant UPDATE on table public.lead_status_history to service_role;

grant DELETE on table public.lead_user_priority to authenticated;

grant INSERT on table public.lead_user_priority to authenticated;

grant MAINTAIN on table public.lead_user_priority to authenticated;

grant REFERENCES on table public.lead_user_priority to authenticated;

grant SELECT on table public.lead_user_priority to authenticated;

grant TRIGGER on table public.lead_user_priority to authenticated;

grant TRUNCATE on table public.lead_user_priority to authenticated;

grant UPDATE on table public.lead_user_priority to authenticated;

grant DELETE on table public.lead_user_priority to service_role;

grant INSERT on table public.lead_user_priority to service_role;

grant MAINTAIN on table public.lead_user_priority to service_role;

grant REFERENCES on table public.lead_user_priority to service_role;

grant SELECT on table public.lead_user_priority to service_role;

grant TRIGGER on table public.lead_user_priority to service_role;

grant TRUNCATE on table public.lead_user_priority to service_role;

grant UPDATE on table public.lead_user_priority to service_role;

grant MAINTAIN on table public.leads to authenticated;

grant SELECT on table public.leads to authenticated;

grant UPDATE on table public.leads to authenticated;

grant DELETE on table public.leads to service_role;

grant INSERT on table public.leads to service_role;

grant MAINTAIN on table public.leads to service_role;

grant REFERENCES on table public.leads to service_role;

grant SELECT on table public.leads to service_role;

grant TRIGGER on table public.leads to service_role;

grant TRUNCATE on table public.leads to service_role;

grant UPDATE on table public.leads to service_role;

grant DELETE on table public.pipeline_stages to authenticated;

grant INSERT on table public.pipeline_stages to authenticated;

grant MAINTAIN on table public.pipeline_stages to authenticated;

grant REFERENCES on table public.pipeline_stages to authenticated;

grant SELECT on table public.pipeline_stages to authenticated;

grant TRIGGER on table public.pipeline_stages to authenticated;

grant TRUNCATE on table public.pipeline_stages to authenticated;

grant UPDATE on table public.pipeline_stages to authenticated;

grant DELETE on table public.pipeline_stages to service_role;

grant INSERT on table public.pipeline_stages to service_role;

grant MAINTAIN on table public.pipeline_stages to service_role;

grant REFERENCES on table public.pipeline_stages to service_role;

grant SELECT on table public.pipeline_stages to service_role;

grant TRIGGER on table public.pipeline_stages to service_role;

grant TRUNCATE on table public.pipeline_stages to service_role;

grant UPDATE on table public.pipeline_stages to service_role;

grant DELETE on table public.pipelines to authenticated;

grant INSERT on table public.pipelines to authenticated;

grant MAINTAIN on table public.pipelines to authenticated;

grant REFERENCES on table public.pipelines to authenticated;

grant SELECT on table public.pipelines to authenticated;

grant TRIGGER on table public.pipelines to authenticated;

grant TRUNCATE on table public.pipelines to authenticated;

grant UPDATE on table public.pipelines to authenticated;

grant DELETE on table public.pipelines to service_role;

grant INSERT on table public.pipelines to service_role;

grant MAINTAIN on table public.pipelines to service_role;

grant REFERENCES on table public.pipelines to service_role;

grant SELECT on table public.pipelines to service_role;

grant TRIGGER on table public.pipelines to service_role;

grant TRUNCATE on table public.pipelines to service_role;

grant UPDATE on table public.pipelines to service_role;

grant DELETE on table public.products to authenticated;

grant INSERT on table public.products to authenticated;

grant MAINTAIN on table public.products to authenticated;

grant REFERENCES on table public.products to authenticated;

grant SELECT on table public.products to authenticated;

grant TRIGGER on table public.products to authenticated;

grant TRUNCATE on table public.products to authenticated;

grant UPDATE on table public.products to authenticated;

grant DELETE on table public.products to service_role;

grant INSERT on table public.products to service_role;

grant MAINTAIN on table public.products to service_role;

grant REFERENCES on table public.products to service_role;

grant SELECT on table public.products to service_role;

grant TRIGGER on table public.products to service_role;

grant TRUNCATE on table public.products to service_role;

grant UPDATE on table public.products to service_role;

grant DELETE on table public.profile_details to authenticated;

grant INSERT on table public.profile_details to authenticated;

grant MAINTAIN on table public.profile_details to authenticated;

grant REFERENCES on table public.profile_details to authenticated;

grant SELECT on table public.profile_details to authenticated;

grant TRIGGER on table public.profile_details to authenticated;

grant TRUNCATE on table public.profile_details to authenticated;

grant UPDATE on table public.profile_details to authenticated;

grant DELETE on table public.profile_details to service_role;

grant INSERT on table public.profile_details to service_role;

grant MAINTAIN on table public.profile_details to service_role;

grant REFERENCES on table public.profile_details to service_role;

grant SELECT on table public.profile_details to service_role;

grant TRIGGER on table public.profile_details to service_role;

grant TRUNCATE on table public.profile_details to service_role;

grant UPDATE on table public.profile_details to service_role;

grant MAINTAIN on table public.profiles to authenticated;

grant SELECT on table public.profiles to authenticated;

grant UPDATE on table public.profiles to authenticated;

grant DELETE on table public.profiles to service_role;

grant INSERT on table public.profiles to service_role;

grant MAINTAIN on table public.profiles to service_role;

grant REFERENCES on table public.profiles to service_role;

grant SELECT on table public.profiles to service_role;

grant TRIGGER on table public.profiles to service_role;

grant TRUNCATE on table public.profiles to service_role;

grant UPDATE on table public.profiles to service_role;

grant DELETE on table public.quick_actions_config to authenticated;

grant INSERT on table public.quick_actions_config to authenticated;

grant MAINTAIN on table public.quick_actions_config to authenticated;

grant REFERENCES on table public.quick_actions_config to authenticated;

grant SELECT on table public.quick_actions_config to authenticated;

grant TRIGGER on table public.quick_actions_config to authenticated;

grant TRUNCATE on table public.quick_actions_config to authenticated;

grant UPDATE on table public.quick_actions_config to authenticated;

grant DELETE on table public.quick_actions_config to service_role;

grant INSERT on table public.quick_actions_config to service_role;

grant MAINTAIN on table public.quick_actions_config to service_role;

grant REFERENCES on table public.quick_actions_config to service_role;

grant SELECT on table public.quick_actions_config to service_role;

grant TRIGGER on table public.quick_actions_config to service_role;

grant TRUNCATE on table public.quick_actions_config to service_role;

grant UPDATE on table public.quick_actions_config to service_role;

grant DELETE on table public.revenue_extra_sources to authenticated;

grant INSERT on table public.revenue_extra_sources to authenticated;

grant MAINTAIN on table public.revenue_extra_sources to authenticated;

grant SELECT on table public.revenue_extra_sources to authenticated;

grant UPDATE on table public.revenue_extra_sources to authenticated;

grant DELETE on table public.revenue_extra_sources to service_role;

grant INSERT on table public.revenue_extra_sources to service_role;

grant MAINTAIN on table public.revenue_extra_sources to service_role;

grant REFERENCES on table public.revenue_extra_sources to service_role;

grant SELECT on table public.revenue_extra_sources to service_role;

grant TRIGGER on table public.revenue_extra_sources to service_role;

grant TRUNCATE on table public.revenue_extra_sources to service_role;

grant UPDATE on table public.revenue_extra_sources to service_role;

grant DELETE on table public.revenue_goals to authenticated;

grant INSERT on table public.revenue_goals to authenticated;

grant MAINTAIN on table public.revenue_goals to authenticated;

grant SELECT on table public.revenue_goals to authenticated;

grant UPDATE on table public.revenue_goals to authenticated;

grant DELETE on table public.revenue_goals to service_role;

grant INSERT on table public.revenue_goals to service_role;

grant MAINTAIN on table public.revenue_goals to service_role;

grant REFERENCES on table public.revenue_goals to service_role;

grant SELECT on table public.revenue_goals to service_role;

grant TRIGGER on table public.revenue_goals to service_role;

grant TRUNCATE on table public.revenue_goals to service_role;

grant UPDATE on table public.revenue_goals to service_role;

grant DELETE on table public.revenue_overrides_daily to authenticated;

grant INSERT on table public.revenue_overrides_daily to authenticated;

grant MAINTAIN on table public.revenue_overrides_daily to authenticated;

grant SELECT on table public.revenue_overrides_daily to authenticated;

grant UPDATE on table public.revenue_overrides_daily to authenticated;

grant DELETE on table public.revenue_overrides_daily to service_role;

grant INSERT on table public.revenue_overrides_daily to service_role;

grant MAINTAIN on table public.revenue_overrides_daily to service_role;

grant REFERENCES on table public.revenue_overrides_daily to service_role;

grant SELECT on table public.revenue_overrides_daily to service_role;

grant TRIGGER on table public.revenue_overrides_daily to service_role;

grant TRUNCATE on table public.revenue_overrides_daily to service_role;

grant UPDATE on table public.revenue_overrides_daily to service_role;

grant INSERT on table public.sales_cycle_period_activity to authenticated;

grant MAINTAIN on table public.sales_cycle_period_activity to authenticated;

grant SELECT on table public.sales_cycle_period_activity to authenticated;

grant UPDATE on table public.sales_cycle_period_activity to authenticated;

grant DELETE on table public.sales_cycle_period_activity to service_role;

grant INSERT on table public.sales_cycle_period_activity to service_role;

grant MAINTAIN on table public.sales_cycle_period_activity to service_role;

grant REFERENCES on table public.sales_cycle_period_activity to service_role;

grant SELECT on table public.sales_cycle_period_activity to service_role;

grant TRIGGER on table public.sales_cycle_period_activity to service_role;

grant TRUNCATE on table public.sales_cycle_period_activity to service_role;

grant UPDATE on table public.sales_cycle_period_activity to service_role;

grant INSERT on table public.sales_cycles to authenticated;

grant MAINTAIN on table public.sales_cycles to authenticated;

grant SELECT on table public.sales_cycles to authenticated;

grant UPDATE on table public.sales_cycles to authenticated;

grant DELETE on table public.sales_cycles to service_role;

grant INSERT on table public.sales_cycles to service_role;

grant MAINTAIN on table public.sales_cycles to service_role;

grant REFERENCES on table public.sales_cycles to service_role;

grant SELECT on table public.sales_cycles to service_role;

grant TRIGGER on table public.sales_cycles to service_role;

grant TRUNCATE on table public.sales_cycles to service_role;

grant UPDATE on table public.sales_cycles to service_role;

grant DELETE on table public.sla_rules to authenticated;

grant INSERT on table public.sla_rules to authenticated;

grant MAINTAIN on table public.sla_rules to authenticated;

grant REFERENCES on table public.sla_rules to authenticated;

grant SELECT on table public.sla_rules to authenticated;

grant TRIGGER on table public.sla_rules to authenticated;

grant TRUNCATE on table public.sla_rules to authenticated;

grant UPDATE on table public.sla_rules to authenticated;

grant DELETE on table public.sla_rules to service_role;

grant INSERT on table public.sla_rules to service_role;

grant MAINTAIN on table public.sla_rules to service_role;

grant REFERENCES on table public.sla_rules to service_role;

grant SELECT on table public.sla_rules to service_role;

grant TRIGGER on table public.sla_rules to service_role;

grant TRUNCATE on table public.sla_rules to service_role;

grant UPDATE on table public.sla_rules to service_role;

grant DELETE on table public.v_kanban_items to service_role;

grant INSERT on table public.v_kanban_items to service_role;

grant MAINTAIN on table public.v_kanban_items to service_role;

grant REFERENCES on table public.v_kanban_items to service_role;

grant SELECT on table public.v_kanban_items to service_role;

grant TRIGGER on table public.v_kanban_items to service_role;

grant TRUNCATE on table public.v_kanban_items to service_role;

grant UPDATE on table public.v_kanban_items to service_role;

grant DELETE on table public.v_pipeline_items to authenticated;

grant INSERT on table public.v_pipeline_items to authenticated;

grant MAINTAIN on table public.v_pipeline_items to authenticated;

grant REFERENCES on table public.v_pipeline_items to authenticated;

grant SELECT on table public.v_pipeline_items to authenticated;

grant TRIGGER on table public.v_pipeline_items to authenticated;

grant TRUNCATE on table public.v_pipeline_items to authenticated;

grant UPDATE on table public.v_pipeline_items to authenticated;

grant DELETE on table public.v_pipeline_items to service_role;

grant INSERT on table public.v_pipeline_items to service_role;

grant MAINTAIN on table public.v_pipeline_items to service_role;

grant REFERENCES on table public.v_pipeline_items to service_role;

grant SELECT on table public.v_pipeline_items to service_role;

grant TRIGGER on table public.v_pipeline_items to service_role;

grant TRUNCATE on table public.v_pipeline_items to service_role;

grant UPDATE on table public.v_pipeline_items to service_role;

grant DELETE on table public.v_pool_items_with_returns to authenticated;

grant INSERT on table public.v_pool_items_with_returns to authenticated;

grant MAINTAIN on table public.v_pool_items_with_returns to authenticated;

grant REFERENCES on table public.v_pool_items_with_returns to authenticated;

grant SELECT on table public.v_pool_items_with_returns to authenticated;

grant TRIGGER on table public.v_pool_items_with_returns to authenticated;

grant TRUNCATE on table public.v_pool_items_with_returns to authenticated;

grant UPDATE on table public.v_pool_items_with_returns to authenticated;

grant DELETE on table public.v_pool_items_with_returns to service_role;

grant INSERT on table public.v_pool_items_with_returns to service_role;

grant MAINTAIN on table public.v_pool_items_with_returns to service_role;

grant REFERENCES on table public.v_pool_items_with_returns to service_role;

grant SELECT on table public.v_pool_items_with_returns to service_role;

grant TRIGGER on table public.v_pool_items_with_returns to service_role;

grant TRUNCATE on table public.v_pool_items_with_returns to service_role;

grant UPDATE on table public.v_pool_items_with_returns to service_role;

grant SELECT on table public.v_revenue_daily_extra to authenticated;

grant DELETE on table public.v_revenue_daily_extra to service_role;

grant INSERT on table public.v_revenue_daily_extra to service_role;

grant MAINTAIN on table public.v_revenue_daily_extra to service_role;

grant REFERENCES on table public.v_revenue_daily_extra to service_role;

grant SELECT on table public.v_revenue_daily_extra to service_role;

grant TRIGGER on table public.v_revenue_daily_extra to service_role;

grant TRUNCATE on table public.v_revenue_daily_extra to service_role;

grant UPDATE on table public.v_revenue_daily_extra to service_role;

grant SELECT on table public.v_revenue_daily_seller to authenticated;

grant DELETE on table public.v_revenue_daily_seller to service_role;

grant INSERT on table public.v_revenue_daily_seller to service_role;

grant MAINTAIN on table public.v_revenue_daily_seller to service_role;

grant REFERENCES on table public.v_revenue_daily_seller to service_role;

grant SELECT on table public.v_revenue_daily_seller to service_role;

grant TRIGGER on table public.v_revenue_daily_seller to service_role;

grant TRUNCATE on table public.v_revenue_daily_seller to service_role;

grant UPDATE on table public.v_revenue_daily_seller to service_role;

grant DELETE on table public.vw_audit_sales_cycles_history to authenticated;

grant INSERT on table public.vw_audit_sales_cycles_history to authenticated;

grant MAINTAIN on table public.vw_audit_sales_cycles_history to authenticated;

grant REFERENCES on table public.vw_audit_sales_cycles_history to authenticated;

grant SELECT on table public.vw_audit_sales_cycles_history to authenticated;

grant TRIGGER on table public.vw_audit_sales_cycles_history to authenticated;

grant TRUNCATE on table public.vw_audit_sales_cycles_history to authenticated;

grant UPDATE on table public.vw_audit_sales_cycles_history to authenticated;

grant DELETE on table public.vw_audit_sales_cycles_history to service_role;

grant INSERT on table public.vw_audit_sales_cycles_history to service_role;

grant MAINTAIN on table public.vw_audit_sales_cycles_history to service_role;

grant REFERENCES on table public.vw_audit_sales_cycles_history to service_role;

grant SELECT on table public.vw_audit_sales_cycles_history to service_role;

grant TRIGGER on table public.vw_audit_sales_cycles_history to service_role;

grant TRUNCATE on table public.vw_audit_sales_cycles_history to service_role;

grant UPDATE on table public.vw_audit_sales_cycles_history to service_role;

grant DELETE on table public.vw_lead_status_age to authenticated;

grant INSERT on table public.vw_lead_status_age to authenticated;

grant MAINTAIN on table public.vw_lead_status_age to authenticated;

grant REFERENCES on table public.vw_lead_status_age to authenticated;

grant SELECT on table public.vw_lead_status_age to authenticated;

grant TRIGGER on table public.vw_lead_status_age to authenticated;

grant TRUNCATE on table public.vw_lead_status_age to authenticated;

grant UPDATE on table public.vw_lead_status_age to authenticated;

grant DELETE on table public.vw_lead_status_age to service_role;

grant INSERT on table public.vw_lead_status_age to service_role;

grant MAINTAIN on table public.vw_lead_status_age to service_role;

grant REFERENCES on table public.vw_lead_status_age to service_role;

grant SELECT on table public.vw_lead_status_age to service_role;

grant TRIGGER on table public.vw_lead_status_age to service_role;

grant TRUNCATE on table public.vw_lead_status_age to service_role;

grant UPDATE on table public.vw_lead_status_age to service_role;

grant DELETE on table public.vw_revenue_by_seller_day to authenticated;

grant INSERT on table public.vw_revenue_by_seller_day to authenticated;

grant MAINTAIN on table public.vw_revenue_by_seller_day to authenticated;

grant REFERENCES on table public.vw_revenue_by_seller_day to authenticated;

grant SELECT on table public.vw_revenue_by_seller_day to authenticated;

grant TRIGGER on table public.vw_revenue_by_seller_day to authenticated;

grant TRUNCATE on table public.vw_revenue_by_seller_day to authenticated;

grant UPDATE on table public.vw_revenue_by_seller_day to authenticated;

grant DELETE on table public.vw_revenue_by_seller_day to service_role;

grant INSERT on table public.vw_revenue_by_seller_day to service_role;

grant MAINTAIN on table public.vw_revenue_by_seller_day to service_role;

grant REFERENCES on table public.vw_revenue_by_seller_day to service_role;

grant SELECT on table public.vw_revenue_by_seller_day to service_role;

grant TRIGGER on table public.vw_revenue_by_seller_day to service_role;

grant TRUNCATE on table public.vw_revenue_by_seller_day to service_role;

grant UPDATE on table public.vw_revenue_by_seller_day to service_role;

grant DELETE on table public.vw_revenue_by_seller_total to authenticated;

grant INSERT on table public.vw_revenue_by_seller_total to authenticated;

grant MAINTAIN on table public.vw_revenue_by_seller_total to authenticated;

grant REFERENCES on table public.vw_revenue_by_seller_total to authenticated;

grant SELECT on table public.vw_revenue_by_seller_total to authenticated;

grant TRIGGER on table public.vw_revenue_by_seller_total to authenticated;

grant TRUNCATE on table public.vw_revenue_by_seller_total to authenticated;

grant UPDATE on table public.vw_revenue_by_seller_total to authenticated;

grant DELETE on table public.vw_revenue_by_seller_total to service_role;

grant INSERT on table public.vw_revenue_by_seller_total to service_role;

grant MAINTAIN on table public.vw_revenue_by_seller_total to service_role;

grant REFERENCES on table public.vw_revenue_by_seller_total to service_role;

grant SELECT on table public.vw_revenue_by_seller_total to service_role;

grant TRIGGER on table public.vw_revenue_by_seller_total to service_role;

grant TRUNCATE on table public.vw_revenue_by_seller_total to service_role;

grant UPDATE on table public.vw_revenue_by_seller_total to service_role;

grant SELECT on table public.vw_sales_cycles_complete to authenticated;

grant DELETE on table public.vw_sales_cycles_complete to service_role;

grant INSERT on table public.vw_sales_cycles_complete to service_role;

grant MAINTAIN on table public.vw_sales_cycles_complete to service_role;

grant REFERENCES on table public.vw_sales_cycles_complete to service_role;

grant SELECT on table public.vw_sales_cycles_complete to service_role;

grant TRIGGER on table public.vw_sales_cycles_complete to service_role;

grant TRUNCATE on table public.vw_sales_cycles_complete to service_role;

grant UPDATE on table public.vw_sales_cycles_complete to service_role;

grant SELECT on table public.vw_sales_cycles_with_revenue to authenticated;

grant DELETE on table public.vw_sales_cycles_with_revenue to service_role;

grant INSERT on table public.vw_sales_cycles_with_revenue to service_role;

grant MAINTAIN on table public.vw_sales_cycles_with_revenue to service_role;

grant REFERENCES on table public.vw_sales_cycles_with_revenue to service_role;

grant SELECT on table public.vw_sales_cycles_with_revenue to service_role;

grant TRIGGER on table public.vw_sales_cycles_with_revenue to service_role;

grant TRUNCATE on table public.vw_sales_cycles_with_revenue to service_role;

grant UPDATE on table public.vw_sales_cycles_with_revenue to service_role;

grant SELECT on table public.vw_sales_funnel to authenticated;

grant DELETE on table public.vw_sales_funnel to service_role;

grant INSERT on table public.vw_sales_funnel to service_role;

grant MAINTAIN on table public.vw_sales_funnel to service_role;

grant REFERENCES on table public.vw_sales_funnel to service_role;

grant SELECT on table public.vw_sales_funnel to service_role;

grant TRIGGER on table public.vw_sales_funnel to service_role;

grant TRUNCATE on table public.vw_sales_funnel to service_role;

grant UPDATE on table public.vw_sales_funnel to service_role;

grant SELECT on table public.vw_sales_lost_analysis to authenticated;

grant DELETE on table public.vw_sales_lost_analysis to service_role;

grant INSERT on table public.vw_sales_lost_analysis to service_role;

grant MAINTAIN on table public.vw_sales_lost_analysis to service_role;

grant REFERENCES on table public.vw_sales_lost_analysis to service_role;

grant SELECT on table public.vw_sales_lost_analysis to service_role;

grant TRIGGER on table public.vw_sales_lost_analysis to service_role;

grant TRUNCATE on table public.vw_sales_lost_analysis to service_role;

grant UPDATE on table public.vw_sales_lost_analysis to service_role;

grant SELECT on table public.vw_sales_monthly_analysis to authenticated;

grant DELETE on table public.vw_sales_monthly_analysis to service_role;

grant INSERT on table public.vw_sales_monthly_analysis to service_role;

grant MAINTAIN on table public.vw_sales_monthly_analysis to service_role;

grant REFERENCES on table public.vw_sales_monthly_analysis to service_role;

grant SELECT on table public.vw_sales_monthly_analysis to service_role;

grant TRIGGER on table public.vw_sales_monthly_analysis to service_role;

grant TRUNCATE on table public.vw_sales_monthly_analysis to service_role;

grant UPDATE on table public.vw_sales_monthly_analysis to service_role;

grant SELECT on table public.vw_sales_performance_by_owner to authenticated;

grant DELETE on table public.vw_sales_performance_by_owner to service_role;

grant INSERT on table public.vw_sales_performance_by_owner to service_role;

grant MAINTAIN on table public.vw_sales_performance_by_owner to service_role;

grant REFERENCES on table public.vw_sales_performance_by_owner to service_role;

grant SELECT on table public.vw_sales_performance_by_owner to service_role;

grant TRIGGER on table public.vw_sales_performance_by_owner to service_role;

grant TRUNCATE on table public.vw_sales_performance_by_owner to service_role;

grant UPDATE on table public.vw_sales_performance_by_owner to service_role;

-- -----------------------------------------------------------------------------
-- Revogação explícita de privilégios em funções
-- -----------------------------------------------------------------------------

revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;

revoke all on function public.tempo_medio_por_etapa(empresa_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.gargalo_funil(empresa_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.fechamentos_por_consultora(empresa_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.set_updated_at() from public, anon, authenticated, service_role;

revoke all on function public.current_company_id() from public, anon, authenticated, service_role;

revoke all on function public.current_role() from public, anon, authenticated, service_role;

revoke all on function public.sync_profile_email() from public, anon, authenticated, service_role;

revoke all on function public.assign_leads(p_company_id uuid, p_lead_ids uuid[], p_mode text, p_to_owner_id uuid, p_seller_ids uuid[], p_only_if_pool boolean) from public, anon, authenticated, service_role;

revoke all on function public.return_owner_leads_to_pool(p_company_id uuid, p_owner_id uuid, p_limit integer, p_status text, p_search text) from public, anon, authenticated, service_role;

revoke all on function public.reassign_owner_leads(p_company_id uuid, p_from_owner_id uuid, p_to_owner_id uuid, p_limit integer, p_status text, p_search text, p_order_mode text) from public, anon, authenticated, service_role;

revoke all on function public.round_robin_from_owner_leads(p_company_id uuid, p_from_owner_id uuid, p_seller_ids uuid[], p_limit integer, p_status text, p_search text, p_order_mode text) from public, anon, authenticated, service_role;

revoke all on function public.assign_leads(p_company_id uuid, p_source text, p_limit integer, p_lead_ids uuid[], p_status text, p_search text, p_mode text, p_to_owner_id uuid, p_seller_ids uuid[], p_only_if_pool boolean, p_order_mode text) from public, anon, authenticated, service_role;

revoke all on function public.seller_get_context() from public, anon, authenticated, service_role;

revoke all on function public.report_ai_top_objections(p_company_id uuid, p_since timestamp with time zone, p_user_id uuid, p_limit integer) from public, anon, authenticated, service_role;

revoke all on function public.report_ai_top_next_actions(p_company_id uuid, p_since timestamp with time zone, p_user_id uuid, p_limit integer) from public, anon, authenticated, service_role;

revoke all on function public.log_lead_status_change() from public, anon, authenticated, service_role;

revoke all on function public.get_funnel_metrics(p_company_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_owner_id uuid, p_goal_closed integer) from public, anon, authenticated, service_role;

revoke all on function public.get_funnel_metrics_group(p_company_id uuid, p_owner_ids uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_goal_closed integer) from public, anon, authenticated, service_role;

revoke all on function public.get_funnel_metrics_for_profiles(p_company_id uuid, p_profile_ids uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_goal_closed integer) from public, anon, authenticated, service_role;

revoke all on function public.get_avg_ticket_won(p_company_id uuid, p_days integer) from public, anon, authenticated, service_role;

revoke all on function public.seller_move_lead_stage(p_company_id uuid, p_lead_id uuid, p_to_status text, p_reason text, p_deal_value numeric, p_to_stage_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.log_lead_stage_change() from public, anon, authenticated, service_role;

revoke all on function public.get_goal_simulation_stats(p_company_id uuid, p_start_date date, p_end_date date, p_owner_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.next_user_code(p_company_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.profiles_set_user_code() from public, anon, authenticated, service_role;

revoke all on function public.get_company_members_count(p_company_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.get_goal_simulation_stats_v2(p_company_id uuid, p_start_date date, p_end_date date, p_owner_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.is_admin() from public, anon, authenticated, service_role;

revoke all on function public.update_updated_at_column() from public, anon, authenticated, service_role;

revoke all on function public.handle_sales_cycle_closed_at() from public, anon, authenticated, service_role;

revoke all on function public.block_lead_profiles_key_update() from public, anon, authenticated, service_role;

revoke all on function public.rpc_create_lead_and_cycle(p_company_id uuid, p_name text, p_phone text, p_owner_user_id uuid, p_status text) from public, anon, authenticated, service_role;

revoke all on function public.rpc_create_lead_and_cycle(p_lead jsonb, p_group_id uuid, p_owner_user_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.rpc_return_cycle_to_pool(p_cycle_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.rpc_bulk_import_cycles(p_leads jsonb[], p_group_id uuid, p_owner_user_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.delete_leads_by_ids(lead_ids uuid[], company_id_param uuid) from public, anon, authenticated, service_role;

revoke all on function public.rpc_bulk_return_group_to_pool(p_group_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.rpc_get_cycle_last_events(p_cycle_id uuid, p_limit integer) from public, anon, authenticated, service_role;

revoke all on function public.rpc_delete_lead(p_lead_id uuid, p_company_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.rpc_bulk_reassign_cycles_owner(p_cycle_ids uuid[], p_owner_user_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.rpc_distribute_group_pool_round_robin(p_group_id uuid, p_owner_ids uuid[]) from public, anon, authenticated, service_role;

revoke all on function public.create_default_quick_actions() from public, anon, authenticated, service_role;

revoke all on function public.rpc_get_active_competency() from public, anon, authenticated, service_role;

revoke all on function public.rpc_create_revenue_extra_source(p_name text) from public, anon, authenticated, service_role;

revoke all on function public.rpc_upsert_revenue_daily_override(p_source_kind text, p_source_id uuid, p_ref_date date, p_real_value numeric, p_reason text, p_notes text) from public, anon, authenticated, service_role;

revoke all on function public.handle_won_columns_freeze() from public, anon, authenticated, service_role;

revoke all on function public.handle_won_columns_reset() from public, anon, authenticated, service_role;

revoke all on function public.rpc_register_cycle_won(p_cycle_id uuid, p_won_total numeric, p_won_items integer, p_won_note text) from public, anon, authenticated, service_role;

revoke all on function public.fn_log_status_change() from public, anon, authenticated, service_role;

revoke all on function public.fn_mark_deal_won(p_sales_cycle_id uuid, p_won_owner_user_id uuid, p_won_total numeric, p_won_items integer, p_won_note text) from public, anon, authenticated, service_role;

revoke all on function public.fn_mark_deal_lost(p_sales_cycle_id uuid, p_lost_reason text, p_lost_owner_user_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.fn_pause_deal(p_sales_cycle_id uuid, p_paused_reason text) from public, anon, authenticated, service_role;

revoke all on function public.fn_cancel_deal(p_sales_cycle_id uuid, p_canceled_reason text) from public, anon, authenticated, service_role;

revoke all on function public.fn_resume_deal(p_sales_cycle_id uuid, p_new_status text) from public, anon, authenticated, service_role;

revoke all on function public.fn_audit_sales_cycles() from public, anon, authenticated, service_role;

revoke all on function public.fn_set_user_role(p_user_id uuid, p_role text) from public, anon, authenticated, service_role;

revoke all on function public.is_admin_or_manager() from public, anon, authenticated, service_role;

revoke all on function public.rpc_simulator_group_conversion(p_company_id uuid, p_owner_id uuid, p_date_start date, p_date_end date) from public, anon, authenticated, service_role;

revoke all on function public.rpc_revenue_summary(p_company_id uuid, p_owner_id uuid, p_start_date date, p_end_date date, p_metric text) from public, anon, authenticated, service_role;

revoke all on function public.trg_set_updated_at() from public, anon, authenticated, service_role;

revoke all on function public.current_profile() from public, anon, authenticated, service_role;

revoke all on function public.rpc_upsert_revenue_goal(p_company_id uuid, p_owner_id uuid, p_date_start date, p_date_end date, p_goal_value numeric) from public, anon, authenticated, service_role;

revoke all on function public.rpc_admin_list_sellers_stats(p_days integer) from public, anon, authenticated, service_role;

revoke all on function public.rpc_admin_update_seller_access(p_seller_id uuid, p_role text, p_is_active boolean) from public, anon, authenticated, service_role;

revoke all on function public.rpc_get_company_sla_rules() from public, anon, authenticated, service_role;

revoke all on function public.rpc_upsert_company_sla_rules(p_rules jsonb) from public, anon, authenticated, service_role;

revoke all on function public.rpc_create_lead_group(p_name text) from public, anon, authenticated, service_role;

revoke all on function public.rpc_seller_micro_kpis(p_owner_user_id uuid, p_days integer) from public, anon, authenticated, service_role;

revoke all on function public.rpc_seller_worklist(p_owner_user_id uuid, p_group_id uuid, p_limit integer) from public, anon, authenticated, service_role;

revoke all on function public.fn_products_updated_at() from public, anon, authenticated, service_role;

revoke all on function public.rpc_get_sales_cycle_metrics_v1(p_owner_user_id uuid, p_month date) from public, anon, authenticated, service_role;

revoke all on function public.report_sla_risk(p_company_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.report_stage_conversion(p_company_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.report_stage_losses(p_company_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.report_stage_time_summary(p_company_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.report_meta_vs_real(p_company_id uuid, p_start_date date, p_end_date date) from public, anon, authenticated, service_role;

revoke all on function public.rpc_reset_cycle_state_on_assignment(p_cycle_id uuid, p_new_owner_user_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.rpc_touch_cycle_in_current_competency(p_cycle_id uuid, p_touch_type text, p_touch_at timestamp with time zone, p_won_total numeric) from public, anon, authenticated, service_role;

revoke all on function public.rpc_report_period_summary() from public, anon, authenticated, service_role;

revoke all on function public.rpc_get_simulator_period_metrics(p_owner_user_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.rpc_get_revenue_period_summary(p_owner_user_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.rpc_open_next_monthly_competency() from public, anon, authenticated, service_role;

revoke all on function public.rpc_touch_lead_in_current_competency(p_lead_id uuid, p_touch_type text, p_touch_at timestamp with time zone, p_won_total numeric) from public, anon, authenticated, service_role;

revoke all on function public.handle_lead_event_period_activity() from public, anon, authenticated, service_role;

revoke all on function public.handle_lead_status_period_activity() from public, anon, authenticated, service_role;

revoke all on function public.handle_sales_cycle_period_activity() from public, anon, authenticated, service_role;

revoke all on function public.fn_auto_fill_closed_at() from public, anon, authenticated, service_role;

revoke all on function public.rpc_get_user_sales_cycles(p_owner_user_id uuid, p_status text, p_limit integer, p_offset integer) from public, anon, authenticated, service_role;

revoke all on function public.rpc_get_pool_cycles(p_limit integer, p_offset integer) from public, anon, authenticated, service_role;

revoke all on function public.rpc_close_cycle_won(p_cycle_id uuid, p_won_value numeric, p_revenue_date_ref date, p_won_note text, p_product_id uuid, p_won_unit_price numeric, p_payment_method text, p_payment_type text, p_entry_amount numeric, p_installments_count integer, p_installment_amount numeric, p_payment_notes text) from public, anon, authenticated, service_role;

revoke all on function public.rpc_close_cycle_lost(p_cycle_id uuid, p_lost_reason text, p_note text, p_action_channel text) from public, anon, authenticated, service_role;

revoke all on function public.rpc_move_cycle_stage(p_cycle_id uuid, p_to_status text, p_metadata jsonb) from public, anon, authenticated, service_role;

revoke all on function public.rpc_move_cycle_stage_checkpoint(p_cycle_id uuid, p_to_status text, p_checkpoint jsonb) from public, anon, authenticated, service_role;

revoke all on function public.rpc_assign_cycle_owner(p_cycle_id uuid, p_owner_user_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.rpc_reassign_cycle_owner(p_cycle_id uuid, p_owner_user_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.rpc_bulk_assign_cycles_owner(p_cycle_ids uuid[], p_owner_user_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.rpc_bulk_assign_round_robin(p_cycle_ids uuid[], p_owner_ids uuid[]) from public, anon, authenticated, service_role;

revoke all on function public.rpc_set_next_action(p_cycle_id uuid, p_next_action text, p_next_action_date timestamp with time zone) from public, anon, authenticated, service_role;

revoke all on function public.rpc_bulk_return_cycles_to_pool(p_cycle_ids uuid[]) from public, anon, authenticated, service_role;

revoke all on function public.rpc_bulk_return_cycles_to_pool_self(p_cycle_ids uuid[]) from public, anon, authenticated, service_role;

revoke all on function public.rpc_return_cycle_to_pool_with_reason(p_cycle_id uuid, p_reason text, p_details text) from public, anon, authenticated, service_role;

revoke all on function public.rpc_recall_group_to_pool(p_group_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.rpc_set_cycle_group(p_cycle_id uuid, p_group_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.rpc_bulk_set_cycles_group(p_cycle_ids uuid[], p_group_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.rpc_log_ai_analysis(p_cycle_id uuid, p_suggestion jsonb, p_conversation_excerpt text) from public, anon, authenticated, service_role;

revoke all on function public.rpc_log_ai_suggestion_applied(p_cycle_id uuid, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public.rpc_log_ai_suggestion_rejected(p_cycle_id uuid, p_payload jsonb) from public, anon, authenticated, service_role;

revoke all on function public.rpc_cycles_status_totals(p_owner_user_id uuid, p_group_id uuid, p_search_term text) from public, anon, authenticated, service_role;

revoke all on function public.rpc_get_cycle_ai_context(p_cycle_id uuid, p_events_limit integer) from public, anon, authenticated, service_role;

revoke all on function public.rpc_apply_ai_open_suggestion(p_cycle_id uuid, p_to_status text, p_next_action text, p_next_action_date timestamp with time zone, p_summary text, p_suggestion jsonb, p_source text) from public, anon, authenticated, service_role;

revoke all on function public.set_execution_day_calendars_updated_at() from public, anon, authenticated, service_role;

revoke all on function public.rpc_get_close_rate_real(p_owner_user_id uuid, p_days_window integer) from public, anon, authenticated, service_role;

revoke all on function public.rpc_revenue_sales_details_by_day(p_ref_date date, p_owner_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.set_company_memberships_updated_at() from public, anon, authenticated, service_role;

revoke all on function public.has_active_company_membership(p_company_id uuid, p_roles text[]) from public, anon, authenticated, service_role;

revoke all on function public.is_company_admin(p_company_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.get_user_company_memberships() from public, anon, authenticated, service_role;

revoke all on function public.fn_set_user_role_for_company(p_company_id uuid, p_user_id uuid, p_role text) from public, anon, authenticated, service_role;

revoke all on function public.rpc_admin_update_seller_access_for_company(p_company_id uuid, p_seller_id uuid, p_role text, p_is_active boolean) from public, anon, authenticated, service_role;

revoke all on function public.rpc_admin_list_sellers_stats_for_company(p_company_id uuid, p_days integer) from public, anon, authenticated, service_role;

revoke all on function public.rpc_set_next_action_for_company(p_company_id uuid, p_cycle_id uuid, p_next_action text, p_next_action_date timestamp with time zone) from public, anon, authenticated, service_role;

revoke all on function public.rpc_move_cycle_stage_for_company(p_company_id uuid, p_cycle_id uuid, p_to_status text, p_metadata jsonb) from public, anon, authenticated, service_role;

revoke all on function public.rpc_move_cycle_stage_checkpoint_for_company(p_company_id uuid, p_cycle_id uuid, p_to_status text, p_checkpoint jsonb) from public, anon, authenticated, service_role;

revoke all on function public.rpc_close_cycle_lost_for_company(p_company_id uuid, p_cycle_id uuid, p_lost_reason text, p_note text, p_action_channel text) from public, anon, authenticated, service_role;

revoke all on function public.rpc_close_cycle_won_for_company(p_company_id uuid, p_cycle_id uuid, p_won_value numeric, p_revenue_date_ref date, p_won_note text, p_product_id uuid, p_won_unit_price numeric, p_payment_method text, p_payment_type text, p_entry_amount numeric, p_installments_count integer, p_installment_amount numeric, p_payment_notes text) from public, anon, authenticated, service_role;

revoke all on function public.rpc_assign_cycle_owner_for_company(p_company_id uuid, p_cycle_id uuid, p_owner_user_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.rpc_get_cycle_ai_context_for_company(p_company_id uuid, p_cycle_id uuid, p_events_limit integer) from public, anon, authenticated, service_role;

revoke all on function public.rpc_apply_ai_open_suggestion_for_company(p_company_id uuid, p_cycle_id uuid, p_to_status text, p_next_action text, p_next_action_date timestamp with time zone, p_summary text, p_suggestion jsonb, p_source text) from public, anon, authenticated, service_role;

revoke all on function public.has_company_membership_strict(p_company_id uuid, p_roles text[]) from public, anon, authenticated, service_role;

revoke all on function public.can_access_lead_profile_strict(p_company_id uuid, p_lead_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.is_platform_admin_active() from public, anon, authenticated, service_role;

revoke all on function public.can_select_company_membership_strict(p_company_id uuid, p_user_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.can_select_profile_strict(p_profile_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.can_select_sales_cycle_strict(p_company_id uuid, p_owner_user_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.can_write_sales_cycle_strict(p_company_id uuid, p_owner_user_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.can_select_lead_base_strict(p_company_id uuid, p_lead_id uuid, p_owner_id uuid, p_created_by uuid, p_deleted_at timestamp with time zone) from public, anon, authenticated, service_role;

revoke all on function public.can_update_lead_base_strict(p_company_id uuid, p_lead_id uuid, p_owner_id uuid, p_created_by uuid, p_deleted_at timestamp with time zone) from public, anon, authenticated, service_role;

revoke all on function public.rpc_revenue_sales_details_by_day_for_company(p_company_id uuid, p_ref_date date, p_owner_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.rpc_create_revenue_extra_source_for_company(p_company_id uuid, p_name text) from public, anon, authenticated, service_role;

revoke all on function public.rpc_upsert_revenue_daily_override_for_company(p_company_id uuid, p_source_kind text, p_source_id uuid, p_ref_date date, p_real_value numeric, p_reason text, p_notes text) from public, anon, authenticated, service_role;

revoke all on function public.rpc_get_revenue_goal(p_company_id uuid, p_owner_id uuid, p_date_start date, p_date_end date) from public, anon, authenticated, service_role;

revoke all on function public.rpc_upsert_revenue_goal(p_company_id uuid, p_owner_id uuid, p_date_start date, p_date_end date, p_goal_value numeric, p_ticket_medio numeric) from public, anon, authenticated, service_role;

revoke all on function public.rpc_get_close_rate_real_for_company(p_company_id uuid, p_owner_user_id uuid, p_days_window integer) from public, anon, authenticated, service_role;

revoke all on function public.rpc_get_sales_cycle_metrics_v1_for_company_base(p_company_id uuid, p_owner_user_id uuid, p_month date) from public, anon, authenticated, service_role;

revoke all on function public.report_stage_conversion_for_period(p_company_id uuid, p_date_start date, p_date_end date) from public, anon, authenticated, service_role;

revoke all on function public.report_stage_losses_for_period(p_company_id uuid, p_date_start date, p_date_end date) from public, anon, authenticated, service_role;

revoke all on function public.report_stage_time_summary_for_period(p_company_id uuid, p_date_start date, p_date_end date) from public, anon, authenticated, service_role;

revoke all on function public.rpc_get_company_sla_rules_for_company(p_company_id uuid) from public, anon, authenticated, service_role;

revoke all on function public.rpc_platform_set_company_status(p_company_id uuid, p_platform_status text) from public, anon, authenticated, service_role;

revoke all on function public.rpc_create_successor_cycle_for_company(p_company_id uuid, p_source_cycle_id uuid, p_opportunity_type text, p_assignment_mode text, p_owner_user_id uuid, p_group_id uuid, p_note text) from public, anon, authenticated, service_role;

revoke all on function public.rpc_save_ai_coaching_for_company(p_company_id uuid, p_cycle_id uuid, p_coaching jsonb, p_yolen_decision jsonb, p_source text) from public, anon, authenticated, service_role;

revoke all on function public.rpc_list_ai_coaching_for_cycle_for_company(p_company_id uuid, p_cycle_id uuid, p_limit integer) from public, anon, authenticated, service_role;

revoke all on function public.rpc_ingest_site_lead(p_company_id uuid, p_created_by uuid, p_api_key_id uuid, p_source text, p_name text, p_phone text, p_email text, p_document text, p_notes text, p_campaign_name text, p_external_key text, p_external_id text, p_metadata jsonb) from public, anon, authenticated, service_role;

revoke all on function public.fn_assign_site_lead_round_robin() from public, anon, authenticated, service_role;

revoke all on function public.fn_is_real_work_event(p_event_type text, p_metadata jsonb) from public, anon, authenticated, service_role;

revoke all on function public.trg_set_first_worked_at() from public, anon, authenticated, service_role;

revoke all on function public.rpc_get_monthly_worked_opportunities(p_company_id uuid, p_owner_user_id uuid, p_month date) from public, anon, authenticated, service_role;

revoke all on function public.rpc_get_sales_cycle_metrics_v1_for_company(p_company_id uuid, p_owner_user_id uuid, p_month date) from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Privilégios em funções
-- -----------------------------------------------------------------------------

grant EXECUTE on function public.assign_leads(p_company_id uuid, p_lead_ids uuid[], p_mode text, p_to_owner_id uuid, p_seller_ids uuid[], p_only_if_pool boolean) to service_role;

grant EXECUTE on function public.assign_leads(p_company_id uuid, p_source text, p_limit integer, p_lead_ids uuid[], p_status text, p_search text, p_mode text, p_to_owner_id uuid, p_seller_ids uuid[], p_only_if_pool boolean, p_order_mode text) to service_role;

grant EXECUTE on function public.block_lead_profiles_key_update() to service_role;

grant EXECUTE on function public.can_access_lead_profile_strict(p_company_id uuid, p_lead_id uuid) to authenticated;

grant EXECUTE on function public.can_access_lead_profile_strict(p_company_id uuid, p_lead_id uuid) to service_role;

grant EXECUTE on function public.can_select_company_membership_strict(p_company_id uuid, p_user_id uuid) to authenticated;

grant EXECUTE on function public.can_select_company_membership_strict(p_company_id uuid, p_user_id uuid) to service_role;

grant EXECUTE on function public.can_select_lead_base_strict(p_company_id uuid, p_lead_id uuid, p_owner_id uuid, p_created_by uuid, p_deleted_at timestamp with time zone) to authenticated;

grant EXECUTE on function public.can_select_lead_base_strict(p_company_id uuid, p_lead_id uuid, p_owner_id uuid, p_created_by uuid, p_deleted_at timestamp with time zone) to service_role;

grant EXECUTE on function public.can_select_profile_strict(p_profile_id uuid) to authenticated;

grant EXECUTE on function public.can_select_profile_strict(p_profile_id uuid) to service_role;

grant EXECUTE on function public.can_select_sales_cycle_strict(p_company_id uuid, p_owner_user_id uuid) to authenticated;

grant EXECUTE on function public.can_select_sales_cycle_strict(p_company_id uuid, p_owner_user_id uuid) to service_role;

grant EXECUTE on function public.can_update_lead_base_strict(p_company_id uuid, p_lead_id uuid, p_owner_id uuid, p_created_by uuid, p_deleted_at timestamp with time zone) to authenticated;

grant EXECUTE on function public.can_update_lead_base_strict(p_company_id uuid, p_lead_id uuid, p_owner_id uuid, p_created_by uuid, p_deleted_at timestamp with time zone) to service_role;

grant EXECUTE on function public.can_write_sales_cycle_strict(p_company_id uuid, p_owner_user_id uuid) to authenticated;

grant EXECUTE on function public.can_write_sales_cycle_strict(p_company_id uuid, p_owner_user_id uuid) to service_role;

grant EXECUTE on function public.create_default_quick_actions() to authenticated;

grant EXECUTE on function public.create_default_quick_actions() to service_role;

grant EXECUTE on function public.current_company_id() to authenticated;

grant EXECUTE on function public.current_company_id() to service_role;

grant EXECUTE on function public.current_profile() to authenticated;

grant EXECUTE on function public.current_profile() to service_role;

grant EXECUTE on function public."current_role"() to authenticated;

grant EXECUTE on function public."current_role"() to service_role;

grant EXECUTE on function public.delete_leads_by_ids(lead_ids uuid[], company_id_param uuid) to service_role;

grant EXECUTE on function public.fechamentos_por_consultora(empresa_id uuid) to authenticated;

grant EXECUTE on function public.fechamentos_por_consultora(empresa_id uuid) to service_role;

grant EXECUTE on function public.fn_assign_site_lead_round_robin() to service_role;

grant EXECUTE on function public.fn_audit_sales_cycles() to authenticated;

grant EXECUTE on function public.fn_audit_sales_cycles() to service_role;

grant EXECUTE on function public.fn_auto_fill_closed_at() to authenticated;

grant EXECUTE on function public.fn_auto_fill_closed_at() to service_role;

grant EXECUTE on function public.fn_cancel_deal(p_sales_cycle_id uuid, p_canceled_reason text) to authenticated;

grant EXECUTE on function public.fn_cancel_deal(p_sales_cycle_id uuid, p_canceled_reason text) to service_role;

grant EXECUTE on function public.fn_is_real_work_event(p_event_type text, p_metadata jsonb) to anon;

grant EXECUTE on function public.fn_is_real_work_event(p_event_type text, p_metadata jsonb) to authenticated;

grant EXECUTE on function public.fn_is_real_work_event(p_event_type text, p_metadata jsonb) to public;

grant EXECUTE on function public.fn_is_real_work_event(p_event_type text, p_metadata jsonb) to service_role;

grant EXECUTE on function public.fn_log_status_change() to authenticated;

grant EXECUTE on function public.fn_log_status_change() to service_role;

grant EXECUTE on function public.fn_mark_deal_lost(p_sales_cycle_id uuid, p_lost_reason text, p_lost_owner_user_id uuid) to authenticated;

grant EXECUTE on function public.fn_mark_deal_lost(p_sales_cycle_id uuid, p_lost_reason text, p_lost_owner_user_id uuid) to service_role;

grant EXECUTE on function public.fn_mark_deal_won(p_sales_cycle_id uuid, p_won_owner_user_id uuid, p_won_total numeric, p_won_items integer, p_won_note text) to authenticated;

grant EXECUTE on function public.fn_mark_deal_won(p_sales_cycle_id uuid, p_won_owner_user_id uuid, p_won_total numeric, p_won_items integer, p_won_note text) to service_role;

grant EXECUTE on function public.fn_pause_deal(p_sales_cycle_id uuid, p_paused_reason text) to authenticated;

grant EXECUTE on function public.fn_pause_deal(p_sales_cycle_id uuid, p_paused_reason text) to service_role;

grant EXECUTE on function public.fn_products_updated_at() to authenticated;

grant EXECUTE on function public.fn_products_updated_at() to service_role;

grant EXECUTE on function public.fn_resume_deal(p_sales_cycle_id uuid, p_new_status text) to authenticated;

grant EXECUTE on function public.fn_resume_deal(p_sales_cycle_id uuid, p_new_status text) to service_role;

grant EXECUTE on function public.fn_set_user_role(p_user_id uuid, p_role text) to authenticated;

grant EXECUTE on function public.fn_set_user_role(p_user_id uuid, p_role text) to service_role;

grant EXECUTE on function public.fn_set_user_role_for_company(p_company_id uuid, p_user_id uuid, p_role text) to authenticated;

grant EXECUTE on function public.fn_set_user_role_for_company(p_company_id uuid, p_user_id uuid, p_role text) to service_role;

grant EXECUTE on function public.gargalo_funil(empresa_id uuid) to authenticated;

grant EXECUTE on function public.gargalo_funil(empresa_id uuid) to service_role;

grant EXECUTE on function public.get_avg_ticket_won(p_company_id uuid, p_days integer) to authenticated;

grant EXECUTE on function public.get_avg_ticket_won(p_company_id uuid, p_days integer) to service_role;

grant EXECUTE on function public.get_company_members_count(p_company_id uuid) to authenticated;

grant EXECUTE on function public.get_company_members_count(p_company_id uuid) to service_role;

grant EXECUTE on function public.get_funnel_metrics(p_company_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_owner_id uuid, p_goal_closed integer) to authenticated;

grant EXECUTE on function public.get_funnel_metrics(p_company_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_owner_id uuid, p_goal_closed integer) to service_role;

grant EXECUTE on function public.get_funnel_metrics_for_profiles(p_company_id uuid, p_profile_ids uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_goal_closed integer) to authenticated;

grant EXECUTE on function public.get_funnel_metrics_for_profiles(p_company_id uuid, p_profile_ids uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_goal_closed integer) to service_role;

grant EXECUTE on function public.get_funnel_metrics_group(p_company_id uuid, p_owner_ids uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_goal_closed integer) to authenticated;

grant EXECUTE on function public.get_funnel_metrics_group(p_company_id uuid, p_owner_ids uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_goal_closed integer) to service_role;

grant EXECUTE on function public.get_goal_simulation_stats(p_company_id uuid, p_start_date date, p_end_date date, p_owner_id uuid) to service_role;

grant EXECUTE on function public.get_goal_simulation_stats_v2(p_company_id uuid, p_start_date date, p_end_date date, p_owner_id uuid) to service_role;

grant EXECUTE on function public.get_user_company_memberships() to authenticated;

grant EXECUTE on function public.get_user_company_memberships() to service_role;

grant EXECUTE on function public.handle_lead_event_period_activity() to service_role;

grant EXECUTE on function public.handle_lead_status_period_activity() to service_role;

grant EXECUTE on function public.handle_new_user() to service_role;

grant EXECUTE on function public.handle_sales_cycle_closed_at() to service_role;

grant EXECUTE on function public.handle_sales_cycle_period_activity() to service_role;

grant EXECUTE on function public.handle_won_columns_freeze() to service_role;

grant EXECUTE on function public.handle_won_columns_reset() to service_role;

grant EXECUTE on function public.has_active_company_membership(p_company_id uuid, p_roles text[]) to authenticated;

grant EXECUTE on function public.has_active_company_membership(p_company_id uuid, p_roles text[]) to service_role;

grant EXECUTE on function public.has_company_membership_strict(p_company_id uuid, p_roles text[]) to authenticated;

grant EXECUTE on function public.has_company_membership_strict(p_company_id uuid, p_roles text[]) to service_role;

grant EXECUTE on function public.is_admin() to authenticated;

grant EXECUTE on function public.is_admin() to service_role;

grant EXECUTE on function public.is_admin_or_manager() to authenticated;

grant EXECUTE on function public.is_admin_or_manager() to service_role;

grant EXECUTE on function public.is_company_admin(p_company_id uuid) to authenticated;

grant EXECUTE on function public.is_company_admin(p_company_id uuid) to service_role;

grant EXECUTE on function public.is_platform_admin_active() to authenticated;

grant EXECUTE on function public.is_platform_admin_active() to service_role;

grant EXECUTE on function public.log_lead_stage_change() to service_role;

grant EXECUTE on function public.log_lead_status_change() to service_role;

grant EXECUTE on function public.next_user_code(p_company_id uuid) to service_role;

grant EXECUTE on function public.profiles_set_user_code() to service_role;

grant EXECUTE on function public.reassign_owner_leads(p_company_id uuid, p_from_owner_id uuid, p_to_owner_id uuid, p_limit integer, p_status text, p_search text, p_order_mode text) to service_role;

grant EXECUTE on function public.report_ai_top_next_actions(p_company_id uuid, p_since timestamp with time zone, p_user_id uuid, p_limit integer) to authenticated;

grant EXECUTE on function public.report_ai_top_next_actions(p_company_id uuid, p_since timestamp with time zone, p_user_id uuid, p_limit integer) to service_role;

grant EXECUTE on function public.report_ai_top_objections(p_company_id uuid, p_since timestamp with time zone, p_user_id uuid, p_limit integer) to authenticated;

grant EXECUTE on function public.report_ai_top_objections(p_company_id uuid, p_since timestamp with time zone, p_user_id uuid, p_limit integer) to service_role;

grant EXECUTE on function public.report_meta_vs_real(p_company_id uuid, p_start_date date, p_end_date date) to authenticated;

grant EXECUTE on function public.report_meta_vs_real(p_company_id uuid, p_start_date date, p_end_date date) to service_role;

grant EXECUTE on function public.report_sla_risk(p_company_id uuid) to authenticated;

grant EXECUTE on function public.report_sla_risk(p_company_id uuid) to service_role;

grant EXECUTE on function public.report_stage_conversion(p_company_id uuid) to authenticated;

grant EXECUTE on function public.report_stage_conversion(p_company_id uuid) to service_role;

grant EXECUTE on function public.report_stage_conversion_for_period(p_company_id uuid, p_date_start date, p_date_end date) to authenticated;

grant EXECUTE on function public.report_stage_conversion_for_period(p_company_id uuid, p_date_start date, p_date_end date) to service_role;

grant EXECUTE on function public.report_stage_losses(p_company_id uuid) to authenticated;

grant EXECUTE on function public.report_stage_losses(p_company_id uuid) to service_role;

grant EXECUTE on function public.report_stage_losses_for_period(p_company_id uuid, p_date_start date, p_date_end date) to authenticated;

grant EXECUTE on function public.report_stage_losses_for_period(p_company_id uuid, p_date_start date, p_date_end date) to service_role;

grant EXECUTE on function public.report_stage_time_summary(p_company_id uuid) to authenticated;

grant EXECUTE on function public.report_stage_time_summary(p_company_id uuid) to service_role;

grant EXECUTE on function public.report_stage_time_summary_for_period(p_company_id uuid, p_date_start date, p_date_end date) to authenticated;

grant EXECUTE on function public.report_stage_time_summary_for_period(p_company_id uuid, p_date_start date, p_date_end date) to service_role;

grant EXECUTE on function public.return_owner_leads_to_pool(p_company_id uuid, p_owner_id uuid, p_limit integer, p_status text, p_search text) to service_role;

grant EXECUTE on function public.round_robin_from_owner_leads(p_company_id uuid, p_from_owner_id uuid, p_seller_ids uuid[], p_limit integer, p_status text, p_search text, p_order_mode text) to service_role;

grant EXECUTE on function public.rpc_admin_list_sellers_stats(p_days integer) to service_role;

grant EXECUTE on function public.rpc_admin_list_sellers_stats_for_company(p_company_id uuid, p_days integer) to authenticated;

grant EXECUTE on function public.rpc_admin_list_sellers_stats_for_company(p_company_id uuid, p_days integer) to service_role;

grant EXECUTE on function public.rpc_admin_update_seller_access(p_seller_id uuid, p_role text, p_is_active boolean) to service_role;

grant EXECUTE on function public.rpc_admin_update_seller_access_for_company(p_company_id uuid, p_seller_id uuid, p_role text, p_is_active boolean) to authenticated;

grant EXECUTE on function public.rpc_admin_update_seller_access_for_company(p_company_id uuid, p_seller_id uuid, p_role text, p_is_active boolean) to service_role;

grant EXECUTE on function public.rpc_apply_ai_open_suggestion(p_cycle_id uuid, p_to_status text, p_next_action text, p_next_action_date timestamp with time zone, p_summary text, p_suggestion jsonb, p_source text) to service_role;

grant EXECUTE on function public.rpc_apply_ai_open_suggestion_for_company(p_company_id uuid, p_cycle_id uuid, p_to_status text, p_next_action text, p_next_action_date timestamp with time zone, p_summary text, p_suggestion jsonb, p_source text) to authenticated;

grant EXECUTE on function public.rpc_apply_ai_open_suggestion_for_company(p_company_id uuid, p_cycle_id uuid, p_to_status text, p_next_action text, p_next_action_date timestamp with time zone, p_summary text, p_suggestion jsonb, p_source text) to service_role;

grant EXECUTE on function public.rpc_assign_cycle_owner(p_cycle_id uuid, p_owner_user_id uuid) to service_role;

grant EXECUTE on function public.rpc_assign_cycle_owner_for_company(p_company_id uuid, p_cycle_id uuid, p_owner_user_id uuid) to authenticated;

grant EXECUTE on function public.rpc_assign_cycle_owner_for_company(p_company_id uuid, p_cycle_id uuid, p_owner_user_id uuid) to service_role;

grant EXECUTE on function public.rpc_bulk_assign_cycles_owner(p_cycle_ids uuid[], p_owner_user_id uuid) to service_role;

grant EXECUTE on function public.rpc_bulk_assign_round_robin(p_cycle_ids uuid[], p_owner_ids uuid[]) to service_role;

grant EXECUTE on function public.rpc_bulk_import_cycles(p_leads jsonb[], p_group_id uuid, p_owner_user_id uuid) to service_role;

grant EXECUTE on function public.rpc_bulk_reassign_cycles_owner(p_cycle_ids uuid[], p_owner_user_id uuid) to service_role;

grant EXECUTE on function public.rpc_bulk_return_cycles_to_pool(p_cycle_ids uuid[]) to service_role;

grant EXECUTE on function public.rpc_bulk_return_cycles_to_pool_self(p_cycle_ids uuid[]) to service_role;

grant EXECUTE on function public.rpc_bulk_return_group_to_pool(p_group_id uuid) to service_role;

grant EXECUTE on function public.rpc_bulk_set_cycles_group(p_cycle_ids uuid[], p_group_id uuid) to service_role;

grant EXECUTE on function public.rpc_close_cycle_lost(p_cycle_id uuid, p_lost_reason text, p_note text, p_action_channel text) to service_role;

grant EXECUTE on function public.rpc_close_cycle_lost_for_company(p_company_id uuid, p_cycle_id uuid, p_lost_reason text, p_note text, p_action_channel text) to authenticated;

grant EXECUTE on function public.rpc_close_cycle_lost_for_company(p_company_id uuid, p_cycle_id uuid, p_lost_reason text, p_note text, p_action_channel text) to service_role;

grant EXECUTE on function public.rpc_close_cycle_won(p_cycle_id uuid, p_won_value numeric, p_revenue_date_ref date, p_won_note text, p_product_id uuid, p_won_unit_price numeric, p_payment_method text, p_payment_type text, p_entry_amount numeric, p_installments_count integer, p_installment_amount numeric, p_payment_notes text) to service_role;

grant EXECUTE on function public.rpc_close_cycle_won_for_company(p_company_id uuid, p_cycle_id uuid, p_won_value numeric, p_revenue_date_ref date, p_won_note text, p_product_id uuid, p_won_unit_price numeric, p_payment_method text, p_payment_type text, p_entry_amount numeric, p_installments_count integer, p_installment_amount numeric, p_payment_notes text) to authenticated;

grant EXECUTE on function public.rpc_close_cycle_won_for_company(p_company_id uuid, p_cycle_id uuid, p_won_value numeric, p_revenue_date_ref date, p_won_note text, p_product_id uuid, p_won_unit_price numeric, p_payment_method text, p_payment_type text, p_entry_amount numeric, p_installments_count integer, p_installment_amount numeric, p_payment_notes text) to service_role;

grant EXECUTE on function public.rpc_create_lead_and_cycle(p_company_id uuid, p_name text, p_phone text, p_owner_user_id uuid, p_status text) to authenticated;

grant EXECUTE on function public.rpc_create_lead_and_cycle(p_company_id uuid, p_name text, p_phone text, p_owner_user_id uuid, p_status text) to service_role;

grant EXECUTE on function public.rpc_create_lead_and_cycle(p_lead jsonb, p_group_id uuid, p_owner_user_id uuid) to authenticated;

grant EXECUTE on function public.rpc_create_lead_and_cycle(p_lead jsonb, p_group_id uuid, p_owner_user_id uuid) to service_role;

grant EXECUTE on function public.rpc_create_lead_group(p_name text) to service_role;

grant EXECUTE on function public.rpc_create_revenue_extra_source(p_name text) to service_role;

grant EXECUTE on function public.rpc_create_revenue_extra_source_for_company(p_company_id uuid, p_name text) to authenticated;

grant EXECUTE on function public.rpc_create_revenue_extra_source_for_company(p_company_id uuid, p_name text) to service_role;

grant EXECUTE on function public.rpc_create_successor_cycle_for_company(p_company_id uuid, p_source_cycle_id uuid, p_opportunity_type text, p_assignment_mode text, p_owner_user_id uuid, p_group_id uuid, p_note text) to anon;

grant EXECUTE on function public.rpc_create_successor_cycle_for_company(p_company_id uuid, p_source_cycle_id uuid, p_opportunity_type text, p_assignment_mode text, p_owner_user_id uuid, p_group_id uuid, p_note text) to authenticated;

grant EXECUTE on function public.rpc_create_successor_cycle_for_company(p_company_id uuid, p_source_cycle_id uuid, p_opportunity_type text, p_assignment_mode text, p_owner_user_id uuid, p_group_id uuid, p_note text) to service_role;

grant EXECUTE on function public.rpc_cycles_status_totals(p_owner_user_id uuid, p_group_id uuid, p_search_term text) to service_role;

grant EXECUTE on function public.rpc_delete_lead(p_lead_id uuid, p_company_id uuid) to authenticated;

grant EXECUTE on function public.rpc_delete_lead(p_lead_id uuid, p_company_id uuid) to service_role;

grant EXECUTE on function public.rpc_distribute_group_pool_round_robin(p_group_id uuid, p_owner_ids uuid[]) to service_role;

grant EXECUTE on function public.rpc_get_active_competency() to service_role;

grant EXECUTE on function public.rpc_get_close_rate_real(p_owner_user_id uuid, p_days_window integer) to service_role;

grant EXECUTE on function public.rpc_get_close_rate_real_for_company(p_company_id uuid, p_owner_user_id uuid, p_days_window integer) to authenticated;

grant EXECUTE on function public.rpc_get_close_rate_real_for_company(p_company_id uuid, p_owner_user_id uuid, p_days_window integer) to service_role;

grant EXECUTE on function public.rpc_get_company_sla_rules() to authenticated;

grant EXECUTE on function public.rpc_get_company_sla_rules() to service_role;

grant EXECUTE on function public.rpc_get_company_sla_rules_for_company(p_company_id uuid) to authenticated;

grant EXECUTE on function public.rpc_get_company_sla_rules_for_company(p_company_id uuid) to service_role;

grant EXECUTE on function public.rpc_get_cycle_ai_context(p_cycle_id uuid, p_events_limit integer) to service_role;

grant EXECUTE on function public.rpc_get_cycle_ai_context_for_company(p_company_id uuid, p_cycle_id uuid, p_events_limit integer) to authenticated;

grant EXECUTE on function public.rpc_get_cycle_ai_context_for_company(p_company_id uuid, p_cycle_id uuid, p_events_limit integer) to service_role;

grant EXECUTE on function public.rpc_get_cycle_last_events(p_cycle_id uuid, p_limit integer) to service_role;

grant EXECUTE on function public.rpc_get_monthly_worked_opportunities(p_company_id uuid, p_owner_user_id uuid, p_month date) to anon;

grant EXECUTE on function public.rpc_get_monthly_worked_opportunities(p_company_id uuid, p_owner_user_id uuid, p_month date) to authenticated;

grant EXECUTE on function public.rpc_get_monthly_worked_opportunities(p_company_id uuid, p_owner_user_id uuid, p_month date) to service_role;

grant EXECUTE on function public.rpc_get_pool_cycles(p_limit integer, p_offset integer) to authenticated;

grant EXECUTE on function public.rpc_get_pool_cycles(p_limit integer, p_offset integer) to service_role;

grant EXECUTE on function public.rpc_get_revenue_goal(p_company_id uuid, p_owner_id uuid, p_date_start date, p_date_end date) to authenticated;

grant EXECUTE on function public.rpc_get_revenue_goal(p_company_id uuid, p_owner_id uuid, p_date_start date, p_date_end date) to service_role;

grant EXECUTE on function public.rpc_get_revenue_period_summary(p_owner_user_id uuid) to service_role;

grant EXECUTE on function public.rpc_get_sales_cycle_metrics_v1(p_owner_user_id uuid, p_month date) to service_role;

grant EXECUTE on function public.rpc_get_sales_cycle_metrics_v1_for_company(p_company_id uuid, p_owner_user_id uuid, p_month date) to anon;

grant EXECUTE on function public.rpc_get_sales_cycle_metrics_v1_for_company(p_company_id uuid, p_owner_user_id uuid, p_month date) to authenticated;

grant EXECUTE on function public.rpc_get_sales_cycle_metrics_v1_for_company(p_company_id uuid, p_owner_user_id uuid, p_month date) to public;

grant EXECUTE on function public.rpc_get_sales_cycle_metrics_v1_for_company(p_company_id uuid, p_owner_user_id uuid, p_month date) to service_role;

grant EXECUTE on function public.rpc_get_sales_cycle_metrics_v1_for_company_base(p_company_id uuid, p_owner_user_id uuid, p_month date) to authenticated;

grant EXECUTE on function public.rpc_get_sales_cycle_metrics_v1_for_company_base(p_company_id uuid, p_owner_user_id uuid, p_month date) to service_role;

grant EXECUTE on function public.rpc_get_simulator_period_metrics(p_owner_user_id uuid) to service_role;

grant EXECUTE on function public.rpc_get_user_sales_cycles(p_owner_user_id uuid, p_status text, p_limit integer, p_offset integer) to authenticated;

grant EXECUTE on function public.rpc_get_user_sales_cycles(p_owner_user_id uuid, p_status text, p_limit integer, p_offset integer) to service_role;

grant EXECUTE on function public.rpc_ingest_site_lead(p_company_id uuid, p_created_by uuid, p_api_key_id uuid, p_source text, p_name text, p_phone text, p_email text, p_document text, p_notes text, p_campaign_name text, p_external_key text, p_external_id text, p_metadata jsonb) to service_role;

grant EXECUTE on function public.rpc_list_ai_coaching_for_cycle_for_company(p_company_id uuid, p_cycle_id uuid, p_limit integer) to anon;

grant EXECUTE on function public.rpc_list_ai_coaching_for_cycle_for_company(p_company_id uuid, p_cycle_id uuid, p_limit integer) to authenticated;

grant EXECUTE on function public.rpc_list_ai_coaching_for_cycle_for_company(p_company_id uuid, p_cycle_id uuid, p_limit integer) to service_role;

grant EXECUTE on function public.rpc_log_ai_analysis(p_cycle_id uuid, p_suggestion jsonb, p_conversation_excerpt text) to service_role;

grant EXECUTE on function public.rpc_log_ai_suggestion_applied(p_cycle_id uuid, p_payload jsonb) to service_role;

grant EXECUTE on function public.rpc_log_ai_suggestion_rejected(p_cycle_id uuid, p_payload jsonb) to service_role;

grant EXECUTE on function public.rpc_move_cycle_stage(p_cycle_id uuid, p_to_status text, p_metadata jsonb) to service_role;

grant EXECUTE on function public.rpc_move_cycle_stage_checkpoint(p_cycle_id uuid, p_to_status text, p_checkpoint jsonb) to service_role;

grant EXECUTE on function public.rpc_move_cycle_stage_checkpoint_for_company(p_company_id uuid, p_cycle_id uuid, p_to_status text, p_checkpoint jsonb) to authenticated;

grant EXECUTE on function public.rpc_move_cycle_stage_checkpoint_for_company(p_company_id uuid, p_cycle_id uuid, p_to_status text, p_checkpoint jsonb) to service_role;

grant EXECUTE on function public.rpc_move_cycle_stage_for_company(p_company_id uuid, p_cycle_id uuid, p_to_status text, p_metadata jsonb) to authenticated;

grant EXECUTE on function public.rpc_move_cycle_stage_for_company(p_company_id uuid, p_cycle_id uuid, p_to_status text, p_metadata jsonb) to service_role;

grant EXECUTE on function public.rpc_open_next_monthly_competency() to service_role;

grant EXECUTE on function public.rpc_platform_set_company_status(p_company_id uuid, p_platform_status text) to anon;

grant EXECUTE on function public.rpc_platform_set_company_status(p_company_id uuid, p_platform_status text) to authenticated;

grant EXECUTE on function public.rpc_platform_set_company_status(p_company_id uuid, p_platform_status text) to service_role;

grant EXECUTE on function public.rpc_reassign_cycle_owner(p_cycle_id uuid, p_owner_user_id uuid) to service_role;

grant EXECUTE on function public.rpc_recall_group_to_pool(p_group_id uuid) to service_role;

grant EXECUTE on function public.rpc_register_cycle_won(p_cycle_id uuid, p_won_total numeric, p_won_items integer, p_won_note text) to service_role;

grant EXECUTE on function public.rpc_report_period_summary() to service_role;

grant EXECUTE on function public.rpc_reset_cycle_state_on_assignment(p_cycle_id uuid, p_new_owner_user_id uuid) to service_role;

grant EXECUTE on function public.rpc_return_cycle_to_pool(p_cycle_id uuid) to service_role;

grant EXECUTE on function public.rpc_return_cycle_to_pool_with_reason(p_cycle_id uuid, p_reason text, p_details text) to service_role;

grant EXECUTE on function public.rpc_revenue_sales_details_by_day(p_ref_date date, p_owner_id uuid) to service_role;

grant EXECUTE on function public.rpc_revenue_sales_details_by_day_for_company(p_company_id uuid, p_ref_date date, p_owner_id uuid) to authenticated;

grant EXECUTE on function public.rpc_revenue_sales_details_by_day_for_company(p_company_id uuid, p_ref_date date, p_owner_id uuid) to service_role;

grant EXECUTE on function public.rpc_revenue_summary(p_company_id uuid, p_owner_id uuid, p_start_date date, p_end_date date, p_metric text) to authenticated;

grant EXECUTE on function public.rpc_revenue_summary(p_company_id uuid, p_owner_id uuid, p_start_date date, p_end_date date, p_metric text) to service_role;

grant EXECUTE on function public.rpc_save_ai_coaching_for_company(p_company_id uuid, p_cycle_id uuid, p_coaching jsonb, p_yolen_decision jsonb, p_source text) to anon;

grant EXECUTE on function public.rpc_save_ai_coaching_for_company(p_company_id uuid, p_cycle_id uuid, p_coaching jsonb, p_yolen_decision jsonb, p_source text) to authenticated;

grant EXECUTE on function public.rpc_save_ai_coaching_for_company(p_company_id uuid, p_cycle_id uuid, p_coaching jsonb, p_yolen_decision jsonb, p_source text) to service_role;

grant EXECUTE on function public.rpc_seller_micro_kpis(p_owner_user_id uuid, p_days integer) to authenticated;

grant EXECUTE on function public.rpc_seller_micro_kpis(p_owner_user_id uuid, p_days integer) to service_role;

grant EXECUTE on function public.rpc_seller_worklist(p_owner_user_id uuid, p_group_id uuid, p_limit integer) to service_role;

grant EXECUTE on function public.rpc_set_cycle_group(p_cycle_id uuid, p_group_id uuid) to service_role;

grant EXECUTE on function public.rpc_set_next_action(p_cycle_id uuid, p_next_action text, p_next_action_date timestamp with time zone) to service_role;

grant EXECUTE on function public.rpc_set_next_action_for_company(p_company_id uuid, p_cycle_id uuid, p_next_action text, p_next_action_date timestamp with time zone) to authenticated;

grant EXECUTE on function public.rpc_set_next_action_for_company(p_company_id uuid, p_cycle_id uuid, p_next_action text, p_next_action_date timestamp with time zone) to service_role;

grant EXECUTE on function public.rpc_simulator_group_conversion(p_company_id uuid, p_owner_id uuid, p_date_start date, p_date_end date) to authenticated;

grant EXECUTE on function public.rpc_simulator_group_conversion(p_company_id uuid, p_owner_id uuid, p_date_start date, p_date_end date) to service_role;

grant EXECUTE on function public.rpc_touch_cycle_in_current_competency(p_cycle_id uuid, p_touch_type text, p_touch_at timestamp with time zone, p_won_total numeric) to service_role;

grant EXECUTE on function public.rpc_touch_lead_in_current_competency(p_lead_id uuid, p_touch_type text, p_touch_at timestamp with time zone, p_won_total numeric) to service_role;

grant EXECUTE on function public.rpc_upsert_company_sla_rules(p_rules jsonb) to authenticated;

grant EXECUTE on function public.rpc_upsert_company_sla_rules(p_rules jsonb) to service_role;

grant EXECUTE on function public.rpc_upsert_revenue_daily_override(p_source_kind text, p_source_id uuid, p_ref_date date, p_real_value numeric, p_reason text, p_notes text) to service_role;

grant EXECUTE on function public.rpc_upsert_revenue_daily_override_for_company(p_company_id uuid, p_source_kind text, p_source_id uuid, p_ref_date date, p_real_value numeric, p_reason text, p_notes text) to authenticated;

grant EXECUTE on function public.rpc_upsert_revenue_daily_override_for_company(p_company_id uuid, p_source_kind text, p_source_id uuid, p_ref_date date, p_real_value numeric, p_reason text, p_notes text) to service_role;

grant EXECUTE on function public.rpc_upsert_revenue_goal(p_company_id uuid, p_owner_id uuid, p_date_start date, p_date_end date, p_goal_value numeric) to service_role;

grant EXECUTE on function public.rpc_upsert_revenue_goal(p_company_id uuid, p_owner_id uuid, p_date_start date, p_date_end date, p_goal_value numeric, p_ticket_medio numeric) to authenticated;

grant EXECUTE on function public.rpc_upsert_revenue_goal(p_company_id uuid, p_owner_id uuid, p_date_start date, p_date_end date, p_goal_value numeric, p_ticket_medio numeric) to service_role;

grant EXECUTE on function public.seller_get_context() to authenticated;

grant EXECUTE on function public.seller_get_context() to service_role;

grant EXECUTE on function public.seller_move_lead_stage(p_company_id uuid, p_lead_id uuid, p_to_status text, p_reason text, p_deal_value numeric, p_to_stage_id uuid) to service_role;

grant EXECUTE on function public.set_company_memberships_updated_at() to authenticated;

grant EXECUTE on function public.set_company_memberships_updated_at() to service_role;

grant EXECUTE on function public.set_execution_day_calendars_updated_at() to service_role;

grant EXECUTE on function public.set_updated_at() to authenticated;

grant EXECUTE on function public.set_updated_at() to service_role;

grant EXECUTE on function public.sync_profile_email() to service_role;

grant EXECUTE on function public.tempo_medio_por_etapa(empresa_id uuid) to authenticated;

grant EXECUTE on function public.tempo_medio_por_etapa(empresa_id uuid) to service_role;

grant EXECUTE on function public.trg_set_first_worked_at() to anon;

grant EXECUTE on function public.trg_set_first_worked_at() to authenticated;

grant EXECUTE on function public.trg_set_first_worked_at() to public;

grant EXECUTE on function public.trg_set_first_worked_at() to service_role;

grant EXECUTE on function public.trg_set_updated_at() to authenticated;

grant EXECUTE on function public.trg_set_updated_at() to service_role;

grant EXECUTE on function public.update_updated_at_column() to service_role;

reset check_function_bodies;

commit;
