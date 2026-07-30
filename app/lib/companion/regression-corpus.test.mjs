import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const corpusUrl = new URL(
  '../../../docs/companion-v2/corpus/cases.json',
  import.meta.url,
)

const corpus = JSON.parse(
  await readFile(corpusUrl, 'utf8'),
)

const allowedStatuses = new Set([
  'novo',
  'contato',
  'respondeu',
  'negociacao',
  'pausado',
  'cancelado',
  'ganho',
  'perdido',
])

const allowedDirections = new Set([
  'incoming',
  'outgoing',
])

const allowedStates = new Set([
  'active',
  'superseded',
  'deleted',
])

const allowedContentTypes = new Set([
  'text',
  'audio',
])

const factKeys = [
  'lead_responded',
  'no_response',
  'commercial_objection_active',
  'follow_up_requested',
  'follow_up_has_date_or_period',
  'visit_or_test_drive_scheduled',
  'explicit_win',
  'explicit_loss',
]

function getLatestMessages(messages) {
  const latestById = new Map()

  for (const message of messages) {
    const current =
      latestById.get(message.id)

    if (
      !current ||
      message.version >
        current.version
    ) {
      latestById.set(
        message.id,
        message,
      )
    }
  }

  return Array.from(
    latestById.values(),
  )
}

function collectText(caseItem) {
  return [
    caseItem.title,
    ...caseItem.messages.flatMap(
      (message) => [
        message.text,
        message.audio_transcription,
      ],
    ),
  ]
    .filter(Boolean)
    .join(' ')
}

test('corpus possui metadados e origem segura', () => {
  assert.equal(
    corpus.corpus_version,
    1,
  )
  assert.equal(
    corpus.language,
    'pt-BR',
  )
  assert.equal(
    corpus.data_origin,
    'synthetic_anonymized',
  )
  assert.ok(
    Array.isArray(corpus.cases),
  )
  assert.ok(
    corpus.cases.length >= 10,
  )
})

test('todas as coberturas obrigatórias estão presentes', () => {
  const covered = new Set(
    corpus.cases.flatMap(
      (caseItem) =>
        caseItem.coverage,
    ),
  )

  for (
    const required of
    corpus.required_coverages
  ) {
    assert.ok(
      covered.has(required),
      `Cobertura ausente: ${required}`,
    )
  }
})

test('casos, mensagens e versões são únicos e válidos', () => {
  const caseIds = new Set()

  for (const caseItem of corpus.cases) {
    assert.ok(caseItem.id)
    assert.equal(
      caseIds.has(caseItem.id),
      false,
      `Caso duplicado: ${caseItem.id}`,
    )
    caseIds.add(caseItem.id)

    assert.ok(
      allowedStatuses.has(
        caseItem.initial_status,
      ),
      `Status inicial inválido em ${caseItem.id}`,
    )
    assert.ok(
      Number.isFinite(
        Date.parse(
          caseItem.reference_time,
        ),
      ),
      `Horário inválido em ${caseItem.id}`,
    )

    const versionsByMessage =
      new Map()
    const identityVersions =
      new Set()

    for (
      const message of
      caseItem.messages
    ) {
      assert.ok(message.id)
      assert.ok(
        Number.isInteger(
          message.version,
        ) &&
          message.version >= 1,
        `Versão inválida em ${caseItem.id}/${message.id}`,
      )
      assert.ok(
        allowedDirections.has(
          message.direction,
        ),
        `Direção inválida em ${caseItem.id}/${message.id}`,
      )
      assert.ok(
        allowedStates.has(
          message.state,
        ),
        `Estado inválido em ${caseItem.id}/${message.id}`,
      )
      assert.ok(
        allowedContentTypes.has(
          message.content_type,
        ),
        `Tipo inválido em ${caseItem.id}/${message.id}`,
      )
      assert.ok(
        Number.isFinite(
          Date.parse(
            message.captured_at,
          ),
        ),
        `Horário inválido em ${caseItem.id}/${message.id}`,
      )

      const identity =
        `${message.id}:${message.version}`

      assert.equal(
        identityVersions.has(
          identity,
        ),
        false,
        `Identidade duplicada em ${caseItem.id}: ${identity}`,
      )
      identityVersions.add(identity)

      const versions =
        versionsByMessage.get(
          message.id,
        ) ?? []
      versions.push(message.version)
      versionsByMessage.set(
        message.id,
        versions,
      )

      if (
        message.content_type ===
        'text'
      ) {
        if (
          message.state ===
          'deleted'
        ) {
          assert.equal(
            message.text,
            null,
            `Mensagem apagada manteve texto em ${caseItem.id}/${message.id}`,
          )
        } else {
          assert.equal(
            typeof message.text,
            'string',
            `Texto ausente em ${caseItem.id}/${message.id}`,
          )
        }
        assert.equal(
          message.audio_transcription,
          null,
          `Texto não pode ter transcrição em ${caseItem.id}/${message.id}`,
        )
      }

      if (
        message.content_type ===
        'audio'
      ) {
        assert.equal(
          message.text,
          null,
          `Áudio não pode ter texto bruto em ${caseItem.id}/${message.id}`,
        )
        assert.ok(
          message.audio_transcription ===
            null ||
            typeof message.audio_transcription ===
              'string',
          `Transcrição inválida em ${caseItem.id}/${message.id}`,
        )
      }
    }

    for (
      const [
        messageId,
        versions,
      ] of versionsByMessage
    ) {
      versions.sort(
        (left, right) =>
          left - right,
      )

      assert.deepEqual(
        versions,
        Array.from(
          {
            length:
              versions.length,
          },
          (_, index) =>
            index + 1,
        ),
        `Versões fora de sequência em ${caseItem.id}/${messageId}`,
      )
    }
  }
})

