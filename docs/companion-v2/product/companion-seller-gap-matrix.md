# Matriz de Completude — Yolen Companion para o Vendedor

**Auditado contra:** `main` em `4e58bff0605be8efbc94a3f78faf3a31107a2e9a`.
**Rebaseline pontual:** em `5a48a1ecbc3240c8ad87e84f0789821bbd23ab73`
(branch `feat/companion-client-operational-intelligence`), os itens A1, A2,
A3 e a linha de P1-04 foram reavaliados contra o merge do PR #184
(`0eca3b893ccd70d229a762274ec49ef9d4690ac8`). O restante da matriz (seções
B–M) **não foi reauditado** nesta rebaseline — permanece como estava na
auditoria original, exceto onde uma nota explícita diz o contrário.

**Rebaseline FASE 16.1 (rebaseline de CONTRATO, não de implementação):**
esta rebaseline foi feita contra `main` em
`c073b7035c53c47977a27c60109e5f116b51cce9` (merge do PR #272 — ship da UX8,
4 abas AGORA/MENSAGEM/ANÁLISE/CLIENTE). Entre o SHA da última auditoria de
implementação (`4e58bff0...`) e este HEAD existem **98 commits** que tocam
`app/lib/companion/` e/ou `app/extension/yolen-companion/src/`, incluindo o
próprio ship da UX8. **A FASE 16.1 não reauditou essas 98 mudanças
linha a linha** — isso é o objetivo declarado da FASE 16.2. O que a FASE
16.1 fez:

1. Atualizou o contrato de produto (`companion-seller-product-contract.md`)
   para refletir a arquitetura real de 4 abas e formalizar Decision State,
   Cards de Intervenção, Commercial Brain compartilhado, etc.
2. Ao ler os arquivos-fonte listados na auditoria obrigatória desta fase
   (`companion-seller-information-view.js`, `companion-lead-summary-view.js`,
   `content-script-dom-seller-information-architecture.test.mjs`), encontrou
   evidência concreta e direta de que pelo menos os itens **B2, B3, G1, H1,
   H2, I1, I2, I3 e J5** abaixo têm comportamento visivelmente diferente
   do descrito na auditoria original (ex.: existe hoje um card de risco de
   SLA renderizado em AGORA — "Risco alto na etapa CONTATO" —, existe uma
   aba CLIENTE dedicada com seção "Relacionamento e histórico" e
   "Ver histórico" — `details.yolen-client-timeline` —, e existe cálculo de
   espera do cliente — `context.waiting.state === 'customer_waiting_for_seller'`
   — em `companion-seller-information-view.js`). Essas linhas foram marcadas
   `A REAUDITAR NA 16.2` abaixo, com a evidência pontual encontrada anotada,
   **sem** atribuir a elas um novo veredito de completude — decidir se elas
   agora são `IMPLEMENTADO`, `PARCIAL` ou outra coisa exige a mesma
   disciplina de evidência ponta-a-ponta (runtime → produção → UI → teste)
   usada no resto desta matriz, o que é trabalho de auditoria, não de
   rebaseline de contrato.
3. Todo o restante da matriz (A, C, D, E, F, K, L, M, e os itens de B/G/H/I/J
   não listados acima) **não foi tocado nem verificado nesta fase** e deve
   ser tratado como **não confirmado contra o HEAD atual** até a FASE 16.2 —
   mesmo onde o texto abaixo ainda diz `IMPLEMENTADO`/`PARCIAL`/`AUSENTE` sem
   a anotação `A REAUDITAR NA 16.2`. Esta rebaseline optou por marcar
   explicitamente apenas os itens com evidência direta encontrada durante a
   leitura obrigatória da FASE 16.1, em vez de aplicar a anotação a todas as
   ~40 linhas por precaução genérica — isso seria indistinguível de uma
   auditoria completa disfarçada, que a FASE 16.1 foi instruída a não fazer.

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
| `A REAUDITAR NA 16.2` | O veredito anterior tem evidência concreta de estar obsoleto (código lido na FASE 16.1 contradiz a descrição), mas a FASE 16.1 não fez a auditoria ponta-a-ponta necessária para atribuir um novo veredito de completude. Não leia como "implementado" nem como "ausente" — leia como "verificar antes de confiar". |

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

