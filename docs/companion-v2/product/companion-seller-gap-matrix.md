# Matriz de Completude — Yolen Companion para o Vendedor

**Auditado contra:** `main` em `4e58bff0605be8efbc94a3f78faf3a31107a2e9a`.
**Contrato de referência:** [`companion-seller-product-contract.md`](./companion-seller-product-contract.md).
**Método:** cada linha foi verificada lendo o contrato de dados real, o
runtime que o produz, e (quando aplicável) o trecho exato da extensão que
renderiza o campo. Nenhuma capacidade foi marcada `IMPLEMENTADO` só por
existir um `type`/schema — só quando há evidência de que o dado é produzido
por um runtime ligado à produção **e** chega à extensão.

## Legenda de status

| Status | Significado |
|---|---|
| `IMPLEMENTADO` | Existe de ponta a ponta e há evidência de que chega à experiência do vendedor. |
| `PARCIAL` | Contrato/dados/UI existem, mas incompletos ou não confiáveis em todos os casos. |
| `BACKEND_ONLY` | Existe no motor/dados, mas não chega adequadamente ao vendedor. |
| `UI_ONLY` | Interface existe, mas sem inteligência confiável por trás. |
| `AUSENTE` | Não existe implementação material. |
| `BLOQUEADO` | Depende de um P1 conhecido ou de outra capacidade ainda incompleta. |
| `NÃO VALIDADO EM 12A` | Existe tecnicamente (contrato+runtime+persistência+UI+teste), mas só roda hoje para a empresa piloto do runtime stateful V2 — ainda não foi comprovado por uso humano em escala. |

## Achado estrutural que atravessa toda a matriz

O repositório tem **três motores de análise de conversa diferentes**, e isso
determina quase todos os vereditos abaixo:

1. **V1** (`app/lib/ai/sales-copilot.ts` + `app/lib/ai/sales-coaching.ts`) —
   o caminho que roda para **praticamente todas as empresas** hoje.
   `sales-copilot.ts` decide estágio de CRM/Agenda com fallback
   determinístico (regras sobre o texto) mais extração leve de fatos por IA;
   `sales-coaching.ts` é uma segunda chamada de IA, só-IA (sem fallback),
   que gera resumo, necessidades do cliente, objeções, acertos/melhorias e
   mensagem sugerida — mas tudo em `string[]` solto, sem evidência por item
   e sem consciência de método comercial ou de relevância comercial.
2. **"Diagnóstico Fase 1"** (`diagnostic-contract.ts` +
   `diagnostic-model.ts` + `diagnostic-execution-plan.ts`) — um contrato
   rico (com `commercial_relevance`, risco do vendedor, `solution_fit`,
   aderência a método) e um motor que o executa
   (`executeCompanionDiagnosticPlan`), mas **só é alcançável pelo endpoint
   de preview** `/api/companion/v2/diagnostic-preview` — não está ligado ao
   fluxo real de análise de conversa (`/api/companion/analyze-conversation`).
3. **V2 stateful** (`CommercialReading` +
   `StatefulCommercialState`, orquestrado por
   `stateful-copilot-runtime-orchestrator.ts`) — o motor mais completo,
   com quase tudo que o contrato de produto pede (seção 6 a 9), e a
   extensão **já sabe renderizar** essa riqueza inteira
   (`getRichCommercialReadingCardHtml`/`getRichCommercialReadingExpandedHtml`
   em `content-script.js`). Mas o `stateful-copilot-activation-gate.ts`
   exige `COMPANION_STATEFUL_MODE=active` **e** uma allowlist de **uma única
   empresa** (`stateful-copilot-active-pilot-readiness.ts`, checagem
   `single_company_allowlist`) para expor o resultado. Para qualquer outra
   empresa, o resultado do V2 nunca é exposto (`should_expose_stateful_result
   = false`) e a experiência cai para V1.

Consequência prática: a maior parte das capacidades ricas descritas no
contrato de produto **já foi construída e já tem UI pronta para
renderizá-las** — mas hoje só uma empresa piloto as recebe de fato. Para
todas as outras, a experiência real ainda é a do V1, muito mais pobre. Isso
está marcado explicitamente em cada linha relevante como
`NÃO VALIDADO EM 12A` (caminho rico) vs. o veredito real para a população
geral.

---

## A. Compreensão da conversa

