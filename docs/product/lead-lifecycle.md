# Lead Lifecycle — Documento de Governança do Produto

> **Versão:** 0.1.0 — Fase 0 (somente documentação, sem alterações de runtime)
> **Última atualização:** 2026-03-13

---

## Objetivo

Definir de forma inequívoca como um Lead nasce, circula entre vendedores e encerramentos, e como regras de propriedade (owner / won_owner) se comportam em todos os cenários do Cockpit Comercial. Este documento é a fonte de verdade para desenvolvedores, QA e Product Owner durante as fases de implementação.

---

## Glossário

| Termo | Definição |
|---|---|
| **Lead** | Registro de um potencial cliente (empresa ou pessoa física) identificado por `id` único no sistema. Nasce a partir de importação Excel, cadastro manual ou integração futura. |
| **Sales Cycle** (ciclo de venda) | Instância de esforço comercial sobre um Lead em um determinado período/campanha. Um mesmo Lead pode ter múltiplos ciclos ao longo do tempo. |
| **Pool** | Estado intermediário em que o Lead não possui `owner_user_id` definido, ficando disponível para qualquer vendedor autorizado. |
| **Owner** (`owner_user_id`) | Vendedor atualmente responsável pelo Lead no ciclo ativo. Pode ser alterado pelo Admin a qualquer momento antes do ganho. |
| **Won Owner** (`won_owner_user_id`) | Vendedor que recebe o crédito definitivo de faturamento no momento em que o Lead é marcado como **ganho**. Imutável após o ganho sem override explícito de Admin. |
| **Grupo** (`group_id`) | Agrupamento lógico de vendedores (equipe, regional, etc.) usado para escopo de metas e relatórios. |

---

## Invariantes do Sistema

As regras abaixo **nunca** podem ser violadas por nenhuma camada da aplicação (UI, API, banco):

1. **Unicidade de Lead por empresa:** Um Lead é identificado pela combinação `(company_id, identificador_externo)`. O sistema nunca cria dois registros para o mesmo identificador dentro da mesma empresa, independentemente da origem (Excel, manual, integração).

2. **Imutabilidade do Won Owner após ganho:** Uma vez que `status = 'ganho'` e `won_owner_user_id` é preenchido, esse campo só pode ser alterado por um Admin com permissão explícita de `revenue_override`. Nenhuma ação automática (reimportação, redistribuição) altera o `won_owner_user_id`.

3. **Pool é estado válido:** Um Lead sem `owner_user_id` (pool) permanece visível e operacional. Vendedores podem puxar Leads do pool conforme política da empresa; o sistema nunca descarta Leads em pool.

4. **Reimportação não regride status ganho/perdido:** Se um Lead com `status = 'ganho'` ou `status = 'perdido'` for reimportado via Excel, o sistema não altera o status, o owner, nem o won_owner. O novo dado da planilha é ignorado para esses campos; apenas campos não-críticos (e.g., telefone, e-mail) podem ser atualizados conforme política de merge.

5. **Lead em negociação reimportado retorna ao pool:** Se `status = 'negociacao'` (ou qualquer etapa anterior a ganho/perdido) e o Lead for reimportado, o sistema move o Lead de volta ao pool (`owner_user_id = null`) e registra o evento `reimport_reset` no histórico de eventos. O vendedor anterior é notificado.

6. **Histórico de eventos é append-only:** A tabela `lead_events` nunca sofre UPDATE ou DELETE. Todo estado transitório é reconstituível pela sequência de eventos.

7. **Admin pode redistribuir owner a qualquer momento:** Mesmo após ganho, o Admin pode alterar o `owner_user_id` para fins operacionais, mas **isso não altera o `won_owner_user_id`** (ver invariante 2).

---

## Modelo Mental

Pense no Lead como um **ativo comercial** que pertence à empresa (não ao vendedor). O vendedor detém apenas a *posse temporária* do Lead durante o ciclo de venda. Quando o Lead é ganho, a posse se converte em *crédito de faturamento* (`won_owner_user_id`), que é imutável e serve de base para comissões e metas. Reimportações são *sinais externos* de que uma nova oportunidade surgiu; o sistema os processa sem destruir o histórico existente, garantindo rastreabilidade completa.

