# Governança de RLS - Yolen

> Referência de autorização e isolamento multiempresa do banco Supabase.
> Este documento descreve o banco vivo auditado em 2026-07-29. Ele não
> substitui migrations nem autoriza mudanças diretas em produção.

## 1. Fontes oficiais de autorização

| Fonte | Responsabilidade |
|---|---|
| `profiles` | Identidade global, bloqueio global e platform admin |
| `company_memberships` | Vínculo, papel e ativação do usuário em cada empresa |
| Contexto de empresa ativa da aplicação | Empresa escolhida para a sessão/operação |
| `company_id` do registro | Isolamento da linha operacional |
| Ownership do registro/ciclo | Limitação da carteira do vendedor |

`profiles.company_id`, `profiles.role` e `profiles.is_active` ainda existem por
compatibilidade, mas não são a fonte canônica para autorização multiempresa.
Nova policy ou RPC não pode reintroduzi-los como atalho.

## 2. Invariantes de segurança

Toda leitura ou escrita operacional deve comprovar:

1. `auth.uid()` válido;
2. identidade global ativa quando aplicável;
3. membership ativa na empresa do registro;
4. papel permitido para aquela operação;
5. ownership quando o papel for `member`;
6. igualdade entre a empresa solicitada e `company_id` da linha;
7. regra de exclusão lógica quando a tabela usar `deleted_at`.

`TO authenticated` isoladamente autentica, mas não autoriza acesso a uma
empresa ou registro.

## 3. Empresa ativa

A escolha da empresa ocorre na aplicação. Operações multiempresa devem enviar
o `company_id` explicitamente e validá-lo contra `company_memberships`.

O helper vivo `current_company_id()` retorna uma empresa somente quando o
usuário possui exatamente uma membership ativa. Portanto:

- ele pode atender fluxos legados de empresa única;
- não deve decidir silenciosamente entre várias empresas;
- RPCs novas devem receber a empresa ativa explicitamente;
- a validação deve acontecer novamente no banco.

## 4. Papéis

Papéis por empresa:

| Papel | Escopo esperado |
|---|---|
| `admin` | Administração e operação da empresa |
| `manager` | Gestão operacional e visão da equipe |
| `member` | Própria carteira e operações autorizadas |

Platform admin é global e depende de:

- `profiles.is_platform_admin = true`;
- `profiles.is_active_global = true`.

Um platform admin global não transforma `profiles.role` em fonte oficial.

## 5. Helpers canônicos

### `has_company_membership_strict(company_id, roles)`

Verifica membership ativa na empresa informada e, quando fornecido, papel
permitido. É a base recomendada para autorização por empresa.

### `can_select_lead_base_strict(...)`

Aplica empresa, membership, ownership/criação e exclusão lógica na leitura do
registro-base do lead.

### `can_update_lead_base_strict(...)`

Aplica empresa, membership e ownership na alteração permitida do lead.

### `can_select_sales_cycle_strict(company_id, owner_user_id)`

Permite leitura por admin/manager da empresa ou pelo owner autorizado do ciclo.

### `can_write_sales_cycle_strict(company_id, owner_user_id)`

Controla criação/alteração do ciclo pelo papel e ownership permitidos.

### `is_platform_admin_active()`

Verifica o platform admin global e ativo.

## 6. Helpers que exigem cuidado

### `current_company_id()`

Usa `company_memberships`, mas só retorna valor quando existe exatamente uma
membership ativa. Não representa sozinho a empresa selecionada em uma sessão
multiempresa.

### `is_admin()`

No banco vivo, retorna verdadeiro quando:

- o usuário é platform admin global ativo; ou
- possui alguma membership ativa com papel `admin`.

Uma função sem parâmetro de empresa não prova autorização para a empresa de um
registro específico. Preferir helper com `company_id`.

### `is_admin_or_manager()`

Ainda consulta `profiles.role` e `profiles.is_active`. É legado e não deve ser
usado em objetos novos. Sua substituição exige migration dedicada, inventário
de dependências e validação antes/depois.

## 7. Policies operacionais canônicas

### `leads`

- SELECT: `can_select_lead_base_strict(...)`;
- UPDATE: `can_update_lead_base_strict(...)` em `USING` e `WITH CHECK`;
- INSERT e DELETE diretos por `authenticated`: bloqueados.

Criação e remoção devem passar pelos fluxos controlados do sistema.

### `sales_cycles`

- SELECT: `can_select_sales_cycle_strict(...)`;
- INSERT: `can_write_sales_cycle_strict(...)`;
- UPDATE: leitura autorizada em `USING` e escrita autorizada em `WITH CHECK`;
- DELETE direto por `authenticated`: bloqueado;
- RLS está `FORCE ROW LEVEL SECURITY`.

### `cycle_events`

