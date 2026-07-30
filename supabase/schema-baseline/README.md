# Baseline reproduzível do schema

Este diretório registra a fotografia estrutural do schema `public` do projeto
Supabase **Yolen - Cockpit Comercial**, capturada em 2026-07-30 sem copiar
linhas de produção.

## Como a conciliação funciona

- Os 19 primeiros arquivos de `supabase/migrations/` correspondem exatamente
  aos nomes registrados no histórico remoto no momento da Fase 2.
- As 18 primeiras migrations são marcadores históricos sem DDL.
- A 19ª migration contém o baseline consolidado do schema vivo.
- Migrations das fases posteriores são adicionadas depois dessa cadeia, sem
  reescrever o baseline.
- `supabase/migrations_legacy/` preserva, sem reescrita, os 94 arquivos que
  existiam antes da conciliação.

Em produção, as 19 versões já estão registradas e, portanto, nenhuma delas será
reexecutada. Em um banco vazio, os marcadores são aplicados em ordem e a última
migration cria o schema reproduzido.

Esse desenho evita tanto reaplicar alterações antigas quanto falsificar o
histórico remoto.

## Conteúdo versionado

| Artefato | Finalidade |
|---|---|
| `manifest.json` | Inventário esperado de objetos, RLS, policies e grants |
| `schema-baseline.test.mjs` | Reprodução do baseline em PostgreSQL descartável |
| `../migrations/20260629040658_restore_simulator_metrics_rpc_shell.sql` | DDL consolidada |

O baseline contém tipos, tabelas, colunas, constraints, índices, funções,
views, triggers, RLS, policies, comentários e grants do schema `public`.

## Validação

Execute:

```bash
npm run test:schema-baseline
```

O teste sobe um PostgreSQL descartável em memória com PGlite, aplica a
migration consolidada do baseline e compara o resultado com o manifesto. As
migrations posteriores possuem testes próprios e não alteram esta fotografia.
O teste também comprova que:

- as 39 tabelas estão com RLS habilitado;
- as cinco tabelas planejadas para o Companion V2 ainda não existem;
- os 19 arquivos do baseline têm os mesmos nomes do histórico remoto;
- migrations posteriores possuem timestamp crescente e nome válido;
- os 94 arquivos anteriores continuam preservados;
- o baseline não depende de dados reais.

PGlite valida a estrutura PostgreSQL do schema `public`. A criação de uma
branch hospedada do Supabase não estava disponível porque o projeto não está no
plano Pro; por isso, integrações específicas da plataforma deverão ser
revalidadas em uma branch oficial quando esse recurso estiver disponível.

## Regra para migrations futuras

Depois da integração desta fase:

1. não editar os 19 arquivos oficiais nem os 94 arquivos legados;
2. criar toda migration nova com `supabase migration new <nome>`;
3. usar um timestamp posterior a `20260629040658`;
4. validar primeiro em ambiente descartável;
5. executar testes de isolamento e RLS antes de aplicar no projeto remoto.

Os avisos atuais dos advisors do Supabase são dívida pré-existente e não foram
alterados por esta baseline. Cada correção futura deverá ter migration própria,
teste e rollback.