| # | Capacidade | Status | Evidência | Testes | O que falta |
|---|---|---|---|---|---|
| A1 | Relevância comercial (comercial / não comercial / incerto) antes de qualquer ação | `BLOQUEADO` (P1-04) | Contrato existe (`diagnostic-contract.ts:10-14`, `commercial_relevance`), com invariantes que bloqueiam CRM/intervenção quando `non_commercial` (`validateGuidance`, `validateCrmSuggestion`). O motor que produz esse campo (`executeCompanionDiagnosticPlan`, `diagnostic-model.ts`) só roda atrás do endpoint de preview `v2/diagnostic-preview`. Nem `sales-copilot.ts` (V1) nem `CommercialReading` (V2) têm este filtro no caminho real de produção — `CommercialReading` tem `commercial_role` (buyer/provider/unknown), que é um conceito diferente (quem é o comprador, não se a conversa é comercial). | `diagnostic-contract.test.mjs`, `diagnostic-model.test.mjs`, `diagnostic-engine.test.mjs` — todos contra o motor de preview, não o de produção. | Ligar o motor/contrato de relevância ao caminho real de análise (V1 e V2). Este é exatamente o escopo do P1-04, em desenvolvimento pela Frente 1 — não deve ser reaberto aqui. |
| A2 | Regras de não-inferência (compromisso ≠ comercial, data ≠ Agenda, contato no CRM ≠ conversa comercial) | `BLOQUEADO` (depende de A1) | Sem A1 confiável em produção, essas regras não têm um sinal de entrada estável para se apoiar. `CommercialReadingAgendaSuggestion`/`CrmSuggestion` exigem `rationale` e evidência, o que mitiga parcialmente, mas não substitui o filtro de relevância. | — | Mesma dependência de A1. |
| A3 | Silêncio operacional explícito ("conversa sem evidência comercial relevante") | `PARCIAL` | UI mostra estado de "sem ação necessária" (`getCompanionMomentText`: *"Continue a conversa normalmente. A Yolen acompanha e aparece quando houver algo útil para orientar."*; badge "Sem intervenção necessária"/"Sem intervenção" quando `best_approach.decision === 'no_intervention'`). Isso cobre "nada a fazer *dentro* de uma leitura comercial", mas não a frase específica de "esta conversa não é comercial" pedida no contrato — porque a classificação de A1 não chega à produção. | `b3-commercial-reading-ui.test.mjs` | Depende de A1 para o estado ser semanticamente correto, não só silencioso. |

## B. Painel principal

| # | Capacidade | Status | Evidência | Testes | O que falta |
|---|---|---|---|---|---|
| B1 | Momento atual (frase curta e correta) | `PARCIAL` | Rico: `commercial_reading.conversation_summary.current_state.summary` renderizado como kicker (`content-script.js` ~8269). Geral (V1): `suggestion.summary`, frase curta gerada por regra/IA sem a mesma disciplina de evidência. | `b3-commercial-reading-ui.test.mjs` | Levar a versão rica para além da empresa piloto. |
| B2 | Método (etapa atual) visível no painel padrão | `PARCIAL` | Existe, mas só na visão **expandida** (`getRichCommercialMethodHtml`), não no card compacto sempre visível — o contrato de produto pede isso no painel principal. | `b3-commercial-reading-method-ui.test.mjs` | Promover um resumo de etapa atual para o card compacto. |
| B3 | Aderência ao método no painel | `PARCIAL` | Mesma limitação de B2 — está dentro do detalhamento por etapa (`method.stages[].status/explanation`), sem um indicador de "dentro/fora do método" na visão compacta. | idem | idem B2. |
| B4 | Atenção / risco (só quando relevante) | `IMPLEMENTADO` (mecanismo adaptado) | Não existe como "campo de risco" único — existe como **dois mecanismos concretos**: (1) pre-send gate, que intercepta o envio quando o rascunho conflita com a leitura comercial (`interceptPreSendAttempt`, 5 condições: `wait_pressure`, `sensitive_condition`, `pending_issue`, `method_premature_close`, `agenda_conflict`); (2) "dot" de atenção no painel recolhido com 4 níveis (`risk`/`attention`/`recommendation`/`information`, `getCollapsedCompanionAttentionSnapshot`). Ambos só aparecem quando há algo relevante — nenhum dos dois "spamma" por padrão. | `b4-pre-send-assistant.test.mjs`, `b4-pre-send-gate.test.mjs`, `b4-pre-send-hardening.test.mjs`, `b5-minimized-intelligence.test.mjs` | Nenhuma — cumpre o espírito do contrato, com um mecanismo diferente do literal "campo de risco no card". Documentar essa equivalência é suficiente. |
| B5 | Próximo passo (melhor condução) | `PARCIAL` | Rico: `best_approach.decision` + `.reason` + `.channel`, com rótulos para 20+ decisões (`getCommercialReadingDecisionLabel`). Geral (V1): `next_action` operacional, sem a mesma explicação de "porquê". | `b3-commercial-reading-ui.test.mjs` | Levar para além do piloto. |
| B6 | Mensagem sugerida (só quando agrega valor) | `IMPLEMENTADO` | V1: `sales-coaching.ts` filtra mensagens genéricas (`isGenericSuggestedMessage`) e força `null` em `ganho`/`perdido`. V2: `recommended_message`, null quando `intervention_needed=false` (invariante `SILENT_COMMUNICATION_REQUIRED` em `commercial-reading-contract.ts`). UI: `getSuggestedMessageHtml`, com copiar/inserir e aviso "Revise antes de enviar." | `b3-commercial-reading-ui.test.mjs`, testes de `sales-coaching` (a confirmar nome exato do arquivo) | Nenhuma crítica — funciona nos dois caminhos. |

