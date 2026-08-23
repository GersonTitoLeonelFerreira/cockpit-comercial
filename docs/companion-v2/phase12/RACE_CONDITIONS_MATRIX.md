# Matriz de condição de corrida — arquitetura progressiva do Companion

## Papel deste documento

Cenários obrigatórios (A–I, conforme mandato da Frente Paralela 3) para
provar que a arquitetura progressiva (captura contínua → debounce → leitura
rápida → relevance gate → V2 profundo em background → resultado
seller-facing) não deixa um job obsoleto vencer, vazar entre conversas, ou
duplicar efeito. Cada cenário indica se já é executável hoje (contra o
comportamento real do V1/pré-background) ou se depende dos PRs A/B/C da
Frente Principal.

Convenção de classificação (mandato, seção 14): `PASS`, `PASS COM RESSALVA`,
`FAIL`, `BLOCKER`. Vazamento cross-conversa/cross-tenant/cross-cycle e
resultado obsoleto sobrescrevendo estado atual são `BLOCKER` por definição.

## Achado que atravessa toda a matriz

A auditoria desta frente (sem alterar runtime) confirmou que **o gap central
dos cenários B, D, E, F e I já existe hoje, antes de qualquer arquitetura de
background** — porque o único guard de "resposta ainda é válida para a
conversa atual" que existe no código é `isStillCurrentContext()`, usado
somente por `loadCompanionClientContextForCurrentCycle()`
(content-script.js:8608-8618). `analyzeCurrentConversation()`
(content-script.js:11340-11527) não tem esse guard: ela captura `cycleId` no
início e aplica `conversationAnalysis: result.payload.data`
incondicionalmente quando a resposta chega, sem verificar se a conversa
ainda é a mesma.

Isso significa que a nova arquitetura progressiva não está introduzindo um
risco novo — ela está tornando um risco **já existente e já comprovado**
muito mais provável de se manifestar, porque troca uma chamada síncrona
curta por um job de segundo plano genuinamente longo.

**Prova executável desta afirmação**, sem alterar nenhum arquivo de runtime:

```text
app/extension/yolen-companion/tests/e3-dom/content-script-dom-stale-analysis-cross-conversation-race.test.mjs
```

Rodar com:

```bash
node --test --test-force-exit app/extension/yolen-companion/tests/e3-dom/content-script-dom-stale-analysis-cross-conversation-race.test.mjs
```

Este teste carrega o `content-script.js` real (não modificado) e falha hoje
— a falha é a evidência do gap, não um teste quebrado. O sintoma real não é
"o texto da conversa A aparece na tela da B": é mais sutil — o resultado
válido de B é silenciosamente revertido para o banner genérico "A conversa
mudou desde a última leitura", porque o fingerprint de A contamina o estado
interno usado para decidir se a leitura de B está desatualizada. Ele deve
virar verde quando um guard equivalente a `isStillCurrentContext()` for
aplicado a `analyzeCurrentConversation` — fora do escopo desta frente.

## Cenário A — Conversa A inicia análise, usuário permanece em A, resultado chega

| Campo | Conteúdo |
|---|---|
| Setup | Job (hoje: chamada síncrona) iniciado para A; usuário não sai de A. |
| Esperado | Resultado de A é aplicado normalmente à tela de A. |
| Estado hoje | Caminho feliz, já funciona (é o único caminho que o V1 exercita hoje). |
| Executável agora? | Sim — coberto implicitamente por qualquer teste de análise básica (`content-script-dom-seller-information-architecture.test.mjs`). |
| Pendente PR A/B/C | Reexecutar contra leitura rápida + resultado profundo quando existirem dois estágios. |

## Cenário B — A inicia, usuário troca para B, resultado de A chega depois

| Campo | Conteúdo |
|---|---|
| Esperado | Resultado de A nunca aparece em B. |
| Classificação se violado | `BLOCKER`. |
| Estado hoje | **FAIL confirmado** — ver "Achado que atravessa toda a matriz" acima. |
| Executável agora? | **Sim, já executado e falhando** — `content-script-dom-stale-analysis-cross-conversation-race.test.mjs`. |
| Pendente PR A/B/C | Reexecutar o mesmo teste (ou uma variante) contra a leitura rápida e contra o resultado profundo em background quando existirem; o guard precisa cobrir os dois estágios, não só a chamada única de hoje. |

## Cenário C — A dispara com watermark 1, nova mensagem eleva para watermark 2, resultado de watermark 1 chega depois