**Atualização da rebaseline (P1-04):** o filtro de relevância comercial
(seção A abaixo) **não** foi resolvido esperando pelo motor "Diagnóstico
Fase 1" do item 2 — esse motor de preview continua isolado, sem mudanças.
Em vez disso, a Frente 1 introduziu um módulo compartilhado leve
(`commercial-relevance.ts`) e ligou-o diretamente aos dois caminhos reais
(V1 em `sales-copilot.ts`, V2 em `stateful-copilot-engine.ts` e
`diagnostic-contract.ts`), com fail-closed estrutural (preserva estado
anterior / recusa CRM-Agenda-intervenção) quando a relevância não é
confirmada. O achado estrutural de três motores acima continua válido; só a
lacuna específica de relevância comercial foi fechada por um caminho mais
direto do que o antecipado na auditoria original.

---

## A. Compreensão da conversa

| # | Capacidade | Status | Evidência | Testes | O que falta |
|---|---|---|---|---|---|
| A1 | Relevância comercial (comercial / não comercial / incerto) antes de qualquer ação | `IMPLEMENTADO` *(atualizado em `feat/companion-client-operational-intelligence`, rebaseline pós-P1-04)* | P1-04 (PR #184, merge `0eca3b893ccd70d229a762274ec49ef9d4690ac8`) ligou a relevância comercial aos dois caminhos reais de produção. Novo módulo compartilhado `commercial-relevance.ts` (`isCommerciallyActionable`). **V1**: `sales-copilot.ts` classifica `commercial_relevance` via IA **antes** de extrair qualquer fato comercial; quando `non_commercial`/`uncertain`, `buildCommerciallyInactiveSuggestion` retorna fail-closed com `summary: 'Conversa sem evidência comercial relevante para este ciclo.'`, sem CRM/Agenda/próxima ação. **V2**: `stateful-copilot-engine.ts` preserva o estado anterior inteiro (fatos/necessidades/objeções/etc.) quando `commercial_role !== 'buyer'` ou a relevância não é acionável, em vez de deixar o modelo reinterpretar. `diagnostic-contract.ts` também fail-closed para `uncertain` (antes só bloqueava `non_commercial`). | `commercial-relevance-corpus.test.mjs` (542 linhas), `commercial-relevance-regression.test.mjs` (277 linhas), `diagnostic-contract.test.mjs`, `stateful-copilot-engine.test.mjs`, `stateful-communication.test.mjs` | Nenhuma pendência estrutural. Ressalva: a classificação em si depende do modelo de IA seguir a instrução do prompt — mitigado por corpus de regressão dedicado, mas não é uma garantia matemática (mesma natureza de qualquer classificação semântica por IA). |
| A2 | Regras de não-inferência (compromisso ≠ comercial, data ≠ Agenda, contato no CRM ≠ conversa comercial) | `IMPLEMENTADO` *(atualizado nesta rebaseline)* | O novo prompt de `sales-copilot.ts` (`buildSystemPrompt`) declara explicitamente: *"O fato de a pessoa existir no CRM, ter respondido, mencionar valor, data ou horário, ou assumir um compromisso não torna a sessão comercial."* e *"Compromisso não é sinônimo de compromisso comercial. Prometer enviar documento pessoal, foto ou currículo; ligar ao sair do trabalho; jantar; tomar algo; ou ir para casa não cria follow-up nem Agenda comercial."* — regras quase literais do contrato de produto (seção 3.1). | Mesmo corpus de A1 (`commercial-relevance-corpus.test.mjs` cobre casos de compromisso pessoal/data/horário não-comercial). | Nenhuma pendência estrutural nesta rebaseline; mesma ressalva de A1 sobre depender de classificação por IA. |
| A3 | Silêncio operacional explícito ("conversa sem evidência comercial relevante") | `IMPLEMENTADO` *(atualizado nesta rebaseline)* | Agora que A1 chega à produção, o texto de silêncio operacional do contrato de produto (seção 5.1) é literal no código: `buildCommerciallyInactiveSuggestion` gera `summary: 'Conversa sem evidência comercial relevante para este ciclo.'` quando `non_commercial`, que é exatamente o campo (`suggestion.summary`) renderizado como "momento atual" no card legado da extensão. Para `uncertain`, mensagem equivalente e igualmente fail-closed. | `commercial-relevance-corpus.test.mjs`, `commercial-relevance-regression.test.mjs` | Nenhuma pendência estrutural. Não verificado nesta rebaseline: se o texto exato aparece corretamente formatado na extensão em uso real (a UI já lia `suggestion.summary` antes do P1-04 — não houve mudança de contrato de UI, só de conteúdo semântico). |

## B. Painel principal

| # | Capacidade | Status | Evidência | Testes | O que falta |
|---|---|---|---|---|---|
| B1 | Momento atual (frase curta e correta) | `PARCIAL` | Rico: `commercial_reading.conversation_summary.current_state.summary` renderizado como kicker (`content-script.js` ~8269). Geral (V1): `suggestion.summary`, frase curta gerada por regra/IA sem a mesma disciplina de evidência. | `b3-commercial-reading-ui.test.mjs` | Levar a versão rica para além da empresa piloto. |
| B2 | Método (etapa atual) visível no painel padrão | `A REAUDITAR NA 16.2` *(evidência de mudança encontrada na FASE 16.1)* | Auditoria original: `PARCIAL` — só existia na visão expandida. Evidência nova (16.1, não confirmada ponta-a-ponta): `companion-seller-information-view.js` tem `renderNowMethodSnapshot(reading)`, que monta um bloco `data-yolen-now-method` com etapa atual e aderência para a área AGORA (`nowPanel`) — ex.: teste de DOM `content-script-dom-seller-information-architecture.test.mjs` (`'V2 rico distribui...'`) verifica `nowPanel` contendo indicação de risco de método. Precisa reauditoria completa (runtime → produção → UI → teste) antes de virar `IMPLEMENTADO`. | `b3-commercial-reading-method-ui.test.mjs`, `content-script-dom-seller-information-architecture.test.mjs` | Reauditoria 16.2: confirmar se isso chega além do piloto V2 e se cobre `not_configured`. |
| B3 | Aderência ao método no painel | `A REAUDITAR NA 16.2` *(evidência de mudança encontrada na FASE 16.1)* | Mesma evidência nova de B2 — `renderNowMethodSnapshot` inclui `getAdherenceClass`/`getMethodAdherenceLabel` no snapshot de AGORA quando o status não é `off_method` (esse caso vira Card de Intervenção via `resolveSellerAttentionSnapshot`, ver B4). Precisa reauditoria completa antes de virar `IMPLEMENTADO`. | idem | idem B2. |
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
| G1 | Experiência única consolidando objetivo/necessidades/objeções/etc. do cliente | `A REAUDITAR NA 16.2` *(evidência de mudança encontrada na FASE 16.1)* | Auditoria original: `PARCIAL` — não havia tela própria. Evidência nova (16.1, não confirmada ponta-a-ponta): a UX8 tem uma área própria `data-yolen-seller-area="client"` / `data-yolen-seller-panel="client"`, renderizada por `renderClientCommercialArea` (`companion-seller-information-view.js`), com grupos dedicados (`wants`, `context`, `decision`, `communication`, `missing-discovery`, `open`, `objections`, `commitments`, `history`) — exatamente a "experiência dedicada" que a linha original dizia faltar. A decisão de produto registrada aqui está resolvida na prática; falta confirmar cobertura e caminho de produção na 16.2. | `b3-commercial-reading-expanded-ui.test.mjs`, `content-script-dom-seller-information-architecture.test.mjs` | Reauditoria 16.2: confirmar alcance em produção (V1 vs. piloto V2) e se cobre todas as categorias do contrato (seção 7). |
| G2 | Comunicação observada (padrões de comunicação do cliente) | `AUSENTE` | Nenhum campo equivalente em `CommercialReadingCustomer`, `CompanionDiagnostic`, nem na UI. | — | Novo campo + prompt rule com evidência obrigatória (mesma disciplina de D1/E1). |

## H. Histórico da relação

| # | Capacidade | Status | Evidência | Testes | O que falta |
|---|---|---|---|---|---|
| H1 | Primeiro contato, tempo de oportunidade, tempo em conversa, última mensagem de cada lado | `A REAUDITAR NA 16.2` *(evidência de mudança encontrada na FASE 16.1)* | Auditoria original: `BACKEND_ONLY` — nada era agregado nem exibido. Evidência nova (16.1, não confirmada ponta-a-ponta): o teste de DOM `content-script-dom-seller-information-architecture.test.mjs` afirma que o painel CLIENTE mostra texto correspondente a "Relacionamento e histórico" e "Cliente aguardando você", alimentado por um `clientContextResult`/`defaultClientContext` com campo `sla`/`timeline`. Isso sugere agregação e UI já existem pelo menos no piloto. | `content-script-dom-seller-information-architecture.test.mjs` | Reauditoria 16.2: confirmar fonte de dados real (não só fixture de teste) e alcance em produção. |
| H2 | Linha do tempo de eventos comerciais (necessidade → apresentação → preço → objeção → follow-up → compromisso) | `A REAUDITAR NA 16.2` *(evidência de mudança encontrada na FASE 16.1)* | Auditoria original: `BACKEND_ONLY` — nenhuma tela de timeline existia. Evidência nova (16.1, não confirmada ponta-a-ponta): o mesmo teste de DOM afirma `clientPanel.querySelector('details.yolen-client-timeline')` e o texto "Ver histórico", alimentados por `clientContextResult.timeline` (`{ type: 'message', occurred_at, label }`). | `content-script-dom-seller-information-architecture.test.mjs` | Reauditoria 16.2: confirmar runtime real por trás de `timeline` e alcance em produção. |
| H3 | Ações da Yolen (sugestão mostrada/copiada/inserida/ignorada/editada/enviada, CRM/Agenda aceito/rejeitado) visíveis para o vendedor como histórico | `BACKEND_ONLY` *(não reauditado nesta fase — nenhuma evidência nova encontrada na leitura obrigatória da 16.1)* | Telemetria completa é **gravada** (ver seção J), mas não existe nenhuma tela que **leia de volta** esses eventos para o vendedor — confirmado pela auditoria da extensão original. A leitura obrigatória da FASE 16.1 não encontrou evidência de mudança aqui (diferente de H1/H2), mas também não confirmou a ausência contra o HEAD atual — tratar como não confirmado. | `action-telemetry-flow.test.mjs` (cobre a gravação, não a leitura/exibição) | Reauditoria 16.2: confirmar se `H1`/`H2` (linha do tempo) já cobrem parte deste item. |

## I. Tempo, SLA e risco

| # | Capacidade | Status | Evidência | Testes | O que falta |
|---|---|---|---|---|---|
| I1 | "Cliente aguarda resposta há X" | `A REAUDITAR NA 16.2` *(evidência de mudança encontrada na FASE 16.1)* | Auditoria original: `AUSENTE`. Evidência nova (16.1, não confirmada ponta-a-ponta): `companion-seller-information-view.js` tem `context.waiting.state === 'customer_waiting_for_seller'` e `context.waiting.waiting_duration_ms`, consumidos por `resolveSellerAttentionSnapshot` para gerar um Card de atenção "Cliente aguardando" em AGORA quando não há SLA configurado. Isso contradiz diretamente "nenhum cálculo de tempo decorrido existe". | `content-script-dom-seller-information-architecture.test.mjs` | Reauditoria 16.2: confirmar de onde vem `context.waiting` em produção (não só no fixture de teste) e se chega além do piloto. |
| I2 | Regra de SLA configurável por empresa | `A REAUDITAR NA 16.2` *(evidência de mudança encontrada na FASE 16.1)* | Auditoria original: `AUSENTE`. Evidência nova (16.1, não confirmada ponta-a-ponta): o mesmo arquivo tem `getLiveSlaRisk(sla, generatedAt, now)` operando sobre `sla.configured`, `sla.target_minutes`, `sla.warning_minutes`, `sla.danger_minutes`, `sla.stage`/`stage_label` — nomenclatura de uma regra de SLA por etapa, testada em `content-script-dom-seller-information-architecture.test.mjs` (`sla: { configured: true, applicable: true, stage: 'contato', ... }`). Isso contradiz diretamente "não encontrado em `commercial-config.ts` nem em nenhum contrato" como afirmação atual. | idem | Reauditoria 16.2: confirmar se `commercial-config.ts` (ou outro arquivo) já tem o schema de configuração de SLA por empresa, e se este dado chega via API real. |
| I3 | Classificação qualitativa de risco por demora (sem inventar percentual) | `A REAUDITAR NA 16.2` *(evidência de mudança encontrada na FASE 16.1)* | Auditoria original: `AUSENTE`. Evidência nova (16.1, não confirmada ponta-a-ponta): `getLiveSlaRisk` retorna exatamente `'low' | 'medium' | 'high' | null` — nunca um percentual — coerente com a regra de honestidade estatística do contrato de produto (seção 10.1, agora seção 12 desta rebaseline). | idem | idem I1/I2. |

## J. Alertas

| # | Capacidade | Status | Evidência | Testes | O que falta |
|---|---|---|---|---|---|
| J1 | Pressão excessiva / mensagem sensível antes de enviar | `IMPLEMENTADO` | Pre-send gate, condições `wait_pressure` e `sensitive_condition` (regex sobre "desconto", "garanto", "aprovado" etc. no rascunho do vendedor). | `b4-pre-send-assistant.test.mjs` | — |
| J2 | Objeção/pergunta pendente ao tentar fechar | `IMPLEMENTADO` | Pre-send gate, condição `pending_issue`. | `b4-pre-send-gate.test.mjs` | — |
| J3 | Saída do método ao tentar fechar | `IMPLEMENTADO` | Pre-send gate, condição `method_premature_close`. | `b4-pre-send-gate.test.mjs` | Só dispara no momento de enviar, não como alerta permanente — avaliar se isso é suficiente ou se o contrato quer um alerta mais cedo. |
| J4 | Compromisso/agenda conflitante | `IMPLEMENTADO` | Pre-send gate, condição `agenda_conflict`. | `b4-pre-send-gate.test.mjs` | — |
| J5 | Cliente aguardando / oportunidade parada / SLA estourando como alerta | `A REAUDITAR NA 16.2` *(evidência de mudança encontrada na FASE 16.1)* | Auditoria original: `BLOQUEADO` (dependia de I1-I3, então `AUSENTE`). Evidência nova (16.1, não confirmada ponta-a-ponta): como I1-I3 têm evidência de já existirem (ver acima), `resolveSellerAttentionSnapshot` já gera candidatos de atenção com `source: 'sla'` e `source: 'waiting'`, priorizados junto com risco de atendimento e desvio de método — exatamente o alerta que esta linha descreve. | idem | Reauditoria 16.2: depende da confirmação de I1-I3; se confirmados, esta linha provavelmente deixa de estar bloqueada. |
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
| **P1-04** | Relevância comercial / conversa pessoal interpretada como venda | **CORRIGIDO TECNICAMENTE** — PR #184, merge `0eca3b893ccd70d229a762274ec49ef9d4690ac8`. Confirmado nesta rebaseline: módulo compartilhado `commercial-relevance.ts` ligado a `sales-copilot.ts` (V1) e a `stateful-copilot-engine.ts`/`diagnostic-contract.ts` (V2), com fail-closed estrutural e corpus de regressão dedicado (`commercial-relevance-corpus.test.mjs`, `commercial-relevance-regression.test.mjs`). Ver A1/A2/A3, atualizados nesta rebaseline. "Tecnicamente" porque a classificação em si continua dependendo do modelo de IA seguir a instrução — validado por corpus, não uma prova matemática; consistente com a natureza de qualquer classificação semântica por IA. |

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
| `IMPLEMENTADO` | 22 | A1, A2, A3, B4, B6, F1, J1, J2, J3, J4, K1, K2, K3, K4, K5, K6, K7, K9, L1, L2, L3, M1 |
| `PARCIAL` | 8 | B1, B5, C1, D1, E1, E2, F3, K8 |
| `AUSENTE` | 5 | D2, D3, D4, G2, J6 |
| `BACKEND_ONLY` | 2 | D5, H3 |
| `NÃO VALIDADO EM 12A` | 2 | C2, F2 (únicos itens sem nenhum equivalente no caminho geral V1, mas com pipeline completo — contrato+runtime+persistência+UI+teste — só ainda restrito à empresa piloto) |
| `BLOQUEADO` | 0 | — (J5 saiu deste bucket nesta rebaseline, ver abaixo) |
| `A REAUDITAR NA 16.2` | 9 | B2, B3, G1, H1, H2, I1, I2, I3, J5 — evidência concreta de mudança encontrada na leitura obrigatória da FASE 16.1 (ver nota de rebaseline no topo do documento), sem auditoria ponta-a-ponta para atribuir veredito novo. |

Total: 22 + 8 + 5 + 2 + 2 + 0 + 9 = 48.

*(Atualizado na rebaseline pós-P1-04: A1, A2 e A3 saíram de
`BLOQUEADO`/`PARCIAL` para `IMPLEMENTADO`.)*

*(Atualizado na rebaseline FASE 16.1: B2, B3, G1, H1, H2, I1, I2, I3 e J5
saíram de `PARCIAL`/`AUSENTE`/`BACKEND_ONLY`/`BLOQUEADO` para
`A REAUDITAR NA 16.2`, por evidência concreta e direta de código lido durante
a auditoria obrigatória desta fase — ver nota de rebaseline no topo do
documento. Nenhum destes itens foi promovido a `IMPLEMENTADO`: a FASE 16.1
não fez a verificação ponta-a-ponta necessária para isso. Nenhum outro item
mudou.)*

---

## Os 10 gaps de maior impacto

Ordenados por impacto na experiência do vendedor médio (não do piloto).
*(Atualizado nesta rebaseline: o gap "relevância comercial não está ligada à
produção" da auditoria original foi **removido desta lista** — P1-04 o
resolveu, ver seção A. Isso promoveu o gap de tempo/SLA para a segunda
posição e trouxe um novo décimo item.)*

**Nota da rebaseline FASE 16.1:** os itens 2, 3 e 9 abaixo (tempo/SLA,
histórico/timeline, compromissos+alertas de tempo) citam I1-I3, H1-H3 e J5
como lacunas totalmente ausentes. A leitura obrigatória desta fase encontrou
evidência direta de código (`companion-seller-information-view.js`,
`companion-lead-summary-view.js`) de que pelo menos parte dessas capacidades
já existe hoje, pelo menos no caminho testado pela UX8 — ver a marcação
`A REAUDITAR NA 16.2` nas linhas correspondentes acima. Esta lista de "10
gaps" **não foi reordenada nem re-priorizada** nesta rebaseline — isso é
trabalho da FASE 16.2, depois da reauditoria ponta-a-ponta. Trate os itens
2, 3 e 9 abaixo como desatualizados até lá.

1. **V1 (caminho real de quase todas as empresas) não tem nenhuma
   consciência de método comercial.** (F2) — o vendedor nunca vê "em que
   ponto do método estou" fora do piloto.
2. **Tempo/SLA/risco de demora não existe para o vendedor.** (I1-I3) — uma
   das perguntas mais repetidas na lista da seção 2 do contrato de produto
   ("há quanto tempo o cliente espera?") não tem resposta hoje, em nenhum
   caminho. **Esta é a missão em andamento nesta branch
   (`feat/companion-client-operational-intelligence`).**
3. **Nenhum histórico/timeline visível da relação**, apesar dos dados
   existirem no banco. (H1-H3) — puro trabalho de exposição, sem precisar
   de novo runtime de IA. **Também parte desta missão.**
4. **A experiência rica (V2) está presa a uma única empresa piloto**, apesar
   de contrato, runtime, persistência, UI e testes já existirem para quase
   todo o contrato de produto (B, C, D, E, F). O caminho técnico para
   escalar já está pronto; falta decisão/execução de rollout.
5. **V1 (caminho geral) não distingue as 7 categorias de inteligência do
   cliente** — só tem `customer_interests`/`objections` soltos, sem
   evidência por item. (D1 geral)
6. **Concorrentes e produto de interesse do cliente não existem em nenhum
   contrato**, rico ou não. (D3, D4)
7. **Comunicação observada do cliente não existe.** (G2) — uma das
   perguntas explícitas do contrato ("como esse cliente costuma se
   comunicar?") não tem resposta hoje.
8. **P1-03 provavelmente agrava a experiência de latência ainda hoje**:
   parte da razão de os ciclos serem lentos (P1-02, já corrigido) é a taxa
   de retry de comunicação — enquanto P1-03 não for corrigido, o deadline
   de ciclo (P1-02) vai continuar acionando fallback com mais frequência do
   que deveria nos casos que precisam da leitura rica.
9. **Compromissos (histórico) e alertas de tempo (cliente
   aguardando/oportunidade parada) não chegam ao vendedor apesar dos dados
   existirem parcialmente** (D5, J5) — trabalho de exposição/composição
   mais do que de novo runtime. **J5 depende diretamente do item 2 acima.**
10. **"Sem invenção de preço/desconto/promessa" (K8) continua sendo regra de
    prompt, não invariante estrutural de código** — diferente das outras
    invariantes de segurança (K1-K7, K9), que têm validação de código.
    Existe um freio parcial no rascunho do vendedor (pre-send gate), mas
    nada equivalente sobre a leitura comercial gerada pela IA em si.

---

## Ordem recomendada de desenvolvimento

Baseada no direcionamento inicial do Controle Mestre, refinada com as
dependências reais encontradas nesta auditoria:

1. **Cérebro confiável** — fechar P1-03 (retry de comunicação) antes de
   qualquer expansão de escopo; ele afeta diretamente a confiabilidade de
   tudo que depende de retries (leitura comercial, coaching, método).
2. ~~**Leitura comercial** — resolver P1-04~~ — **concluído tecnicamente**
   (PR #184, ver seção A). Item mantido na numeração original só para
   preservar a rastreabilidade da ordem; não requer mais trabalho aqui.
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
   **Em andamento em `feat/companion-client-operational-intelligence`.**
7. **Tempo/SLA/risco** — construir do zero (I1-I3), incluindo configuração
   de SLA por empresa; desbloqueia os alertas de tempo (J5). **Em andamento
   na mesma branch, junto com o item 6** — ambos fazem parte da mesma
   entrega de "inteligência operacional do cliente" (histórico da relação +
   tempo + waiting state + risco objetivo), deliberadamente sem tocar em
   coaching/método/relevância semântica (itens 3-5 acima, fora de escopo
   desta onda).
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
