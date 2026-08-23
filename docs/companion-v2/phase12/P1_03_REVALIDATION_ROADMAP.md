# Roteiro de revalidação — P1-03 (`INVALID_COMMUNICATION_OUTPUT`)

## Atualização pós-PR #207 — Controle Mestre declarou "P1-03 PASS"

Auditoria desta frente confirma a evidência, com uma ressalva importante
sobre **o que exatamente mudou**:

- O laço de retry de comunicação em si
  (`stateful-communication-executor.ts`/`stateful-copilot-orchestrator.ts`,
  1-2 tentativas via `communication_attempts`) **não foi alterado** pelo
  PR #207 — continua podendo levar múltiplas chamadas ao modelo.
- O que mudou estruturalmente: esse laço agora roda inteiramente **dentro
  do job de background** (`stateful-copilot-background-worker.ts`), com
  orçamento próprio de `STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS = 120_000`
  (120s) — e a resposta síncrona ao vendedor (`POST /api/companion/analyze-conversation`)
  **nunca mais invoca esse runtime profundo diretamente**: o teste
  `app/lib/companion/phase12a-stateful-latency.test.mjs` (`'request seller-facing
  não executa runtime V2 profundo'`) confirma via regex que `routeSource`
  não contém `runStatefulCopilotBackgroundRuntime`, e que o caminho
  seller-facing usa `providerTimeoutMs: 8_000` só para a chamada V1 (teste
  `'first value active limita V1 a 8s'`).
- Ou seja: **"PASS" significa que o vendedor não bloqueia mais no retry de
  comunicação** — não que o retry ficou mais rápido em si. O TTDA (tempo até
  o resultado profundo, quando ele existir) ainda pode sofrer o mesmo
  padrão de retry lento documentado abaixo; só não é mais o vendedor quem
  espera por ele.
- **Achado novo desta frente, não coberto por nenhum teste existente**: não
  foi encontrado nenhum timeout interno que impeça o laço de 1-2 tentativas
  de comunicação, somado ao laço de diagnóstico, de se aproximar ou
  ultrapassar o próprio orçamento de 120s do job — e o `maxDuration: 180`
  do consumer da fila (`vercel.json`) é o teto absoluto antes da própria
  função ser encerrada pela plataforma. Isso não foi classificado como
  `BLOCKER` (não há evidência de que já aconteça), mas fica registrado como
  item de acompanhamento: revalidar com dados reais de latência do job
  assim que houver telemetria de estágio (ver `LATENCY_MEASUREMENT_CRITERIA.md`
  e `OBSERVABILITY_CONTRACT.md`, ambos atualizados nesta auditoria com o gap
  de instrumentação por estágio).