| Campo | Conteúdo |
|---|---|
| Esperado | Resultado de watermark 1 não sobrescreve a interpretação da versão 2. |
| Classificação se violado | `BLOCKER`. |
| Estado hoje (servidor) | **Parcialmente coberto** na escrita: a persistência (`stateful-copilot-persistence-executor.ts`/`stateful-copilot-supabase-writer.ts`) já faz compare-and-swap por `expected_previous_state_version` — uma escrita de versão desatualizada recebe `mode: 'conflict'` e não substitui o estado persistido (`stateful-copilot-supabase-writer.test.mjs`). |
| Estado hoje (extensão) | **Não coberto.** Mesmo gap do cenário B: se o watermark 1 (fingerprint antigo) responder depois do watermark 2 já estar em tela, `analyzeCurrentConversation` aplica o payload incondicionalmente. |
| Executável agora? | Parcialmente — a parte de persistência já tem teste (reaproveitável, não é novo). A parte de exibição (extensão) é o mesmo mecanismo do cenário B; uma variante same-conversation (troca de watermark sem trocar de conversa) pode ser adicionada reaproveitando o harness do cenário B. |
| Pendente PR A/B/C | Definir qual watermark único a arquitetura progressiva vai usar (ver `PROGRESSIVE_BACKGROUND_VALIDATION_CONTRACT.md`, "watermark canônico") e verificar que o job em segundo plano carrega esse watermark do início ao fim. |

## Cenário D — Watermark 1 dispara dois jobs por corrida (double-submit)

| Campo | Conteúdo |
|---|---|
| Esperado | Idempotência/coalescing impede dois resultados válidos concorrentes. |
| Classificação se violado | `FAIL` (duplicação de efeito) ou `BLOCKER` (se ambos persistirem estados divergentes). |
| Estado hoje | A escrita final é arbitrada pelo CAS (um dos dois recebe `conflict` e cai em fallback V1) — mas **nada impede as duas computações completas de rodarem em paralelo** antes disso; não existe single-flight/coalescing por `(company_id, cycle_id, conversation_key)` no servidor. Identificado como gap na auditoria (§5 do relatório desta frente). |
| Executável agora? | O comportamento de CAS-conflict já tem teste de forma (`stateful-copilot-supabase-writer.test.mjs`); **não existe teste de que duas requisições concorrentes de fato disparam dois pipelines completos** — seria um teste novo de integração no orquestrador, hoje sem harness de concorrência real pronto. |
| Pendente PR A/B/C | Quando existir uma fila/worker real, testar diretamente que um segundo `enqueue` para a mesma chave de escopo enquanto o primeiro está em voo não cria um segundo job (ou cria, mas o resultado duplicado é descartado/coalescido antes de chegar ao vendedor). |

## Cenário E — A inicia, usuário troca B → C → A

| Campo | Conteúdo |
|---|---|
| Esperado | Ao voltar para A, só aparece estado pertencente a A. |
| Classificação se violado | `BLOCKER`. |
| Estado hoje | Mesma causa raiz do cenário B, agravada: múltiplos jobs podem estar em voo ao mesmo tempo (A, B e C). Sem guard de identidade, qualquer um dos três pode "vencer" por ordem de chegada, não por relevância. |
| Executável agora? | Extensão do harness do cenário B — trivial de estender (mais uma troca de conversa e mais um `analysisResult` condicional por `cycle_id`), mas registrado aqui como **pendente** desta frente para não duplicar esforço até o resultado do cenário B ser triado pelo Controle Mestre. |
| Pendente PR A/B/C | Reexecutar contra jobs de background reais assim que existirem. |

## Cenário F — Refresh da página enquanto job A existe

| Campo | Conteúdo |
|---|---|
| Esperado | Nenhum estado de outra conversa aparece após o reload. |
| Classificação se violado | `BLOCKER` se cross-scope; `FAIL` se só reaplicar resultado obsoleto do mesmo escopo. |
| Estado hoje | Auditoria confirmou que **nada persiste** hoje entre reload além de sessão/`device_key`/preferência de painel colapsado (`chrome.storage.local`); `state.conversationAnalysis` e o ledger de mensagens são só memória do content script. Um reload reinicia do zero — não há "estado velho" para reaparecer no V1 de hoje. |
| Executável agora? | Não aplicável ao V1 (não há nada para vazar). Vira aplicável apenas quando a arquitetura progressiva introduzir algum estado persistido do lado do cliente (ex.: cache local de "job em andamento" para sobreviver a um refresh). |
| Pendente PR A/B/C | Assim que qualquer persistência client-side de job for introduzida, criar teste de reload equivalente ao harness `tests/e3-dom` (recarregar o sandbox `loadContentScript` e inspecionar o que resta). |

## Cenário G — Extensão recarregada