test('fotografia atual coincide com o oráculo', () => {
  for (const caseItem of corpus.cases) {
    const latestMessages =
      getLatestMessages(
        caseItem.messages,
      )

    const activeIds =
      latestMessages
        .filter(
          (message) =>
            message.state ===
            'active',
        )
        .map(
          (message) =>
            message.id,
        )
        .sort()

    const expectedIds = [
      ...caseItem.oracle
        .current_message_ids,
    ].sort()

    assert.deepEqual(
      activeIds,
      expectedIds,
      `Fotografia divergente em ${caseItem.id}`,
    )

    const latestIds =
      new Set(
        latestMessages.map(
          (message) =>
            message.id,
        ),
      )

    for (
      const message of
      caseItem.messages
    ) {
      if (
        !latestIds.has(
          message.id,
        )
      ) {
        continue
      }

      const latest =
        latestMessages.find(
          (item) =>
            item.id ===
            message.id,
        )

      if (
        message.version <
        latest.version
      ) {
        assert.equal(
          message.state,
          'superseded',
          `Versão anterior não superseded em ${caseItem.id}/${message.id}`,
        )
      }
    }
  }
})

test('evidências usam somente mensagens atuais e ativas', () => {
  for (const caseItem of corpus.cases) {
    const activeIds =
      new Set(
        getLatestMessages(
          caseItem.messages,
        )
          .filter(
            (message) =>
              message.state ===
              'active',
          )
          .map(
            (message) =>
              message.id,
          ),
      )

    for (
      const evidenceId of
      caseItem.oracle
        .evidence_message_ids
    ) {
      assert.ok(
        activeIds.has(
          evidenceId,
        ),
        `Evidência inativa em ${caseItem.id}: ${evidenceId}`,
      )
    }
  }
})

