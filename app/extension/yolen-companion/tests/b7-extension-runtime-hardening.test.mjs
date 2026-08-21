import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const contentScript =
  readFileSync(
    new URL(
      '../src/content-script.js',
      import.meta.url,
    ),
    'utf8',
  )

function getBlock(
  startText,
  endText,
) {
  const start =
    contentScript.indexOf(startText)

  const end =
    contentScript.indexOf(
      endText,
      start,
    )

  assert.ok(
    start >= 0,
    `Início não encontrado: ${startText}`,
  )

  assert.ok(
    end > start,
    `Fim não encontrado: ${endText}`,
  )

  return contentScript.slice(
    start,
    end,
  )
}

const hardeningBlock =
  getBlock(
    '// B7_RUNTIME_HARDENING_START',
    '// B7_RUNTIME_HARDENING_END',
  )

test(
  'runtime possui singleton por aba',
  () => {
    assert.match(
      contentScript,
      /__yolenCompanionRuntimeStarted/,
    )

    const startBlock =
      getBlock(
        'async function start()',
        '\n  start()\n})()',
      )

    assert.match(
      startBlock,
      /globalThis\[RUNTIME_STARTED_KEY\] ===[\s\S]*true/,
    )

    assert.match(
      startBlock,
      /globalThis\[RUNTIME_STARTED_KEY\] = true/,
    )
  },
)

test(
  'singleton é local ao contexto da aba e não usa storage compartilhado',
  () => {
    assert.doesNotMatch(
      contentScript,
      /storage\.(local|sync|session)[\s\S]*RUNTIME_STARTED_KEY/,
    )
  },
)

test(
  'observer continua vivo quando o WhatsApp substitui o app interno',
  () => {
    const block =
      getBlock(
        'function observeWhatsAppChanges()',
        'observeWhatsAppChanges.timeoutId = 0',
      )

    assert.match(
      block,
      /document\.body[\s\S]*document\.documentElement/,
    )

    assert.doesNotMatch(
      block,
      /document\.querySelector\(WHATSAPP_APP_SELECTOR\)/,
    )
  },
)

test(
  'mutações do próprio painel continuam ignoradas',
  () => {
    const block =
      getBlock(
        'function observeWhatsAppChanges()',
        'observeWhatsAppChanges.timeoutId = 0',
      )

    assert.match(
      block,
      /targetElement\.closest\(`#\$\{PANEL_ID\}`\)/,
    )
  },
)

test(
  'recovery observa retorno da internet',
  () => {
    assert.match(
      hardeningBlock,
      /addEventListener\([\s\S]*'online'/,
    )
  },
)

test(
  'recovery observa retorno de foco',
  () => {
    assert.match(
      hardeningBlock,
      /addEventListener\([\s\S]*'focus'/,
    )
  },
)

test(
  'recovery cobre pageshow para retomada do documento',
  () => {
    assert.match(
      hardeningBlock,
      /addEventListener\([\s\S]*'pageshow'/,
    )
  },
)

test(
  'recovery cobre retorno de visibilidade após sleep ou troca de aba',
  () => {
    assert.match(
      hardeningBlock,
      /visibilitychange/,
    )

    assert.match(
      hardeningBlock,
      /document\.visibilityState !==[\s\S]*'visible'/,
    )
  },
)

test(
  'eventos simultâneos de recovery são debounced',
  () => {
    assert.match(
      hardeningBlock,
      /window\.clearTimeout\([\s\S]*runtimeRecoveryTimerId/,
    )

    assert.match(
      hardeningBlock,
      /RUNTIME_RECOVERY_DELAY_MS/,
    )
  },
)

test(
  'recovery não executa concorrentemente',
  () => {
    assert.match(
      hardeningBlock,
      /if \(runtimeRecoveryInFlight\)/,
    )

    assert.match(
      hardeningBlock,
      /runtimeRecoveryInFlight = true/,
    )

    assert.match(
      hardeningBlock,
      /finally[\s\S]*runtimeRecoveryInFlight = false/,
    )
  },
)

test(
  'recovery reconcilia conversa antes de continuar',
  () => {
    assert.match(
      hardeningBlock,
      /refreshConversationSnapshot\(\)/,
    )

    assert.match(
      hardeningBlock,
      /checkPendingSuggestedMessageSentFromConversation\(\)/,
    )
  },
)

test(
  'recovery renova sessão sem tela de loading',
  () => {
    assert.match(
      hardeningBlock,
      /loadYolenSession\(\{[\s\S]*showLoading: false[\s\S]*resolveLeadAfterLoad: true/,
    )
  },
)

test(
  'recovery força captura depois da reconexão',
  () => {
    assert.match(
      hardeningBlock,
      /scheduleCaptureIngestion\(0\)/,
    )
  },
)

test(
  'reanálise só é agendada quando a fotografia mudou',
  () => {
    assert.match(
      hardeningBlock,
      /getCurrentConversationFingerprint\(\)/,
    )

    assert.match(
      hardeningBlock,
      /currentFingerprint !==[\s\S]*state\.analyzedConversationFingerprint/,
    )

    assert.match(
      hardeningBlock,
      /scheduleAutomaticAnalysis\(/,
    )
  },
)

test(
  'recovery não abre o Companion automaticamente',
  () => {
    assert.doesNotMatch(
      hardeningBlock,
      /setPanelCollapsed\(false\)/,
    )
  },
)

test(
  'recovery não cria nova IA API telemetria CRM ou Agenda',
  () => {
    for (
      const forbidden of [
        'fetch(',
        'analyzeConversation(',
        'registerActionEvent(',
        'fireCompanionActionTelemetry(',
        'applyCurrentSuggestion(',
        'applyLeadEnrichmentCandidate(',
        'crm_accepted',
        'crm_rejected',
        'agenda_accepted',
        'agenda_rejected',
      ]
    ) {
      assert.equal(
        hardeningBlock.includes(
          forbidden,
        ),
        false,
        forbidden,
      )
    }
  },
)

test(
  'startup instala recovery antes do refresh periódico',
  () => {
    const startBlock =
      getBlock(
        'async function start()',
        '\n  start()\n})()',
      )

    const recoveryPosition =
      startBlock.indexOf(
        'observeRuntimeRecovery()',
      )

    const intervalPosition =
      startBlock.indexOf(
        'startSessionAutoRefresh()',
      )

    assert.ok(
      recoveryPosition >= 0,
    )

    assert.ok(
      intervalPosition >
        recoveryPosition,
    )
  },
)

test(
  'refresh periódico de sessão continua preservado',
  () => {
    assert.match(
      contentScript,
      /SESSION_REFRESH_INTERVAL_MS = 60000/,
    )

    assert.match(
      contentScript,
      /window\.setInterval/,
    )
  },
)
