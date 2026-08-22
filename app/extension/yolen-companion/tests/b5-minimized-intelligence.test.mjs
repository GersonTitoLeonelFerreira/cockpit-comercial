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

const styles =
  readFileSync(
    new URL(
      '../src/styles.css',
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

const b5Block =
  getBlock(
    '// B5_MINIMIZED_INTELLIGENCE_START',
    '// B5_MINIMIZED_INTELLIGENCE_END',
  )

test(
  'B5.1 preserva rail de exatamente 64px',
  () => {
    assert.match(
      styles,
      /html\.yolen-companion-collapsed[\s\S]*64px/,
    )

    assert.match(
      styles,
      /\.yolen-collapsed-shell[\s\S]*width: 64px/,
    )

    assert.match(
      styles,
      /html\.yolen-companion-collapsed #app[\s\S]*64px/,
    )
  },
)

test(
  'B5.2 renderiza indicador somente quando existe atenção não reconhecida',
  () => {
    const renderBlock =
      getBlock(
        'function renderPanel()',
        "panel.innerHTML = [\n      '<div class=\"yolen-panel-header",
      )

    assert.match(
      renderBlock,
      /getUnacknowledgedCollapsedAttention\(\)/,
    )

    assert.match(
      renderBlock,
      /yolen-collapsed-attention-dot/,
    )

    assert.match(
      renderBlock,
      /data-yolen-attention-level/,
    )
  },
)

test(
  'estado normal mantém apenas a marca Y sem dot',
  () => {
    const renderBlock =
      getBlock(
        'function renderPanel()',
        "panel.innerHTML = [\n      '<div class=\"yolen-panel-header",
      )

    assert.match(
      renderBlock,
      /attention\?\.level \|\| 'normal'/,
    )

    assert.match(
      renderBlock,
      /attention[\s\S]*\?[\s\S]*yolen-collapsed-attention-dot[\s\S]*: ''/,
    )
  },
)

test(
  'B5.4 possui os quatro níveis previstos',
  () => {
    for (
      const level of [
        'information',
        'recommendation',
        'attention',
        'risk',
      ]
    ) {
      assert.equal(
        b5Block.includes(
          `level: '${level}'`,
        ),
        true,
        level,
      )
    }
  },
)

test(
  'risco pré-envio possui prioridade máxima',
  () => {
    const risk =
      b5Block.indexOf(
        'getCurrentPreSendGateKey()',
      )

    const newLead =
      b5Block.indexOf(
        "'NOT_FOUND'",
      )

    const recommendation =
      b5Block.indexOf(
        "level: 'recommendation'",
      )

    const information =
      b5Block.indexOf(
        "level: 'information'",
      )

    assert.ok(risk >= 0)
    assert.ok(newLead > risk)
    assert.ok(recommendation > newLead)
    assert.ok(information > recommendation)
  },
)

test(
  'risco utiliza o gate B4 já validado e não cria segundo detector',
  () => {
    assert.match(
      b5Block,
      /getCurrentPreSendGateKey\(\)/,
    )

    assert.doesNotMatch(
      b5Block,
      /preventDefault|stopPropagation|stopImmediatePropagation/,
    )
  },
)

test(
  'minimizado reutiliza a mesma prioridade de AGORA e mantém um único indicador',
  () => {
    assert.match(
      b5Block,
      /resolveSellerAttentionSnapshot\(/,
    )

    assert.match(
      b5Block,
      /critical:\s*400[\s\S]*high:\s*300[\s\S]*medium:\s*200/,
    )

    assert.match(
      b5Block,
      /candidates\.sort\([\s\S]*right\.rank - left\.rank/,
    )

    assert.match(
      b5Block,
      /const attention =[\s\S]*candidates\[0\]/,
    )
  },
)

test(
  'sessão non-commercial mantém o rail neutro',
  () => {
    assert.match(
      b5Block,
      /isNeutralCommercialSession\([\s\S]*if \(neutralSession\) \{[\s\S]*return null/,
    )
  },
)

test(
  'contato não cadastrado vira atenção sem abrir painel',
  () => {
    assert.match(
      b5Block,
      /leadResolution\?\.status ===[\s\S]*'NOT_FOUND'/,
    )

    assert.match(
      b5Block,
      /level: 'attention'/,
    )
  },
)

test(
  'sugestão operacional existente é tratada como atenção',
  () => {
    assert.match(
      b5Block,
      /hasCurrentOperationalSuggestionChange\(\)/,
    )

    assert.match(
      b5Block,
      /attention:operation/,
    )
  },
)

test(
  'recomendação exige leitura comercial atual completa',
  () => {
    assert.match(
      b5Block,
      /getActiveCommercialReading\(\)/,
    )

    assert.match(
      b5Block,
      /!state\.conversationAnalysisLoading/,
    )

    assert.match(
      b5Block,
      /!isCurrentAnalysisOutdated\(\)/,
    )

    assert.match(
      b5Block,
      /analysis_status ===[\s\S]*'complete'/,
    )

    assert.match(
      b5Block,
      /intervention_needed === true/,
    )
  },
)

test(
  'enriquecimento existente é informação e não risco',
  () => {
    assert.match(
      b5Block,
      /getVisibleLeadEnrichmentCandidates\(\)/,
    )

    assert.match(
      b5Block,
      /information:enrichment/,
    )
  },
)

test(
  'atenção vista não volta até existir nova chave',
  () => {
    assert.match(
      b5Block,
      /lastAcknowledgedCollapsedAttentionKey/,
    )

    assert.match(
      b5Block,
      /attention\.key ===[\s\S]*lastAcknowledgedCollapsedAttentionKey/,
    )

    assert.match(
      b5Block,
      /attention\?\.key \|\| null/,
    )
  },
)

test(
  'recolher ou abrir reconhece a atenção atual',
  () => {
    const collapseBlock =
      getBlock(
        'function setPanelCollapsed',
        'function renderPanel',
      )

    assert.match(
      collapseBlock,
      /acknowledgeCurrentCollapsedAttention\(\)/,
    )
  },
)

test(
  'B5.3 não abre o Companion automaticamente',
  () => {
    const falseCalls =
      contentScript.match(
        /setPanelCollapsed\(false\)/g,
      ) || []

    assert.equal(
      falseCalls.length,
      1,
    )

    const renderBlock =
      getBlock(
        'function renderPanel()',
        "panel.innerHTML = [\n      '<div class=\"yolen-panel-header",
      )

    assert.match(
      renderBlock,
      /data-yolen-action="expand-companion"/,
    )

    assert.match(
      renderBlock,
      /addEventListener\([\s\S]*'click'[\s\S]*setPanelCollapsed\(false\)/,
    )
  },
)

test(
  'modo minimizado não cria timer para autoexpansão',
  () => {
    assert.doesNotMatch(
      b5Block,
      /setTimeout|setInterval|requestAnimationFrame/,
    )
  },
)

test(
  'B5 não cria IA API telemetria CRM ou Agenda automática',
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
        b5Block.includes(
          forbidden,
        ),
        false,
        forbidden,
      )
    }
  },
)

test(
  'níveis possuem tratamento visual sem animação invasiva',
  () => {
    for (
      const className of [
        'yolen-collapsed-attention-dot',
        'yolen-collapsed-attention-recommendation',
        'yolen-collapsed-attention-attention',
        'yolen-collapsed-attention-risk',
      ]
    ) {
      assert.equal(
        styles.includes(className),
        true,
        className,
      )
    }

    assert.doesNotMatch(
      styles,
      /@keyframes[\s\S]*yolen-collapsed-attention/,
    )
  },
)

test(
  'indicador possui contexto acessível para leitor de tela',
  () => {
    const renderBlock =
      getBlock(
        'function renderPanel()',
        "panel.innerHTML = [\n      '<div class=\"yolen-panel-header",
      )

    assert.match(
      renderBlock,
      /collapsedLabel/,
    )

    assert.match(
      renderBlock,
      /aria-label/,
    )

    assert.match(
      renderBlock,
      /attention\.label/,
    )
  },
)