## C. Análise completa — conversa

| # | Capacidade | Status | Evidência | Testes | O que falta |
|---|---|---|---|---|---|
| C1 | Resumo, contexto inicial, evolução, eventos importantes, último pedido/decisão | `PARCIAL` | Rico: `getRichConversationSummaryHtml` renderiza `conversation_summary.{initial_context,evolution,important_events,last_customer_request_or_decision}` — mapeamento 1:1 com o contrato de produto. Geral (V1): `AICoaching.conversation_summary` é uma única string de 4-6 frases (`sales-coaching.ts`), sem quebra estrutural. | `b3-commercial-reading-expanded-ui.test.mjs` | Levar estrutura rica para além do piloto. |
| C2 | Linha de evolução comercial (etapas semânticas: completed/active/partial/pending/not_started/skipped/not_applicable) | `NÃO VALIDADO EM 12A` | `commercial_evolution[]`, `getRichCommercialEvolutionHtml`. Não existe equivalente em V1. | `b3-commercial-reading-expanded-ui.test.mjs` | Só existe no piloto. |

## D. Análise completa — cliente

| # | Capacidade | Status | Evidência | Testes | O que falta |
|---|---|---|---|---|---|
| D1 | Necessidades, interesses, critérios de decisão, preferências, perguntas abertas, objeções, incertezas | `PARCIAL` | Rico: `CommercialReadingCustomer` (7 categorias, cada item com evidência), `getRichCustomerHtml`. Geral (V1): apenas `customer_interests: string[]` e `objections: string[]` (2 de 7 categorias, sem evidência por item). | `b3-commercial-reading-expanded-ui.test.mjs` | Levar estrutura completa para além do piloto; no V1, adicionar as 5 categorias faltantes com evidência. |
| D2 | Problemas do cliente / impactos dos problemas | `AUSENTE` | Nem `CommercialReadingCustomer` nem `CompanionDiagnostic` têm campos explícitos `problems`/`impacts` — a intenção fica implicitamente diluída em `needs`. | — | Adicionar campos explícitos se o produto decidir que "problema" e "impacto" precisam ser distinguíveis de "necessidade". |
| D3 | Produtos discutidos / produto de interesse do cliente | `AUSENTE` | Não existe em nenhum contrato (`CommercialReadingCustomer`, `StatefulCommercialState`) nem na UI. Existe apenas `commercial-product-contract.ts` (produtos que a **empresa vende**, configurado por admin) — conceito diferente de "o que o cliente demonstrou interesse nesta conversa". | — | Novo campo de produto discutido, ligado (quando possível) ao catálogo de `commercial-product-contract.ts`. |
| D4 | Concorrentes mencionados | `AUSENTE` | Idem D3 — nenhuma ocorrência em contrato ou UI. | — | Novo campo. |
| D5 | Compromissos (histórico de compromissos assumidos por qualquer parte) | `BACKEND_ONLY` | `StatefulCommercialState.commitments[]` existe (`commitment_status`: proposed/confirmed/reschedule_requested/cancelled/completed, `scheduled_at`, `proposed_at`) e é mantido pelo reducer (`stateful-commercial-state-reducer.ts`). Não é renderizado em nenhum lugar da extensão — só a *próxima* ação de Agenda aparece (não é o mesmo que um histórico de compromissos). | `stateful-commercial-state-reducer.test.mjs` (nível de dado, não de UI) | Expor esse histórico na UI (mesmo que dentro da seção "Cliente"). |