---

## Estados e Transições

```
                  ┌──────────────────────────────────────────────┐
                  │                   POOL                       │
                  │          (owner_user_id = null)              │
                  └──────────────────┬───────────────────────────┘
                                     │  Vendedor ou Admin atribui owner
                                     ▼
                  ┌──────────────────────────────────────────────┐
                  │                  NOVO                        │
                  │   Lead atribuído, ainda sem contato          │
                  └──────────────────┬───────────────────────────┘
                                     │  Vendedor registra 1º contato
                                     ▼
                  ┌──────────────────────────────────────────────┐
                  │                CONTATO                       │
                  │   Tentativa de contato realizada             │
                  └──────────────┬──────────────┬───────────────┘
                                 │              │ Sem resposta
                        Respondeu│              │ (timeout/desqualificação)
                                 ▼              ▼
           ┌─────────────────────────┐    ┌────────────────────────┐
           │       RESPONDEU         │    │       PERDIDO          │
           │  Lead engajou, proposta │    │  (terminal)            │
           │  em elaboração          │    └────────────────────────┘
           └──────────┬──────────────┘
                      │  Proposta enviada, negociação ativa
                      ▼
           ┌─────────────────────────┐
           │      NEGOCIAÇÃO         │◄── Reimportação devolve ao POOL
           │  (owner pode mudar)     │    (evento reimport_reset)
           └──────┬──────────────────┘
                  │
        ┌─────────┴──────────┐
        │                    │
        ▼                    ▼
┌───────────────┐   ┌────────────────────┐
│     GANHO     │   │      PERDIDO       │
│  won_owner    │   │  (terminal)        │
│  imutável     │   └────────────────────┘
└───────────────┘
```

### Tabela de transições permitidas

| De \ Para | pool | novo | contato | respondeu | negociacao | ganho | perdido |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **pool** | — | ✅ | — | — | — | — | — |
| **novo** | ✅¹ | — | ✅ | — | — | — | ✅ |
| **contato** | ✅¹ | — | — | ✅ | — | — | ✅ |
| **respondeu** | ✅¹ | — | — | — | ✅ | — | ✅ |
| **negociacao** | ✅² | — | — | — | — | ✅ | ✅ |
| **ganho** | — | — | — | — | — | — | — |
| **perdido** | ✅³ | — | — | — | — | — | — |

> ¹ Devolução manual pelo Admin ou por reimportação.  
> ² Reimportação dispara `reimport_reset`, devolvendo ao pool automaticamente.  
> ³ Reativação por nova campanha (feature flag `ENABLE_IMPORT_REACTIVATE`).

---

## Regra de Governança — Admin vs. Vendedor

| Ação | Admin | Vendedor |
|---|:---:|:---:|
| Importar Excel (criar/atualizar leads) | ✅ | ❌ |
| Atribuir owner de Lead em pool | ✅ | ✅ (self) |
| Alterar owner de Lead em andamento | ✅ | ❌ |
| Alterar owner pós-ganho | ✅ | ❌ |
| Alterar won_owner | ✅ (com flag `ENABLE_REVENUE_OVERRIDES`) | ❌ |
| Avançar status (contato → respondeu → negociação) | ✅ | ✅ (próprio lead) |
| Marcar como ganho/perdido | ✅ | ✅ (próprio lead) |
| Reativar lead perdido | ✅ | ❌ |
| Ver leads de outros vendedores | ✅ | ❌ |
| Exportar relatórios | ✅ | ❌ |

---

## Import Excel — Regra "Não Duplica"

Ao processar uma planilha:

