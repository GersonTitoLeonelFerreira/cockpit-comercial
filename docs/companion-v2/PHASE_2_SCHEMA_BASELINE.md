# Fase 2 — Baseline reproduzível do schema

## Objetivo

Conciliar o histórico de migrations do repositório com o projeto Supabase e
provar que o schema vivo pode ser reconstruído em uma base vazia antes de
qualquer DDL do Companion V2.

## Situação encontrada

| Evidência | Resultado |
|---|---:|
| Arquivos SQL anteriores no repositório | 94 |
| Entradas no histórico remoto | 19 |
| Tabelas no schema `public` | 39 |
| Colunas físicas | 448 |
| Constraints | 162 |
| Índices fora de constraints | 148 |
| Funções | 159 |
| Views | 15 |
| Triggers de usuário | 27 |
| Policies | 103 |
| Tabelas com RLS habilitado | 39 de 39 |

Os 94 arquivos usavam numeração local, tinham prefixos duplicados e não
representavam o histórico que o Supabase reconhece. Marcar esses arquivos como
aplicados ou tentar executá-los novamente criaria um histórico falso e risco de
DDL destrutiva.

## Solução adotada

1. Os 94 arquivos anteriores foram movidos, sem alteração, para
   `supabase/migrations_legacy/`.
2. `supabase/migrations/` passou a conter exatamente os 19 nomes do histórico
   remoto.
3. As 18 primeiras versões são marcadores históricos sem DDL.
4. A última versão contém a fotografia estrutural consolidada do schema vivo.
5. Um manifesto independente fixa os objetos, RLS, policies e grants esperados.
6. Um teste aplica a sequência oficial em PostgreSQL vazio e compara o resultado
   objeto a objeto.

Produção já registra as 19 versões, então essa organização não executa nada no
banco real. Em uma base nova, a sequência constrói o schema completo.

## Ambiente de validação

A branch temporária oficial foi autorizada pelo usuário ao custo informado de
US$ 0,01344 por hora, mas o Supabase recusou a criação porque branching exige
plano Pro. Nenhuma branch foi criada e nenhum custo foi gerado.

Como alternativa segura, a reprodução usa PGlite `0.5.4`, um PostgreSQL
descartável em memória. O teste cria somente os stubs mínimos de `auth`
necessários ao schema, aplica as migrations e descarta a instância ao terminar.
Nenhuma linha de produção é copiada.

## Integridade do baseline

| Artefato | SHA-256 |
|---|---|
| `supabase/schema-baseline/manifest.json` | `f39df06328a3cac6a2cc8aa3ee6caebb9133d9364c994e508aacdb5ae4d19117` |
| Migration consolidada | `4ff2f984445e69d4fd58542404956e8e768d4217f70afdd88f2730a2dc66eb12` |

O manifesto cobre:

- 39 tabelas e 448 colunas;
- 162 constraints e 148 índices;
- 159 funções, 15 views e 27 triggers;
- 103 policies e RLS nas 39 tabelas;
- 721 grants de relações e 257 grants de funções;
- o enum `lead_status`;
- a tabela existente `lead_conversation_analyses`;
- ausência das cinco tabelas novas planejadas para o V2.

## Advisors do Supabase

A leitura de produção registrou dívida pré-existente, sem mutação:

| Advisor | Avisos | Informativos |
|---|---:|---:|
| Segurança | 70 | 3 |
| Performance | 70 | 105 |

Entre os avisos estão funções com `search_path` mutável, permissões de execução,
foreign keys sem índice e policies que podem ser otimizadas. Corrigi-los nesta
fase alteraria o schema que estamos tentando reproduzir. Eles permanecem
registrados para migrations futuras, com escopo, teste e rollback próprios.

## Limites

- O baseline é estrutural e não contém dados de produção.
- PGlite valida PostgreSQL, mas não substitui uma branch hospedada do Supabase.
- Não foram criadas tabelas do Companion V2.
- Nenhuma migration, policy, grant, RPC ou linha foi aplicada em produção.
- O motor padrão continua `v1`.

## Definition of Done

- [x] Histórico remoto de 19 versões reproduzido no repositório.
- [x] 94 migrations anteriores preservadas para auditoria.
- [x] Origem de `lead_conversation_analyses` incluída no baseline.
- [x] Schema `public` versionado sem dados reais.
- [x] Base descartável reconstrói e verifica o schema.
- [x] RLS comprovado nas 39 tabelas.
- [x] Advisors registrados sem alteração oportunista.
- [x] Produção permaneceu sem mutações.
- [x] Gates completos do repositório aprovados.
- [x] PR integrado e deployment canônico confirmado.

## Evidências dos gates locais

| Gate | Resultado |
|---|---|
| Baseline | 1 cenário aprovado; schema reconstruído do zero |
| Regressões do Companion | 22 cenários aprovados |
| ESLint | Teste do baseline sem erros |
| TypeScript | `npx tsc --noEmit` sem erros |
| Build | `next build` aprovado com 106 rotas |
| Integração | PR #139 integrado no commit `84e57a3` |
| Produção | Deployment canônico `READY`; login HTTP 200 e sem erro de runtime |