## E. Análise completa — vendedor

| # | Capacidade | Status | Evidência | Testes | O que falta |
|---|---|---|---|---|---|
| E1 | Acertos concretos (com evidência, sem elogio genérico) | `PARCIAL` | Rico: `seller_strengths[]`, 9 tipos (`answered_question`, `good_discovery`, `correct_information`, `respected_space`, `method_alignment`, `clear_explanation`, `handled_objection`, `confirmed_information`, `other`), com bloqueio explícito de elogio genérico ("bom atendimento" etc. — `GENERIC_SELLER_PRAISE` em `commercial-reading-contract.ts`) e exigência de evidência direta na mensagem (`requireDirectMessage=true`). Geral (V1): `what_went_well: string[]` solto, sem essa disciplina. | `b3-commercial-reading-feedback-risks-ui.test.mjs` | Levar a disciplina de evidência/anti-genérico para o V1; levar o rico para além do piloto. |
| E2 | Erros / pontos de melhoria com impacto, e mapeamento explícito para as 8 categorias do contrato (pergunta ignorada, descoberta insuficiente, pressão, repetição, promessa arriscada, informação incorreta, apresentação prematura, preço prematuro) | `PARCIAL` | Rico: `improvement_points[]` com **10 tipos** que cobrem quase 1:1 as categorias do contrato de produto (`unanswered_question`, `premature_price`, `insufficient_discovery`, `interrogation`↔repetição, `pressure`, `incorrect_information`, `method_misapplication`, `promise_risk`, `missed_commitment`, `other`), cada item com `summary` + `impact` + evidência obrigatória. Geral (V1): `what_to_improve: string[]` solto, sem taxonomia nem impacto separado. | `b3-commercial-reading-feedback-risks-ui.test.mjs` | Levar para além do piloto. Campo "como corrigir" não é um campo estruturado à parte — está implícito em `summary`/`impact`, não em um `how_to_fix` dedicado; avaliar se vale a pena separar. |

## F. Método comercial

| # | Capacidade | Status | Evidência | Testes | O que falta |
|---|---|---|---|---|---|
| F1 | Método configurável por empresa (nome, etapas, ordem, objetivo, critério de conclusão, perguntas recomendadas) | `IMPLEMENTADO` | `app/lib/server/commercial-config.ts` (`commercial_method_definition`, `METHOD_STEP_FIELDS`: `step_order`, `name`, `objective`, `completion_criteria`, `recommended_questions`, `is_required`) + `commercial-method-contract.ts` (validação de definição). | `commercial-method-contract.test.mjs`, `supabase/phase-tests/a1-1-commercial-method-persistence.test.mjs` | Nenhuma — a configuração em si está sólida. |
| F2 | Leitura de qual etapa está ativa/concluída/parcial/pulada por conversa | `NÃO VALIDADO EM 12A` | Rico: `CommercialReadingMethod`/`MethodStage`, renderizado em `getRichCommercialMethodHtml`. **V1 (`sales-copilot.ts`) não tem nenhuma noção de método** — confirmado por ausência total da palavra "método" no motor. | `b3-commercial-reading-method-ui.test.mjs` | Este é o maior gap de método: a esmagadora maioria das empresas não recebe NENHUMA leitura de método hoje, porque roda em V1. |
| F3 | Narrativa de aderência ("dentro do método" / "saiu do método, aqui está onde, o que faltou, o impacto, como voltar") | `PARCIAL` | O contrato pede uma narrativa dedicada de aderência; a implementação real mostra status + explicação **por etapa**, sem uma frase-headline consolidada de "dentro/fora do método" nem uma seção específica "como voltar". A nota fixa exibida (*"Esta leitura mostra aderência ao método e não determina avanço automático"*) é sobre não-automação, não sobre a narrativa de desvio pedida. | `b3-commercial-reading-method-ui.test.mjs` | Adicionar um resumo de aderência explícito, mesmo que derivado dos `stages[]` já existentes. |

## G. Inteligência do cliente consolidada

| # | Capacidade | Status | Evidência | Testes | O que falta |
|---|---|---|---|---|---|
| G1 | Experiência única consolidando objetivo/necessidades/objeções/etc. do cliente | `PARCIAL` | Os dados existem e estão agrupados (`CommercialReadingCustomer`), mas não como uma experiência **dedicada e independente** ("botão CLIENTE") — hoje é uma subseção dentro do `<details>` "Ver contexto comercial", junto com resumo de conversa, evolução, método e riscos. Não há uma tela própria. | `b3-commercial-reading-expanded-ui.test.mjs` | Decisão de produto: vale a pena destacar como experiência própria, ou a divulgação progressiva atual já é suficiente? Registrar decisão explícita. |
| G2 | Comunicação observada (padrões de comunicação do cliente) | `AUSENTE` | Nenhum campo equivalente em `CommercialReadingCustomer`, `CompanionDiagnostic`, nem na UI. | — | Novo campo + prompt rule com evidência obrigatória (mesma disciplina de D1/E1). |

