# Baseline de segurança e dados do Companion

## Escopo e horário

Snapshot somente leitura realizado em 2026-07-29 às 22:20:53 UTC no projeto
Supabase `Yolen - Cockpit Comercial`, região `sa-east-1`, PostgreSQL 17.6.

Os volumes são evidência daquele instante e continuam mudando com a operação.

## Volumes

| Objeto | Registros |
|---|---:|
| `leads` | 15.437 |
| `sales_cycles` | 3.533 |
| `cycle_events` | 14.407 |
| `ai_coaching_notes` | 68 |
| `lead_conversation_analyses` | 4 |

Nenhum lead possuía `current_pipeline_id` ou `current_stage_id` preenchido no
snapshot.

O contrato TypeScript do CRM aceita oito estados: `novo`, `contato`,
`respondeu`, `negociacao`, `pausado`, `cancelado`, `ganho` e `perdido`.
Naquele instante, existiam ciclos em seis deles; não havia linha em `pausado`
ou `cancelado`.

## Estado do modelo V2

As tabelas abaixo não existiam:

- `conversation_messages`;
- `conversation_capture_state`;
- `conversation_analysis_runs`;
- `conversation_decisions`;
- `conversation_coaching_outputs`.

Nenhuma delas é criada na Fase 0.

## Identidade, empresa e autorização

O banco vivo usa:

- `profiles` para identidade global e estado de plataforma;
- `company_memberships` para vínculo, papel e ativação por empresa;
- `company_id` nos registros operacionais para isolamento;
- helpers estritos e RPCs `*_for_company` para validar o contexto explícito.

Achados do snapshot:

- `current_company_id()` consulta `company_memberships` e só retorna uma empresa
  quando existe exatamente uma membership ativa;
- `is_admin()` aceita platform admin global ativo ou membership ativa com papel
  `admin`;
- `is_admin_or_manager()` ainda consulta `profiles.role` e
  `profiles.is_active`; deve ser tratado como legado até ser conciliado;
- as policies canônicas de `leads`, `sales_cycles` e `cycle_events` usam
  helpers estritos baseados em membership e ownership;
- as policies de `lead_conversation_analyses` ainda usam
  `profiles.company_id`, `profiles.role` e ownership do lead, divergindo do
  modelo canônico.

## RLS e acesso direto

RLS estava habilitado em `profiles`, `company_memberships`, `leads`,
`sales_cycles`, `cycle_events`, `ai_coaching_notes` e
`lead_conversation_analyses`.

Pontos pendentes, não alterados na Fase 0:

1. `ai_coaching_notes` possui RLS sem policies e acesso direto revogado. O
   advisor continua sinalizando `rls_enabled_no_policy`.
2. `lead_conversation_analyses` não deve ser promovida a tabela canônica do V2
   antes de redesenhar suas policies.
3. As RPCs `rpc_list_ai_coaching_for_cycle_for_company` e
   `rpc_save_ai_coaching_for_company` são `SECURITY DEFINER` e continuavam
   executáveis por `anon`.
4. Há outros avisos de `SECURITY DEFINER`, `search_path` e políticas legadas
   fora do escopo do Companion; serão tratados por fases próprias.

## Autenticação do Companion

As rotas auditadas validam token, membership, empresa, ciclo e ownership antes
das operações privilegiadas. Entretanto:

- validação de token está duplicada em várias rotas;
- emissão do token está duplicada;
- o segredo aceita fallback para `SUPABASE_SERVICE_ROLE_KEY` e
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
- o valor efetivo de `COMPANION_TOKEN_SECRET` em produção não foi comprovado
  pela auditoria de código.

Diretriz V2: usar segredo exclusivo e remover os fallbacks somente em fase
dedicada, com rotação e teste do fluxo de conexão.

## Privacidade

O conteúdo capturado pode aparecer integralmente em `ai_coaching_notes`.
Antes do piloto V2 devem existir:

- finalidade e base de tratamento documentadas;
- minimização do payload enviado ao modelo;
- retenção definida por tipo de dado;
- política para áudio e transcrição;
- redação/mascaramento de dados sensíveis;
- exportação e exclusão auditáveis;
- proibição de conteúdo de uma empresa em contexto de outra.

## Drift de migrations

| Fonte | Quantidade |
|---|---:|
| Arquivos SQL no repositório | 94 |
| Entradas no histórico do Supabase | 19 |

Prefixos duplicados no repositório: `005`, `007`, `035`, `085`, `087`, `088`,
`089` e `090`.

`lead_conversation_analyses` existe no banco, mas sua criação não está
versionada no repositório. `088_ai_coaching_notes.sql` existe localmente, porém
seu nome não aparece no histórico remoto.

Conclusão: migrations do V2 ficam bloqueadas até a Fase 2 produzir um baseline
reproduzível.

## Evidências do V1 congelado

| Componente | Evidência |
|---|---|
| Commit | `50059c32ac924302822a85d044c39890c628b441` |
| Extensão | Manifest `0.1.4` |
| `sales-copilot.ts` | SHA-256 `bf9a157d25802f8488f05984f8cdd0427ce7cfdd33dd50243031cd36f0896111` |
| `sales-coaching.ts` | SHA-256 `e8d71f7859c4caefbd2a5dbd9d9f9136c4a171a8f4ca6208195966d8fbb2f8bc` |
| `analyze-conversation/route.ts` | SHA-256 `5f4f6cee70e1a4b1947a47dfe2d97146f47de51a9b8077d3c6e309da82f8ee89` |