test('fatos e decisões não possuem contradições', () => {
  for (const caseItem of corpus.cases) {
    const {
      facts,
      decision,
    } = caseItem.oracle

    for (const key of factKeys) {
      assert.equal(
        typeof facts[key],
        'boolean',
        `Fato inválido em ${caseItem.id}: ${key}`,
      )
    }

    assert.ok(
      facts.final_intent ===
        null ||
        typeof facts.final_intent ===
          'string',
      `Intenção final inválida em ${caseItem.id}`,
    )
    assert.equal(
      facts.lead_responded &&
        facts.no_response,
      false,
      `Resposta e ausência simultâneas em ${caseItem.id}`,
    )
    assert.equal(
      facts.explicit_win &&
        facts.explicit_loss,
      false,
      `Ganho e perda simultâneos em ${caseItem.id}`,
    )
    assert.ok(
      allowedStatuses.has(
        decision.recommended_status,
      ),
      `Decisão inválida em ${caseItem.id}`,
    )
    assert.equal(
      decision.prohibited_statuses.includes(
        decision.recommended_status,
      ),
      false,
      `Status recomendado também proibido em ${caseItem.id}`,
    )

    if (
      decision.recommended_status ===
      'ganho'
    ) {
      assert.equal(
        facts.explicit_win,
        true,
        `Ganho sem fato explícito em ${caseItem.id}`,
      )
      assert.equal(
        decision.next_action_required,
        false,
        `Ganho não pode exigir próxima ação em ${caseItem.id}`,
      )
    }

    if (
      decision.recommended_status ===
      'perdido'
    ) {
      assert.equal(
        facts.explicit_loss,
        true,
        `Perda sem fato explícito em ${caseItem.id}`,
      )
      assert.equal(
        decision.next_action_required,
        false,
        `Perda não pode exigir próxima ação em ${caseItem.id}`,
      )
    }

    if (
      decision.recommended_status ===
      'respondeu'
    ) {
      assert.equal(
        facts.lead_responded,
        true,
        `Agenda sem resposta real em ${caseItem.id}`,
      )
      assert.equal(
        facts.follow_up_requested ||
          facts
            .visit_or_test_drive_scheduled,
        true,
        `Agenda sem compromisso comercial em ${caseItem.id}`,
      )
      assert.equal(
        facts.follow_up_has_date_or_period,
        true,
        `Agenda sem data ou período em ${caseItem.id}`,
      )
      assert.ok(
        Number.isFinite(
          Date.parse(
            decision
              .expected_next_action_at,
          ),
        ),
        `Agenda sem horário resolvido em ${caseItem.id}`,
      )
      assert.ok(
        Date.parse(
          decision
            .expected_next_action_at,
        ) >
          Date.parse(
            caseItem.reference_time,
          ),
        `Agenda vencida em ${caseItem.id}`,
      )
    }
  }
})

test('áudio sem transcrição bloqueia aplicação no CRM', () => {
  const affectedCases =
    corpus.cases.filter(
      (caseItem) =>
        caseItem.coverage.includes(
          'audio_without_transcription',
        ),
    )

  assert.ok(
    affectedCases.length > 0,
  )

  for (
    const caseItem of
    affectedCases
  ) {
    const currentMessages =
      getLatestMessages(
        caseItem.messages,
      )

    assert.ok(
      currentMessages.some(
        (message) =>
          message.state ===
            'active' &&
          message.content_type ===
            'audio' &&
          message.audio_transcription ===
            null,
      ),
      `Caso sem áudio pendente: ${caseItem.id}`,
    )
    assert.equal(
      caseItem.oracle.decision
        .application_blocked,
      true,
      `Aplicação não bloqueada em ${caseItem.id}`,
    )
    assert.equal(
      caseItem.oracle.decision
        .apply_crm_change,
      false,
      `CRM liberado com áudio pendente em ${caseItem.id}`,
    )
  }
})

test('corpus não contém formatos reconhecíveis de dados pessoais', () => {
  const forbiddenPatterns = [
    {
      label: 'e-mail',
      pattern:
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    },
    {
      label: 'CPF',
      pattern:
        /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/,
    },
    {
      label: 'CNPJ',
      pattern:
        /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/,
    },
    {
      label: 'telefone',
      pattern:
        /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/,
    },
  ]

  for (const caseItem of corpus.cases) {
    const text =
      collectText(caseItem)

    for (
      const {
        label,
        pattern,
      } of forbiddenPatterns
    ) {
      assert.equal(
        pattern.test(text),
        false,
        `${label} encontrado em ${caseItem.id}`,
      )
    }
  }
})

test('falsos positivos conhecidos proíbem Agenda', () => {
  const falsePositives =
    corpus.cases.filter(
      (caseItem) =>
        caseItem.coverage.includes(
          'known_false_positive',
        ),
    )

  assert.ok(
    falsePositives.length >= 2,
  )

  for (
    const caseItem of
    falsePositives
  ) {
    assert.notEqual(
      caseItem.oracle.decision
        .recommended_status,
      'respondeu',
      `Falso positivo virou Agenda em ${caseItem.id}`,
    )
    assert.ok(
      caseItem.oracle.decision
        .prohibited_statuses.includes(
          'respondeu',
        ),
      `Agenda não está proibida em ${caseItem.id}`,
    )
  }
})
