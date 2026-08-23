# Critérios de medição de latência — arquitetura progressiva

## Papel deste documento

Formaliza **Time to First Value (TTFV)** e **Time to Deep Analysis (TTDA)**
como métricas distintas, e define os pontos de instrumentação necessários
para medi-las com dados reais. Este documento **não define um número de
PASS**. O mandato do Controle Mestre é explícito, reafirmado após o PR #207:
"Não volte a usar 'deep analysis <= 25s' como critério." A Fase 12A vai
estabelecer thresholds a partir de dados reais, não de suposição.

## Atualização pós-PR #207 — orçamentos reais confirmados (não são thresholds de aceite)

Auditoria desta frente encontrou os dois orçamentos que a Frente Principal
já codificou — **estes são tetos de engenharia (circuit breakers), não
critérios de PASS/FAIL de latência**, exatamente como o mandato pede:

- **Caminho rápido (seller-facing)**: `providerTimeoutMs: 8_000` — a
  chamada V1 sincrona que compõe a resposta imediata do vendedor é limitada
  a 8s (`app/api/companion/analyze-conversation/route.ts`, confirmado por
  `phase12a-stateful-latency.test.mjs`, teste `'first value active limita
  V1 a 8s'`). O guardrail antigo de 25s
  (`DEFAULT_STATEFUL_COPILOT_CYCLE_DEADLINE_MS`) continua existindo, mas
  não é mais o teto que o vendedor experimenta — o teste
  `'guardrail stateful padrão permanece em 25s'` confirma que ele
  permanece como orçamento interno, não como SLA de resposta.
- **Caminho profundo (background)**:
  `STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS = 120_000` (120s) —
  orçamento próprio do job em background, desacoplado da resposta
  seller-facing (`stateful-copilot-background-job.ts`, confirmado por
  `phase12a-stateful-latency.test.mjs`, teste `'background profundo possui
  orçamento separado de 120s'`).
- **Teto absoluto da função consumer**: `maxDuration: 180` (`vercel.json`)
  — se o job profundo (com seus próprios retries) ultrapassar 180s, a
  própria plataforma encerra a função antes do orçamento de 120s do job
  conseguir se manifestar como erro controlado. Isso não foi testado nesta
  auditoria (exigiria um ambiente Vercel real), só documentado como risco.

Isso confirma exatamente a orientação do Controle Mestre: **a arquitetura
pode ter TTDA > 25s legitimamente**, desde que TTFV continue curto (hoje,
teto de 8s no caminho rápido) e o job permaneça correto. Nenhum destes
números (8s, 25s, 120s, 180s) deve ser citado como "critério de PASS de
latência" nos relatórios desta frente — são orçamentos de engenharia já
existentes no código, não uma meta de experiência validada com dados reais
de uso.

## Por que TTFV e TTDA não podem ser medidos juntos

A arquitetura descrita pela Frente Principal tem dois resultados distintos
que chegam em momentos diferentes:

```text
captura contínua
  → debounce ~8s
    → leitura rápida               (TTFV termina aqui)
      → relevance gate
        → V2 profundo em background (TTDA termina aqui, só se disparado)
          → resultado seller-facing quando estiver pronto
```

Misturar as duas métricas em um único "tempo de resposta" reproduz
exatamente o problema que motivou a Fase 12A (V2 profundo síncrono fazendo o
vendedor esperar). Qualquer relatório desta bateria que reportar um único
número está errado por construção.

## Definições

### Time to First Value (TTFV)

**Do que o vendedor vê primeiro.** Intervalo entre o fim do debounce (o
momento em que a captura contínua decide que a conversa "assentou" e está
pronta para leitura) e o momento em que a leitura rápida fica disponível na
UI — incluindo a decisão do relevance gate quando ela for parte do caminho
rápido.

```text
TTFV = timestamp(leitura_rapida_disponivel) - timestamp(fim_do_debounce)
```

- Se a leitura rápida determinar `non_commercial`/`uncertain` e a política do
  produto for não disparar análise profunda, o ciclo termina em TTFV — não
  existe TTDA para esse ciclo (ver seção "Non-commercial" do contrato de
  validação).
- TTFV é a métrica que substitui a antiga experiência de "8s de silêncio →
  V2 profundo síncrono → vendedor espera". Se TTFV também acabar
  bloqueando o vendedor por dezenas de segundos, a arquitetura progressiva
  não resolveu o problema que a motivou.

### Time to Deep Analysis (TTDA)

**Do que chega depois, sem bloquear.** Intervalo entre o início do job
profundo (V2 stateful em background) e o momento em que o resultado fica
disponível para o vendedor — só existe quando o relevance gate decidiu que a
análise profunda era necessária.

```text
TTDA = timestamp(resultado_profundo_disponivel) - timestamp(inicio_job_profundo)
```

TTDA pode (e frequentemente vai) ultrapassar o antigo deadline de ciclo
síncrono (`DEFAULT_STATEFUL_COPILOT_CYCLE_DEADLINE_MS = 25_000`,
`stateful-copilot-cycle-deadline.ts`) sem que isso seja um problema — desde
que o vendedor não esteja bloqueado esperando. O deadline de ciclo continua
relevante como orçamento interno do motor (evita ciclos infinitos), mas
deixa de ser o teto de experiência do vendedor.