- SELECT: admin/manager da empresa ou owner autorizado do ciclo;
- INSERT: `created_by = auth.uid()` e acesso operacional ao ciclo;
- UPDATE: admin/manager da empresa;
- RLS está `FORCE ROW LEVEL SECURITY`.

### `company_memberships`

- SELECT: `can_select_company_membership_strict(...)`;
- INSERT, UPDATE e DELETE administrativos: platform admin ativo;
- operações de gestão por empresa devem usar RPCs explicitamente autorizadas,
  não policies amplas.

## 8. Companion e IA

### `ai_coaching_notes`

- RLS habilitado;
- nenhuma policy direta;
- acesso direto revogado;
- leitura/escrita ocorre por rotas server-side/RPCs controladas.

O advisor `rls_enabled_no_policy` é esperado enquanto esse desenho for
intencional, mas deve continuar documentado e testado.

### `lead_conversation_analyses`

As policies vivas ainda usam `profiles.company_id`, `profiles.role` e ownership
do lead. A tabela não segue integralmente a governança por membership e não
deve ser adotada como ledger canônico do Companion V2.

## 9. `SECURITY DEFINER`

Use `SECURITY INVOKER` por padrão.

Quando `SECURITY DEFINER` for indispensável:

1. declarar `search_path` seguro;
2. qualificar tabelas com schema;
3. validar `auth.uid()` dentro da função;
4. validar `company_id`, membership, papel e ownership;
5. revogar `EXECUTE` de `PUBLIC` e `anon`;
6. conceder apenas aos papéis necessários;
7. executar advisors após a migration.

As RPCs de coaching
`rpc_list_ai_coaching_for_cycle_for_company(...)` e
`rpc_save_ai_coaching_for_company(...)` eram `SECURITY DEFINER` e executáveis
por `anon` no snapshot de 2026-07-29. A correção fica bloqueada até uma fase de
segurança dedicada, para não misturar DDL com a Fase 0 do Companion.

## 10. Service role

`SUPABASE_SERVICE_ROLE_KEY` ignora RLS por design.

Regras:

- nunca expor no navegador;
- nunca usar em variável `NEXT_PUBLIC_*`;
- limitar a rotas server-side que refazem todas as verificações de acesso;
- não aceitar `company_id` do cliente sem validar token e membership;
- registrar evento de auditoria nas mutações sensíveis.

No Companion, `COMPANION_TOKEN_SECRET` deve ser um segredo exclusivo. Os
fallbacks atuais para service role e anon key são dívida técnica registrada e
exigem rotação coordenada antes de serem removidos.

## 11. Views

Views expostas devem usar `security_invoker = true` e grants mínimos.

Uma view não substitui RLS das tabelas-base. Se uma view antiga não puder ser
comprovada como segura:

- revogar acesso de `anon` e `authenticated`; ou
- movê-la para schema não exposto; ou
- recriá-la com `security_invoker = true` e filtros canônicos.

## 12. Protocolo para alterar RLS

Nenhuma alteração de policy, helper, grant, view ou RPC pode ser feita sem:

1. identificar migration e objetos dependentes;
2. registrar consulta de baseline;
3. testar em ambiente separado;
4. validar admin, manager, member, usuário inativo e usuário de outra empresa;
5. executar advisors de segurança e performance;
6. registrar rollback;
7. aplicar uma migration versionada;
8. repetir as consultas de validação;
9. testar o fluxo real da aplicação.

Não usar `execute_sql` como substituto do arquivo final de migration.

## 13. Consultas de auditoria

### Tabelas públicas sem RLS

```sql
select c.relname as tabela
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
order by c.relname;
```

### Policies operacionais

```sql
select
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'company_memberships',
    'leads',
    'sales_cycles',
    'cycle_events',
    'ai_coaching_notes',
    'lead_conversation_analyses'
  )
order by tablename, cmd, policyname;
```

### Funções `SECURITY DEFINER` executáveis por `anon`

```sql
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
  and has_function_privilege('anon', p.oid, 'execute')
order by p.proname, argumentos;
```

### Dependências legadas de `profiles`

```sql
select
  n.nspname as schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    pg_get_functiondef(p.oid) ilike '%profiles.role%'
    or pg_get_functiondef(p.oid) ilike '%profiles.company_id%'
  )
order by p.proname, argumentos;
```

## 14. Bloqueios para o Companion V2

Antes de qualquer DDL do V2:

- conciliar os 94 arquivos SQL com as 19 migrations remotas;
- versionar a origem de `lead_conversation_analyses`;
- definir policies das cinco tabelas canônicas;
- definir retenção e exclusão de conteúdo;
- remover execução anônima das RPCs privilegiadas relacionadas;
- validar isolamento com matriz real de usuários e empresas.

---

Última atualização: 2026-07-29 - Fase 0 do Yolen Companion V2.