O restante deste documento (escrito antes do PR #207) permanece válido como
metodologia geral de revalidação — os itens de "linha de base antes/depois"
abaixo agora podem ser coletados a partir da telemetria de
`companion_background_analysis_jobs`, uma vez que os campos de estágio
(`started_at`/`completed_at`/`attempt_count`) existam de fato na tabela.

## Papel deste documento

Este roteiro **não corrige P1-03**. Ele define como a Frente Paralela 3
(validação adversarial) vai comprovar, com evidência, que uma correção futura
de P1-03 realmente funcionou — sem tocar no runtime de comunicação stateful.

P1-03 pertence à Frente 1 (Cérebro confiável). Este documento existe para que,
quando a correção for aberta em PR, a revalidação já tenha um roteiro pronto
em vez de ser inventada sob pressão.

## Estado registrado do problema (auditoria, sem alterar código)

Fonte: `docs/companion-v2/product/companion-seller-gap-matrix.md`, seção
"P1 conhecidos", e auditoria desta frente sobre
`stateful-communication-executor.ts` / `stateful-copilot-orchestrator.ts` /
`stateful-copilot-cycle-deadline.ts`.

- O motor de comunicação stateful pode produzir uma saída inválida do modelo
  (`INVALID_COMMUNICATION_OUTPUT`) e re-tenta.
- O padrão de retry só recupera bem quando a **primeira** tentativa falha
  **rápido**. Cada tentativa recuperada ainda pode consumir até o timeout
  individual completo do provedor antes de desistir.
- Isso é consistente com os ciclos de ~101s observados durante a auditoria de
  P1-02 (uma etapa rápida + uma etapa de retry no timeout cheio).
- Efeito prático: quanto mais lento for o retry de comunicação, mais vezes o
  deadline agregado do ciclo (`stateful-copilot-cycle-deadline.ts`,
  `DEFAULT_STATEFUL_COPILOT_CYCLE_DEADLINE_MS`) aciona fallback para V1 nos
  casos que precisam da leitura rica — ou seja, P1-03 hoje **infla** a taxa de
  fallback medida por P1-02.
- Também é diretamente relevante para a nova arquitetura progressiva: um job
  profundo em background que sofre este padrão de retry lento vai demorar
  mais para produzir `time-to-deep-analysis` (ver
  `LATENCY_MEASUREMENT_CRITERIA.md`), e pode ultrapassar a janela em que o
  resultado ainda é válido (ver `PROGRESSIVE_BACKGROUND_VALIDATION_CONTRACT.md`,
  seção "Stale Result Policy").

## O que a revalidação precisa provar

Quando uma correção de P1-03 for proposta (por qualquer frente), a
revalidação desta bateria deve responder, com dados e não com opinião:

1. A taxa de `INVALID_COMMUNICATION_OUTPUT` na primeira tentativa não mudou
   de forma inesperada (a correção não deveria alterar a taxa de erro do
   modelo, só o custo de recuperação).
2. O tempo até recuperação bem-sucedida (segunda tentativa) caiu de forma
   mensurável — comparação **antes/depois** usando o mesmo corpus de cenários
   de retry.
3. A taxa de fallback para V1 causada por deadline agregado (P1-02) caiu, sem
   que nenhum outro P1 tenha piorado como efeito colateral.
4. Nenhuma correção de P1-03 introduziu um novo caminho de resultado
   obsoleto: se a correção mudou a forma como o retry é agendado (ex.: retry
   mais agressivo, retry paralelo), ela deve ser testada contra a matriz de
   condição de corrida (`RACE_CONDITIONS_MATRIX.md`) antes de ser considerada
   segura para a arquitetura progressiva — especificamente os cenários D
   (dois jobs concorrentes por corrida) e I (job lento vs. job mais recente).
5. A correção não altera o invariante K7 (fallback seguro V1 sempre
   disponível) nem K6 (persistência confirmada antes de exposição stateful),
   já validados na matriz de completude do vendedor.

## Método de revalidação (sem alterar runtime)

1. **Baseline "antes"**: capturar, a partir da telemetria já existente
   (`stateful-copilot-active-pilot-telemetry.ts`:
   `communication_attempts`, `recovered_after_retry`,
   `communication_failure_path`, `communication_failure_invariant`,
   `duration_ms`), uma amostra representativa de ciclos com retry de
   comunicação, antes do merge da correção. Este documento não coleta esses
   dados agora — define o que precisa ser coletado quando a correção estiver
   pronta para revalidação.
2. **Cenários sintéticos de retry**: reaproveitar/estender
   `docs/companion-v2/corpus/` e os testes existentes
   (`stateful-communication.test.mjs`,
   `stateful-copilot-orchestrator.test.mjs`) com casos que forcem
   deliberadamente uma primeira saída inválida do provedor mockado, medindo
   quanto tempo o retry consumiu no mock antes de finalizar.
3. **Comparação "depois"**: repetir a mesma amostra/cenários após o merge da
   correção, com os mesmos mocks e sementes, e comparar `duration_ms` e
   `recovered_after_retry` ponto a ponto.
4. **Gate de regressão cruzada**: rodar a matriz de condição de corrida
   (seções D e I) e a matriz de isolamento contra a branch corrigida antes de
   qualquer promoção além do piloto.
5. **Critério de aceite desta revalidação** (não é o critério de aceite da
   correção em si, que pertence à Frente 1):
   - nenhuma regressão em K6/K7/K9;
   - nenhum novo `FAIL`/`BLOCKER` nas matrizes desta frente;
   - redução mensurável e documentada do tempo de recuperação, com número
     real, não estimado.

## O que este documento explicitamente não faz

- Não propõe uma implementação de correção para P1-03.
- Não altera `stateful-communication-executor.ts`,
  `stateful-copilot-orchestrator.ts` ou `stateful-copilot-cycle-deadline.ts`.
- Não define um número mágico de latência aceitável — os números "antes" e
  "depois" vêm de execução real, não de suposição (mesma regra da seção de
  latência do contrato de validação).
- Não substitui o gate de promoção do `ROADMAP.md` ("Regra de promoção").