## Pontos de instrumentação obrigatórios

Cada um destes pontos precisa de um timestamp registrado (ver
`OBSERVABILITY_CONTRACT.md` para o esquema de telemetria correspondente):

| # | Ponto | O que marca |
|---|---|---|
| 1 | `debounce_settled_at` | Fim do debounce de ~8s (captura decidiu que a conversa assentou). |
| 2 | `fast_read_started_at` | Início da leitura rápida. |
| 3 | `fast_read_available_at` | Leitura rápida disponível na UI — **fecha o TTFV**. |
| 4 | `relevance_gate_decided_at` | Decisão do relevance gate (`commercial`/`non_commercial`/`uncertain`) e se disparou ou não o job profundo. |
| 5 | `deep_job_enqueued_at` | Job profundo aceito para execução (se disparado). |
| 6 | `deep_job_started_at` | Execução do job profundo de fato começou (pode ser diferente de `enqueued_at` se houver fila). |
| 7 | `deep_job_available_at` | Resultado profundo disponível para o vendedor — **fecha o TTDA**. |
| 8 | `deep_job_failed_at` / `deep_job_timeout_at` | Falha ou timeout do job profundo (mutuamente exclusivo com o item 7 para o mesmo job). |
| 9 | `fallback_applied_at` | Se aplicável, quando o fallback (V1 ou "sem intervenção necessária") foi aplicado em vez do resultado profundo. |
| 10 | `deep_job_attempt_number` | Contagem de tentativas — não é timestamp, mas obrigatório para separar "TTDA da primeira tentativa" de "TTDA total incluindo retries" (relevante para P1-03, ver `P1_03_REVALIDATION_ROADMAP.md`). |

Nenhum destes pontos existe hoje como campo de telemetria dedicado — ver
gap em `OBSERVABILITY_CONTRACT.md`. O que existe hoje
(`stateful-copilot-active-pilot-telemetry.ts`) tem `duration_ms` agregado por
execução, sem quebra por estágio, e nenhum "job id" para correlacionar os
pontos 5-9 entre si ao longo do tempo (uma execução síncrona de hoje não
precisa disso; um job assíncrono real precisa).

**Atualização pós-PR #207**: os pontos 5, 6 e 7 (TTDA) agora **têm um
equivalente parcial real** na tabela `companion_background_analysis_jobs`
— `requested_at` (≈ item 5, capturado antes até da chamada V1 seller-facing),
`started_at` (item 6) e `completed_at` (item 7, mas só sabe dizer que
terminou, não que o resultado ficou "disponível para o vendedor", porque
não existe caminho de entrega — ver `RACE_CONDITIONS_MATRIX.md`, achado
estrutural da matriz A–N). `attempt_count` cobre o item 10. **Ainda
faltam**: os pontos 1-4 (TTFV — debounce/leitura rápida/relevance gate não
existem como conceito no código hoje, nem síncrono nem em background),
`deep_job_timeout_at` como campo dedicado (hoje só `failure_code`
genérico), e `fallback_applied_at`. TTDA já pode ser calculado
parcialmente hoje como `completed_at - started_at` diretamente da tabela
— é o primeiro dos 10 pontos que deixa de ser 100% teórico.

## O que esta bateria mede vs. o que ela não decide

Esta bateria define **como medir**, coleta **evidência real** assim que os
PRs A/B/C existirem, e relata os números — TTFV p50/p95/p99, TTDA p50/p95/p99,
taxa de timeout, taxa de fallback, número médio de tentativas — sem propor um
limite de aceitação. A decisão de threshold (ex.: "TTFV p95 abaixo de X
segundos é aceitável") é uma decisão de produto do Controle Mestre, informada
por estes números, não uma conclusão técnica desta frente.

## Falha, fallback e retry — o que precisa ficar visível separadamente

- **Timeout do job profundo** não é o mesmo que "falha" — precisa de campo
  próprio (`deep_job_timeout_at` vs. `deep_job_failed_at`) porque as duas
  situações pedem UX diferente (timeout pode justificar "ainda estamos
  analisando", falha justifica "não foi possível analisar agora").
- **Fallback** (V1 ou silêncio operacional) precisa registrar o motivo
  (`fallback_reason`, já existe como conceito em
  `stateful-copilot-active-pilot-telemetry.ts`) e o timestamp em que foi
  aplicado, para permitir calcular "por quanto tempo o vendedor ficou sem
  nenhum resultado" — que é uma métrica de experiência distinta de TTFV/TTDA.
- **Número de tentativas** precisa ser reportado tanto para o estágio rápido
  quanto para o profundo — P1-03 já mostrou que retries podem inflar
  drasticamente a latência de um estágio sem que isso apareça em um
  `duration_ms` agregado único.

## Critério de aprovação desta seção

A bateria de latência está pronta para uso quando:

1. os 10 pontos de instrumentação acima estiverem disponíveis (mesmo que só
   em ambiente de shadow/staging) — hoje, gap;
2. TTFV e TTDA puderem ser calculados independentemente a partir dos dados
   coletados;
3. nenhum relatório desta frente apresentar um número de latência único sem
   dizer qual das duas métricas (ou qual delas nem se aplica, no caso
   non-commercial) ele representa.