| Campo | Conteúdo |
|---|---|
| Esperado | Nenhum estado incorreto herdado de execução anterior. |
| Estado hoje | Mesma análise do cenário F — sem persistência client-side de análise hoje, o risco só existe a partir do momento em que a Frente Principal introduzir alguma forma de retomar/poll de job após reload da extensão. |
| Executável agora? | Não aplicável ao V1 pela mesma razão do cenário F. |
| Pendente PR A/B/C | Sim — depende de como PR A representa o estado de job (se sobrevive a reload via `chrome.storage`, precisa de teste de reidratação; se não sobrevive, o comportamento esperado — "job perdido, sem re-sincronizar automaticamente" — precisa estar documentado e testado como aceitável). |

## Cenário H — Falha temporária + retry

| Campo | Conteúdo |
|---|---|
| Esperado | Retry não produz efeito duplicado nem aplica resultado de tentativa anterior já superada. |
| Estado hoje | Existe precedente direto e **já testado** para o padrão "falha transitória não apaga dado bom já exibido, e a tentativa seguinte recupera", no card de relacionamento (`content-script-dom-client-relationship-live-refresh.test.mjs`, cenário 13). O caminho de análise (`analyzeCurrentConversation`) não tem o mesmo teste. P1-03 (`INVALID_COMMUNICATION_OUTPUT`) é o caso de retry conhecido no motor profundo — ver `P1_03_REVALIDATION_ROADMAP.md`. |
| Executável agora? | Parcial — o padrão já provado no card de relacionamento pode servir de modelo para um teste equivalente no card de análise, mas isso exige simular uma falha + retry na própria chamada `ANALYZE_CONVERSATION`, hoje sem lógica de retry client-side dedicada (o retry que existe é o do provedor de IA no servidor, dentro do motor stateful). |
| Pendente PR A/B/C | Quando o job em background tiver sua própria política de retry, testar que um retry após falha não reabre uma segunda intervenção seller-facing para o mesmo job lógico (ver seção "Duplicação" do contrato de validação). |

## Cenário I — Job demora muito e um job mais recente termina primeiro

| Campo | Conteúdo |
|---|---|
| Esperado | Resultado velho não vence resultado novo. |
| Classificação se violado | `BLOCKER`. |
| Estado hoje | Achado direto da auditoria: `stateful-copilot-cycle-deadline.ts` documenta explicitamente que, quando o deadline agregado do ciclo vence, "a chamada real ao provedor é abandonada (ela pode continuar em segundo plano até seu próprio timeout individual)" — ou seja, **o próprio runtime atual já reconhece que uma chamada abandonada pode terminar depois** de o ciclo já ter caído em fallback V1. Não há evidência de um guard que impeça essa chamada tardia de ainda tentar persistir/expor um resultado após o abandono. |
| Executável agora? | O comportamento de deadline/abandono em si tem testes (`stateful-copilot-cycle-deadline.test.mjs`, se existente, mais os testes de orquestrador). **Não confirmado**: se a chamada abandonada, ao terminar sozinha, tenta gravar e é rejeitada pelo CAS (proteção indireta via `expected_previous_state_version`) ou se existe um caminho onde ela ainda teria efeito. Este é o item de maior prioridade de investigação adicional recomendado ao Controle Mestre antes do PR A. |
| Pendente PR A/B/C | Teste direto: mock de provedor que resolve a chamada "abandonada" depois do fallback já ter ocorrido, e assert de que nenhuma escrita nem exposição seller-facing resulta dela. |

## Resumo de rastreamento

| Cenário | Executável agora | Resultado atual | Bloqueia promoção da arquitetura progressiva? |
|---|---|---|---|
| A | Sim | PASS (caminho feliz já exercitado) | Não |
| B | **Sim** | **FAIL confirmado** (teste novo, ver acima) | **Sim — precisa de correção antes do PR A/B/C** |
| C | Parcial (persistência sim, exibição não) | PASS (persistência) / gap não testado (exibição) | Sim, na parte de exibição |
| D | Não (falta harness de concorrência real) | Gap documentado, não testado | Sim, quando jobs assíncronos existirem |
| E | Não (extensão trivial do teste B, propositalmente não duplicado ainda) | Gap por herança do cenário B | Sim |
| F | Não aplicável hoje | N/A | Só se PR A/B/C introduzir persistência client-side |
| G | Não aplicável hoje | N/A | Só se PR A/B/C introduzir persistência client-side |
| H | Parcial (padrão provado em outro componente) | Gap não testado no caminho de análise | Recomendado, não bloqueante por si só |
| I | Não (falta reproduzir chamada "abandonada" terminando tarde) | Gap documentado, prioridade alta de investigação | Sim |

O cenário B já está provado como `BLOCKER` hoje, antes mesmo do PR A. Isso
deve ser reportado ao Controle Mestre como achado independente da missão de
background — é uma falha de isolamento de conversa que já existe em
produção no V1.