## H. Histórico da relação

| # | Capacidade | Status | Evidência | Testes | O que falta |
|---|---|---|---|---|---|
| H1 | Primeiro contato, tempo de oportunidade, tempo em conversa, última mensagem de cada lado | `BACKEND_ONLY` | Timestamps por mensagem existem (`occurred_at`/`occurred_at_timestamp` em `diagnostic-input.ts`), e `sales_cycles`/`cycle_events` guardam datas de mudança de estágio. Nada disso é agregado nem exibido como "há quanto tempo" no painel. | — | Construir a agregação e a UI. |
| H2 | Linha do tempo de eventos comerciais (necessidade → apresentação → preço → objeção → follow-up → compromisso) | `BACKEND_ONLY` | `cycle_events` (tipos `stage_changed`, `next_action_set`, `ai_suggestion_applied`, gravados em `apply-suggestion/route.ts`) e `commercial_evolution[]` (V2, quando ativo) contêm os ingredientes. Nenhuma tela de linha do tempo existe. | — | Construir a UI de timeline. |
| H3 | Ações da Yolen (sugestão mostrada/copiada/inserida/ignorada/editada/enviada, CRM/Agenda aceito/rejeitado) visíveis para o vendedor como histórico | `BACKEND_ONLY` | Telemetria completa é **gravada** (ver seção J), mas não existe nenhuma tela que **leia de volta** esses eventos para o vendedor — confirmado pela auditoria da extensão: nenhuma UI lista `action_events` de volta. | `action-telemetry-flow.test.mjs` (cobre a gravação, não a leitura/exibição) | Construir a leitura + UI. |

## I. Tempo, SLA e risco

| # | Capacidade | Status | Evidência | Testes | O que falta |
|---|---|---|---|---|---|
| I1 | "Cliente aguarda resposta há X" | `AUSENTE` | Nenhum cálculo de tempo decorrido desde a última mensagem existe nos motores voltados ao vendedor (V1 ou V2). Os únicos "sinais" de tempo aparecem agregados e só no lado gerencial (`opportunity_stagnation`, `overdue_follow_up` em `managerial-intelligence-contract.ts`) — produto diferente, escopo diferente (ver contrato de produto, seção 13). | — | Construir do zero: cálculo + regra de SLA configurável + UI. |
| I2 | Regra de SLA configurável por empresa | `AUSENTE` | Não encontrado em `commercial-config.ts` nem em nenhum contrato. | — | idem. |
| I3 | Classificação qualitativa de risco por demora (sem inventar percentual) | `AUSENTE` | idem — mas a *regra* de não inventar percentual sem calibração (contrato de produto, seção 10.1) já é coerente com a disciplina de evidência aplicada em outras partes do V2; só falta a capacidade em si existir. | — | idem. |

## J. Alertas

| # | Capacidade | Status | Evidência | Testes | O que falta |
|---|---|---|---|---|---|
| J1 | Pressão excessiva / mensagem sensível antes de enviar | `IMPLEMENTADO` | Pre-send gate, condições `wait_pressure` e `sensitive_condition` (regex sobre "desconto", "garanto", "aprovado" etc. no rascunho do vendedor). | `b4-pre-send-assistant.test.mjs` | — |
| J2 | Objeção/pergunta pendente ao tentar fechar | `IMPLEMENTADO` | Pre-send gate, condição `pending_issue`. | `b4-pre-send-gate.test.mjs` | — |
| J3 | Saída do método ao tentar fechar | `IMPLEMENTADO` | Pre-send gate, condição `method_premature_close`. | `b4-pre-send-gate.test.mjs` | Só dispara no momento de enviar, não como alerta permanente — avaliar se isso é suficiente ou se o contrato quer um alerta mais cedo. |
| J4 | Compromisso/agenda conflitante | `IMPLEMENTADO` | Pre-send gate, condição `agenda_conflict`. | `b4-pre-send-gate.test.mjs` | — |
| J5 | Cliente aguardando / oportunidade parada / SLA estourando como alerta | `BLOQUEADO` (depende de I1-I3) | Sem o dado de tempo/SLA (seção I), não há como gerar este alerta. | — | Depende de I. |
| J6 | Informação contraditória como alerta | `AUSENTE` | Não encontrado nenhum mecanismo de detecção de contradição entre mensagens/estado. | — | Novo mecanismo. |

