# Roteiro de revalidação — P1-03 (`INVALID_COMMUNICATION_OUTPUT`)

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
