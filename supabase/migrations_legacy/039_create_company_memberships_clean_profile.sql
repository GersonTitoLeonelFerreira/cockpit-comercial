-- Fase 3C.7A — Base limpa para multiempresa por usuário
-- Objetivo:
-- 1. Transformar public.profiles em perfil global do usuário.
-- 2. Criar public.company_memberships como fonte oficial de vínculo usuário/empresa.
-- 3. Migrar vínculos atuais de profiles.company_id/role/is_active para company_memberships.
-- 4. Criar funções novas para permissão por empresa.
-- 5. Ajustar handle_new_user para não prender mais o usuário a uma empresa única.
--
-- Regra arquitetural:
-- auth.users = identidade de login
-- profiles = perfil global
-- company_memberships = vínculo usuário/empresa/permissão
-- companies = empresa cliente

-- ---------------------------------------------------------------------------
-- 1. Garantir colunas globais em profiles
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active_global boolean NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

UPDATE public.profiles
   SET is_active_global = COALESCE(is_active_global, is_active, true)
 WHERE is_active_global IS NULL;

UPDATE public.profiles
   SET email = NULLIF(BTRIM(email), '')
 WHERE email IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN company_id DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN role DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN is_active DROP NOT NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Criar tabela oficial de vínculo usuário/empresa
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.company_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  role text NOT NULL DEFAULT 'member',
  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT company_memberships_role_check
    CHECK (role IN ('admin', 'manager', 'member')),

  CONSTRAINT company_memberships_company_user_unique
    UNIQUE (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_memberships_user_id
  ON public.company_memberships(user_id);

CREATE INDEX IF NOT EXISTS idx_company_memberships_company_id
  ON public.company_memberships(company_id);

CREATE INDEX IF NOT EXISTS idx_company_memberships_company_role_active
  ON public.company_memberships(company_id, role, is_active);

CREATE INDEX IF NOT EXISTS idx_company_memberships_user_active
  ON public.company_memberships(user_id, is_active);

-- ---------------------------------------------------------------------------
-- 3. Trigger de updated_at para company_memberships
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_company_memberships_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_company_memberships_updated_at
  ON public.company_memberships;

CREATE TRIGGER trg_company_memberships_updated_at
BEFORE UPDATE ON public.company_memberships
FOR EACH ROW
EXECUTE FUNCTION public.set_company_memberships_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Migrar vínculos existentes de profiles para company_memberships
-- ---------------------------------------------------------------------------

INSERT INTO public.company_memberships (
  company_id,
  user_id,
  role,
  is_active,
  created_at,
  updated_at,
  metadata
)
SELECT
  p.company_id,
  p.id AS user_id,
  CASE
    WHEN LOWER(BTRIM(COALESCE(p.role, 'member'))) IN ('admin', 'manager', 'member')
      THEN LOWER(BTRIM(COALESCE(p.role, 'member')))
    WHEN LOWER(BTRIM(COALESCE(p.role, 'member'))) IN ('seller', 'consultor', 'user')
      THEN 'member'
    ELSE 'member'
  END AS role,
  COALESCE(p.is_active, p.is_active_global, true) AS is_active,
  COALESCE(p.created_at, now()) AS created_at,
  now() AS updated_at,
  jsonb_build_object(
    'source', 'migration_039_from_profiles',
    'legacy_company_id', p.company_id,
    'legacy_role', p.role,
    'legacy_is_active', p.is_active
  ) AS metadata
FROM public.profiles p
WHERE p.company_id IS NOT NULL
ON CONFLICT (company_id, user_id) DO UPDATE
SET
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active,
  updated_at = now(),
  metadata = public.company_memberships.metadata || EXCLUDED.metadata;

-- ---------------------------------------------------------------------------
-- 5. RLS da tabela company_memberships
-- ---------------------------------------------------------------------------

ALTER TABLE public.company_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_memberships_select_self_or_platform_admin
  ON public.company_memberships;

CREATE POLICY company_memberships_select_self_or_platform_admin
  ON public.company_memberships
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_platform_admin = true
        AND COALESCE(p.is_active_global, true) = true
    )
  );

DROP POLICY IF EXISTS company_memberships_insert_platform_admin
  ON public.company_memberships;

CREATE POLICY company_memberships_insert_platform_admin
  ON public.company_memberships
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_platform_admin = true
        AND COALESCE(p.is_active_global, true) = true
    )
  );

DROP POLICY IF EXISTS company_memberships_update_platform_admin
  ON public.company_memberships;

CREATE POLICY company_memberships_update_platform_admin
  ON public.company_memberships
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_platform_admin = true
        AND COALESCE(p.is_active_global, true) = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_platform_admin = true
        AND COALESCE(p.is_active_global, true) = true
    )
  );

DROP POLICY IF EXISTS company_memberships_delete_platform_admin
  ON public.company_memberships;

CREATE POLICY company_memberships_delete_platform_admin
  ON public.company_memberships
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_platform_admin = true
        AND COALESCE(p.is_active_global, true) = true
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Funções novas de permissão por empresa
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_active_company_membership(
  p_company_id uuid,
  p_roles text[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
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
$function$;

CREATE OR REPLACE FUNCTION public.is_company_admin(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
  SELECT public.has_active_company_membership(p_company_id, ARRAY['admin']);
$function$;

CREATE OR REPLACE FUNCTION public.get_user_company_memberships()
RETURNS TABLE (
  company_id uuid,
  company_name text,
  trade_name text,
  legal_name text,
  role text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
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
$function$;

-- ---------------------------------------------------------------------------
-- 7. Ajustar handle_new_user para perfil global
-- ---------------------------------------------------------------------------

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
$function$;

-- ---------------------------------------------------------------------------
-- 8. Comentários de governança
-- ---------------------------------------------------------------------------

COMMENT ON TABLE public.company_memberships IS
  'Fonte oficial de vínculo entre usuário global e empresa cliente. Substitui o uso operacional de profiles.company_id, profiles.role e profiles.is_active.';

COMMENT ON COLUMN public.profiles.is_active_global IS
  'Status global da identidade do usuário. Status por empresa deve ficar em company_memberships.is_active.';

COMMENT ON FUNCTION public.has_active_company_membership(uuid, text[]) IS
  'Verifica se o usuário autenticado possui vínculo ativo com uma empresa, opcionalmente limitado por roles. Platform admin ativo passa pela verificação.';

COMMENT ON FUNCTION public.get_user_company_memberships() IS
  'Lista empresas ativas que o usuário autenticado pode acessar. Base para tela de seleção de empresa pós-login.';