## K. Segurança — invariantes (contrato de produto, seção 12)

| # | Invariante | Status | Evidência |
|---|---|---|---|
| K1 | CRM nunca alterado automaticamente | `IMPLEMENTADO` | `automatic_crm_write: false` fixo em `StatefulCopilotActivationDecision` (`stateful-copilot-activation-gate.ts`) e em toda saída do runtime orchestrator; `apply-suggestion/route.ts` só grava mediante `POST` explícito do usuário com status idêntico ao sugerido. |
| K2 | Agenda nunca alterada automaticamente | `IMPLEMENTADO` | Mesma evidência de K1 (`automatic_agenda_write: false`). |
| K3 | Confirmação humana obrigatória para toda sugestão operacional | `IMPLEMENTADO` | `requires_human_confirmation: true` validado (`requireTrue`) em `commercial-reading-contract.ts` e `diagnostic-contract.ts`; UI usa `window.confirm` com texto explícito antes de qualquer chamada de API (`applyCurrentSuggestion`, `content-script.js:11880`). |
| K4 | Isolamento por `company_id` | `IMPLEMENTADO` | Checagem de `company_memberships` + `sales_cycles.company_id` em `apply-suggestion/route.ts`; `createLoadedStateReader` no orquestrador stateful valida escopo (`company_id`/`cycle_id`/`conversation_key`) antes de reutilizar leitura. |
| K5 | Evidência obrigatória para toda afirmação | `IMPLEMENTADO` | `normalizeEvidenceIds`/`normalizeReferences` em ambos os contratos (V1-diagnóstico e V2) rejeitam afirmações sem `evidence_message_ids`/`memory_ids` válidos contra o conjunto de mensagens disponíveis. |
| K6 | Persistência confirmada antes de exposição stateful | `IMPLEMENTADO` | Runtime orchestrator só retorna `mode: 'active'` após `persistence_result.mode === 'persisted'` (ver PR #183 e `stateful-copilot-runtime-orchestrator.ts`); checagem de prontidão `stateful_persistence_enabled`/`stateful_exposure_enabled` em `stateful-copilot-active-pilot-readiness.ts`. |
| K7 | Fallback seguro (V1) sempre disponível | `IMPLEMENTADO` | Confirmado extensivamente na auditoria do P1-02: qualquer falha, timeout ou deadline do V2 retorna `active_fallback_v1` preservando a resposta V1. |
| K8 | Sem invenção de preço/desconto/promessa/produto | `PARCIAL` | Regras existem como **instrução de prompt** (`commercial-behavior-prompt-rules.ts`, `commercial-product-prompt-rules.ts`) e há um freio de código parcial no rascunho do **vendedor** (regex de `sensitive_condition` no pre-send gate) — mas não há um invariante estrutural que impeça o **modelo** de sugerir um preço/desconto inventado na leitura comercial em si (diferente de K5, que exige evidência textual, mas não valida que o valor citado é real). |
| K9 | Sem inversão comprador/fornecedor | `IMPLEMENTADO` | `commercial_role` validado; quando `commercial_role !== 'buyer'`, o executor de comunicação neutraliza deterministicamente qualquer intervenção (`stateful-communication-executor.ts`, bloco de neutralização documentado em comentário). |

## L. Telemetria de ações do vendedor

| # | Capacidade | Status | Evidência | Testes |
|---|---|---|---|---|
| L1 | Sugestão mostrada/copiada/inserida/ignorada/editada/enviada | `IMPLEMENTADO` | `COMPANION_ACTION_TYPES` (`action-events-contract.ts`) + disparo em `content-script.js` (`fireCompanionActionTelemetry`, linhas 10518, 11666, 6377, 6281/10447, 11068, 11074) | `action-telemetry-flow.test.mjs`, `phase-c1-action-telemetry.test.mjs`, `phase-c1-action-telemetry-regression.test.mjs` |
| L2 | CRM aceito/rejeitado, Agenda aceita/rejeitada | `IMPLEMENTADO` | Mesmos arquivos, `registerSuggestionDecisionTelemetry` (linhas 10453-10465) | idem |
| L3 | Bloqueio de vazamento de conteúdo de conversa na telemetria | `IMPLEMENTADO` | `FORBIDDEN_METADATA_KEYS` (`action-events-contract.ts`), checagem recursiva `findForbiddenMetadataPath` | — |

## M. Runtime / latência (P1-02)

| # | Capacidade | Status | Evidência |
|---|---|---|---|
| M1 | Deadline global do ciclo stateful | `IMPLEMENTADO` (corrigido nesta onda) | PR #183, merge `4e58bff0605be8efbc94a3f78faf3a31107a2e9a`, `stateful-copilot-cycle-deadline.ts`. |

---

## P1 conhecidos

| Item | Descrição | Status |
|---|---|---|
| **P1-02** | Deadline global do ciclo stateful / latência agregada sem orçamento (ciclos de 61s–130s observados) | **CORRIGIDO** em PR #183 (merge `4e58bff0605be8efbc94a3f78faf3a31107a2e9a`). |
| **P1-03** | `INVALID_COMMUNICATION_OUTPUT` — retry de comunicação por saída inválida do modelo | **ABERTO**. Evidência adicional encontrada nesta auditoria (sem alterar código): o padrão de retry em `stateful-communication-executor.ts`/`stateful-copilot-orchestrator.ts` só recupera quando a *primeira* tentativa falha rápido com saída inválida — cada tentativa recuperada ainda consome até o timeout individual completo, o que é consistente com os ciclos de ~101s observados no P1-02 (uma etapa rápida + uma etapa de retry no timeout cheio). Não corrigido aqui — fora de escopo desta missão. |
| **P1-04** | Relevância comercial / conversa pessoal interpretada como venda | **EM DESENVOLVIMENTO** pela Frente 1. Evidência encontrada nesta auditoria: o contrato e o motor de relevância comercial (`diagnostic-contract.ts` + `diagnostic-model.ts`) **já existem e têm cobertura de teste**, mas só são alcançáveis pelo endpoint de preview `v2/diagnostic-preview` — não estão ligados ao caminho real de análise usado em produção (nem V1, nem V2). Ver item A1. |

---

## Contagem agregada

Total de capacidades auditadas nesta matriz: **48** (itens A1–M1; as 3
linhas de P1 conhecidos são rastreadas à parte, na seção anterior, e não
entram nesta contagem).

Regra de contagem: quando uma capacidade se comporta de forma diferente no
caminho rico (empresa piloto do V2) e no caminho geral (V1, praticamente
todas as outras empresas) — que é o achado estrutural desta auditoria (ver
topo do documento) — o status contado aqui é o que **a maioria dos
vendedores realmente experimenta hoje**, conforme o critério de "pronto" do
contrato de produto (seção 14: precisa estar ligado ao caminho usado pela
maioria das empresas). A tabela de cada capacidade acima detalha os dois
caminhos quando eles divergem.

| Status | Quantidade | Itens |
|---|---|---|
| `IMPLEMENTADO` | 19 | B4, B6, F1, J1, J2, J3, J4, K1, K2, K3, K4, K5, K6, K7, K9, L1, L2, L3, M1 |
| `PARCIAL` | 12 | A3, B1, B2, B3, B5, C1, D1, E1, E2, F3, G1, K8 |
| `AUSENTE` | 8 | D2, D3, D4, G2, I1, I2, I3, J6 |
| `BACKEND_ONLY` | 4 | D5, H1, H2, H3 |
| `NÃO VALIDADO EM 12A` | 2 | C2, F2 (únicos itens sem nenhum equivalente no caminho geral V1, mas com pipeline completo — contrato+runtime+persistência+UI+teste — só ainda restrito à empresa piloto) |
| `BLOQUEADO` | 3 | A1, A2, J5 |

Total: 19 + 12 + 8 + 4 + 2 + 3 = 48.

---

## Os 10 gaps de maior impacto

Ordenados por impacto na experiência do vendedor médio (não do piloto):

1. **V1 (caminho real de quase todas as empresas) não tem nenhuma
   consciência de método comercial.** (F2) — o vendedor nunca vê "em que
   ponto do método estou" fora do piloto.
2. **Relevância comercial não está ligada à produção.** (A1, P1-04) — sem
   isso, silêncio operacional (A3) e as regras de não-inferência (A2) não
   podem funcionar corretamente em nenhum caminho.
3. **Tempo/SLA/risco de demora não existe para o vendedor.** (I1-I3) — uma
   das perguntas mais repetidas na lista da seção 2 do contrato de produto
   ("há quanto tempo o cliente espera?") não tem resposta hoje, em nenhum
   caminho.
4. **Nenhum histórico/timeline visível da relação**, apesar dos dados
   existirem no banco. (H1-H3) — puro trabalho de exposição, sem precisar
   de novo runtime de IA.
5. **A experiência rica (V2) está presa a uma única empresa piloto**, apesar
   de contrato, runtime, persistência, UI e testes já existirem para quase
   todo o contrato de produto (B, C, D, E, F). O caminho técnico para
   escalar já está pronto; falta decisão/execução de rollout.
6. **V1 (caminho geral) não distingue as 7 categorias de inteligência do
   cliente** — só tem `customer_interests`/`objections` soltos, sem
   evidência por item. (D1 geral)
7. **Concorrentes e produto de interesse do cliente não existem em nenhum
   contrato**, rico ou não. (D3, D4)
8. **Comunicação observada do cliente não existe.** (G2) — uma das
   perguntas explícitas do contrato ("como esse cliente costuma se
   comunicar?") não tem resposta hoje.
9. **P1-03 provavelmente agrava o gap 1-3 acima indiretamente**: parte da
   razão de os ciclos serem lentos (P1-02, já corrigido) é a taxa de retry
   de comunicação — enquanto P1-03 não for corrigido, o deadline de ciclo
   (P1-02) vai continuar acionando fallback com mais frequência do que
   deveria nos casos que precisam da leitura rica.
10. **Compromissos (histórico) e alertas de tempo (cliente
    aguardando/oportunidade parada) não chegam ao vendedor apesar dos dados
    existirem parcialmente** (D5, J5) — trabalho de exposição/composição
    mais do que de novo runtime.

---

## Ordem recomendada de desenvolvimento

Baseada no direcionamento inicial do Controle Mestre, refinada com as
dependências reais encontradas nesta auditoria:

1. **Cérebro confiável** — fechar P1-03 (retry de comunicação) antes de
   qualquer expansão de escopo; ele afeta diretamente a confiabilidade de
   tudo que depende de retries (leitura comercial, coaching, método).
2. **Leitura comercial** — resolver P1-04 (relevância comercial ligada à
   produção): sem isso, nenhuma capacidade de silêncio operacional ou
   regras de não-inferência pode ser confiável em nenhum caminho (V1 ou
   V2).
3. **Coaching** — levar a disciplina de evidência e taxonomia do V2
   (`seller_strengths`/`improvement_points`) para o caminho V1, ou acelerar
   o rollout do V2 além do piloto (ver item 8).
4. **Método** — instrumentar V1 com consciência de método (F2), maior gap
   de impacto imediato encontrado nesta auditoria; construir a narrativa de
   aderência dedicada (F3) reaproveitando os `stages[]` já existentes no V2.
5. **Inteligência do cliente** — completar categorias faltantes (D2-D4,
   G2) e decidir se a experiência consolidada (G1) precisa de uma tela
   própria.
6. **Histórico** — expor o que já existe no banco (H1-H3, D5): é
   principalmente trabalho de agregação e UI, não de novo motor de IA.
7. **Tempo/SLA/risco** — construir do zero (I1-I3), incluindo configuração
   de SLA por empresa; desbloqueia os alertas de tempo (J5).
8. **UX consolidada** — decidir rollout do V2 além da empresa piloto (maior
   alavanca única desta lista: resolve simultaneamente B1, B2, B3, B5, C1,
   C2, D1, E1, E2 para a população geral, porque o trabalho técnico já
   existe).
9. **Testes** — expandir corpus de regressão para cobrir os novos casos
   introduzidos pelos itens 2, 4 e 7 acima antes de promover qualquer um
   deles.
10. **12A** — validação do rollout ampliado (item 8) com uso humano real,
    seguindo a mesma disciplina de piloto já usada para a empresa atual
    (`stateful-copilot-active-pilot-readiness.ts`/
    `stateful-copilot-active-pilot-report.ts`).
11. **12B** — conforme direcionamento do Controle Mestre; a auditoria
    técnica não encontrou pré-requisitos adicionais além dos itens 1-10
    estarem estáveis.
12. **Preparação externa** — conforme direcionamento do Controle Mestre.
13. **12C** — conforme direcionamento do Controle Mestre.
14. **B8** — conforme direcionamento do Controle Mestre.

Não foram criadas fases novas além das já nomeadas pelo Controle Mestre —
os itens 1-9 acima são refinamentos de dependência dentro da sequência já
proposta (cérebro → leitura → coaching → método → cliente → histórico →
tempo → UX → testes), não fases adicionais.
