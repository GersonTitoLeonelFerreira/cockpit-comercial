# Governança de RLS — Cockpit Comercial

> **Documento de referência para desenvolvedores** sobre as regras de segurança em nível de linha (Row Level Security) implementadas no banco de dados Supabase do sistema.

---

## 1. Regra Principal: `is_active` como Kill Switch

O campo `profiles.is_active` é o **kill switch de segurança** do sistema.

| `is_active` | Resultado |
|-------------|-----------|
| `true`      | `current_company_id()` retorna o `company_id` do usuário → acesso normal via RLS |
| `false`     | `current_company_id()` retorna `NULL` → **zero acesso** a qualquer tabela protegida por RLS |

Quando um vendedor é desativado (`is_active = false`), ele **não precisa ter sua sessão encerrada** no Supabase Auth. O RLS bloqueia automaticamente todas as queries, pois as policies exigem que `current_company_id()` não seja NULL.

---

## 2. Funções Helper Críticas

Todas as funções helper verificam `is_active = true`. **Nunca remova essa verificação.**

### `current_company_id()`

```sql
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT company_id
  FROM public.profiles
  WHERE id = auth.uid()
    AND is_active = true
$$;
```

Retorna `NULL` se o usuário não existir, não tiver `company_id` ou `is_active = false`.  
Usada em praticamente **todas as policies RLS** do sistema.

---

### `is_admin()`

```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  )
$$;
```

Retorna `false` se o usuário estiver inativo, independentemente do `role`.

---

### `is_admin_or_manager()`

```sql
CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
      AND is_active = true
  )
$$;
```

---

## 3. ⚠️ Aviso para Desenvolvedores

> **NUNCA remover a verificação `AND is_active = true` das funções helper.**
>
> Essa condição é o **kill switch de segurança** do sistema. Sem ela, usuários desativados continuariam tendo acesso a todos os dados da empresa enquanto tiverem sessão ativa no Supabase Auth.
>
> Se precisar criar uma nova função helper que consulte `profiles`, **sempre inclua `AND is_active = true`** como filtro obrigatório.

---

## 4. RPCs Admin-Only

As RPCs que realizam operações administrativas têm acesso restrito:

- **Revogadas de `PUBLIC` e `anon`**: `REVOKE ALL ON FUNCTION <nome> FROM PUBLIC; REVOKE ALL ON FUNCTION <nome> FROM anon;`
- **Grant apenas para `authenticated`**: `GRANT EXECUTE ON FUNCTION <nome> TO authenticated;`
- **Gate interno obrigatório**: todas as RPCs admin verificam `is_admin()` e fazem `RAISE EXCEPTION` se falso:

```sql
IF NOT is_admin() THEN
  RAISE EXCEPTION 'Acesso negado: apenas administradores podem executar esta operação.';
END IF;
```

RPCs admin-only atuais:

| Função | Descrição |
|--------|-----------|
| `rpc_admin_list_sellers_stats()` | Lista vendedores com métricas para o painel admin |
| `rpc_admin_update_seller_access()` | Atualiza `role` e `is_active` de um vendedor com auditoria |

---

## 5. Views: `security_invoker = true`

Todas as views do sistema são criadas com `security_invoker = true`:

```sql
CREATE VIEW public.v_minha_view
WITH (security_invoker = true)
AS
  SELECT ...;
```

Isso garante que as views **herdam o contexto de segurança do usuário** que está fazendo a consulta, em vez de rodar com os privilégios do criador da view. O RLS é aplicado normalmente.

Views sem `security_invoker = true` rodariam como `SECURITY DEFINER` (comportamento padrão do Postgres), o que **bypassaria o RLS**.

---

## 6. Service Role: Uso Intencional Sem RLS

O `service_role` do Supabase **ignora o RLS por design**. Isso é intencional e necessário para:

- **Provisioning**: criação de empresas, configuração inicial de contas
- **Admin APIs**: operações que precisam agir em nome de qualquer usuário (ex.: reset de senha, migração de dados)
- **Background jobs**: tarefas automatizadas que não têm contexto de usuário

> **Nunca exponha a chave `service_role` no frontend ou em variáveis de ambiente acessíveis ao cliente.**  
> Use sempre `NEXT_PUBLIC_SUPABASE_ANON_KEY` no frontend e reserve `SUPABASE_SERVICE_ROLE_KEY` para APIs server-side.

---

## 7. Checklist de Auditoria

Execute periodicamente no SQL Editor do Supabase para garantir que nenhuma brecha foi introduzida:

```sql
-- A) Tabelas sem RLS (deve retornar 0 linhas)
SELECT relname AS tabela
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false;

-- B) Views sem security_invoker (deve retornar 0 linhas)
SELECT viewname
FROM pg_views
WHERE schemaname = 'public'
  AND definition NOT ILIKE '%security_invoker%';

-- C) Policies por tabela
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;
```

---

*Última atualização: Março 2026 — Fase 6 (Admin Gestão de Vendedores)*