1. Para cada linha, o sistema extrai o identificador externo (CNPJ, CPF ou e-mail, conforme configuração da empresa).
2. Realiza lookup `(company_id, identificador_externo)` na tabela `leads`.
3. **Se não existir:** cria o Lead no estado `pool`.
4. **Se existir e status for `ganho` ou `perdido`:** ignora a linha silenciosamente (ou registra aviso no relatório de importação). Não altera owner nem won_owner.
5. **Se existir e status for qualquer etapa intermediária (`novo`, `contato`, `respondeu`, `negociacao`):** aplica `reimport_reset` — devolve ao pool, limpa `owner_user_id`, registra evento.
6. Campos de dados (telefone, e-mail, nome fantasia) são atualizados pela planilha **somente** se o registro for novo ou se a empresa tiver habilitado `merge_on_reimport` nas configurações.
7. O relatório de importação sempre retorna: `criados`, `atualizados`, `ignorados (ganho/perdido)`, `resetados ao pool`.

---

## Ganho e Faturamento — Conceito `won_owner_user_id`

Quando um Lead é marcado como **ganho**:

1. O sistema captura o `owner_user_id` atual e o salva em `won_owner_user_id` (se ainda não preenchido).
2. O `won_owner_user_id` é usado em **todos** os cálculos de faturamento, comissão e metas.
3. O `owner_user_id` pode mudar livremente após o ganho (para fins de pós-venda, sucesso do cliente, etc.) **sem afetar** o faturamento.
4. Para corrigir um `won_owner_user_id` errôneo, o Admin deve usar a funcionalidade de override de receita (feature flag `ENABLE_REVENUE_OVERRIDES`), que gera um evento de auditoria.
5. O faturamento por período é sempre calculado com base na data do evento `won` e no `won_owner_user_id` naquele momento.

---

## 5 Exemplos Práticos

### Exemplo 1 — Lead novo → pool → distribuição → etapas

> **Cenário:** A empresa importa uma planilha com 200 CNPJs novos. Nenhum deles existe no sistema.

1. O sistema cria 200 Leads com `status = pool`, `owner_user_id = null`.
2. O Admin acessa a tela de Pool e distribui 50 Leads para a vendedora Maria.
3. Maria abre seu pipeline e vê 50 Leads com status `novo`.
4. Maria liga para o Lead A → registra evento `contato` → status muda para `contato`.
5. O Lead A responde → Maria registra `respondeu` → status muda para `respondeu`.
6. Proposta enviada → Maria registra `negociacao` → status muda para `negociacao`.
7. Lead fechado → Maria registra `ganho` → `won_owner_user_id = maria.id`, status = `ganho`.

**Resultado:** Lead A rastreado do início ao fim; faturamento creditado a Maria.

---

### Exemplo 2 — Lead vendido no passado volta por nova campanha

> **Cenário:** O Lead B foi ganho há 6 meses por João. Uma nova planilha de campanha traz o mesmo CNPJ.

1. Sistema identifica `(company_id, cnpj_B)` já existente com `status = ganho`.
2. Regra de importação: linha ignorada (status terminal).
3. Relatório de importação marca o Lead B como `ignorado (ganho/perdido)`.
4. `won_owner_user_id = joao.id` permanece intacto.
5. Nenhum evento é criado; nenhum campo é alterado.

**Resultado:** O histórico de João não é contaminado; a nova campanha não sobrescreve o ganho anterior.

---

### Exemplo 3 — Lead em negociação é reimportado → recolhe ao pool

> **Cenário:** O Lead C está em `negociacao` com a vendedora Ana. O Admin importa nova planilha de enriquecimento que contém o mesmo CNPJ.

1. Sistema identifica `(company_id, cnpj_C)` existente com `status = negociacao`, `owner_user_id = ana.id`.
2. Regra de importação: aplica `reimport_reset`.
3. Sistema registra evento `reimport_reset` no histórico de `lead_events` com timestamp e user_id de quem importou.
4. `owner_user_id` → `null`; `status` → `pool`.
5. Ana recebe notificação: "O Lead C foi devolvido ao pool por reimportação."
6. Admin pode reatribuir o Lead C a Ana ou a outro vendedor.

**Resultado:** Dados de enriquecimento atualizados; histórico preservado; Ana não perde o contexto (eventos anteriores permanecem).

---

### Exemplo 4 — Admin redistribui owner pós-ganho → faturamento não muda

> **Cenário:** Pedro ganhou o Lead D em janeiro. Em março, o gestor decide transferir a conta para Carlos (pós-venda).

1. Admin acessa o Lead D (`status = ganho`, `won_owner_user_id = pedro.id`).
2. Admin altera `owner_user_id` → `carlos.id`.
3. Sistema registra evento `owner_changed` com `previous = pedro.id`, `new = carlos.id`, `changed_by = admin.id`.
4. Nos relatórios de faturamento de janeiro, o crédito ainda aparece para Pedro (`won_owner_user_id = pedro.id`).
5. Carlos passa a ser responsável operacional, mas não recebe crédito retroativo.

**Resultado:** Operação de pós-venda não contamina o histórico de faturamento; rastreabilidade completa via eventos.

---

### Exemplo 5 — Lead duplicado no Excel → sistema não duplica

> **Cenário:** A planilha importada tem a linha do CNPJ 00.000.000/0001-00 repetida duas vezes (erro humano na planilha).

1. O sistema processa a primeira ocorrência: Lead não existe → cria com `status = pool`.
2. O sistema processa a segunda ocorrência: Lead já existe (criado na etapa anterior, mesmo import batch) → verifica status = `pool` → aplica regra de reimportação para status intermediário: `reimport_reset` (no caso de pool, não há owner para resetar; linha é idempotente).
3. Relatório de importação: `criados: 1`, `resetados ao pool: 0` (ou `atualizados: 1` se campos de dados divergem).
4. Apenas 1 registro existe ao final da importação.

**Resultado:** Planilhas com linhas duplicadas são tratadas de forma segura; o banco de dados mantém unicidade.

---

## Anti-Patterns — O Que NÃO Pode Acontecer

| # | Anti-pattern | Consequência se ocorrer |
|---|---|---|
| 1 | Importação criar dois registros para o mesmo `(company_id, identificador_externo)` | Duplicação de faturamento, inconsistência de pipeline |
| 2 | Reimportação alterar `won_owner_user_id` sem flag de override | Faturamento incorreto, comissões erradas |
| 3 | Vendedor alterar o `owner_user_id` de Lead de outro vendedor | Roubo de carteira, conflito de pipeline |
| 4 | Status retroceder de `ganho` para `negociacao` por ação automática | Histórico corrompido, metas infladas |
| 5 | Deleção de `lead_events` | Perda de rastreabilidade, impossibilidade de auditoria |
| 6 | `won_owner_user_id` ficar null após ganho | Faturamento sem responsável, breakdown de relatórios |
| 7 | Lead em pool ser deletado por limpeza automática | Perda de dados de campanha, retrabalho de importação |

---

## Checklist para Próximas Fases

### Fase 1 — Modelo de dados
- [ ] Migration: adicionar coluna `won_owner_user_id` em `leads`
- [ ] Migration: adicionar coluna `status` com enum validado
- [ ] RLS: vendedor vê apenas seus leads + pool
- [ ] Trigger: preencher `won_owner_user_id` automaticamente no evento `won`
- [ ] View: `v_pipeline` agrupada por seller/status

### Fase 2 — Import Excel
- [ ] API `/api/import`: implementar lógica de upsert com as regras desta doc
- [ ] Relatório de importação: campos `criados`, `atualizados`, `ignorados`, `resetados`
- [ ] UI: tela de preview antes de confirmar importação
- [ ] Feature flag `ENABLE_IMPORT_REACTIVATE`: reativar leads ganhos/perdidos

### Fase 3 — Pipeline UI
- [ ] Componente KanbanBoard respeitando estados desta doc
- [ ] Drag-and-drop com validação de transições permitidas
- [ ] Notificação para vendedor ao receber/perder lead

### Fase 4 — Faturamento e Metas
- [ ] Relatório por `won_owner_user_id` + período
- [ ] Override de receita com auditoria (flag `ENABLE_REVENUE_OVERRIDES`)
- [ ] Metas por grupo/vendedor com base no `won_owner_user_id`

### Fase 5 — IA e Relatórios Avançados
- [ ] Integração com `/app/relatorios/ia` para análise de ciclo
- [ ] Predição de churn / probabilidade de ganho
- [ ] Exportação de relatório de faturamento (CSV/PDF)
