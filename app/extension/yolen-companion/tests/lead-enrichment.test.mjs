import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import leadEnrichment from '../src/lead-enrichment.js'

const contentScript =
  readFileSync(
    new URL(
      '../src/content-script.js',
      import.meta.url,
    ),
    'utf8',
  )

const {
  CONTRACT_VERSION,
  extractLeadEnrichmentCandidates,
  isLeadEnrichmentCandidate,
} = leadEnrichment

function incoming(
  text,
  overrides = {},
) {
  return {
    id: 'message-1',
    direction: 'incoming',
    text,
    audio_transcription: null,
    ...overrides,
  }
}

function fields(candidates) {
  return candidates.map(
    (candidate) =>
      candidate.field,
  )
}

test('B2 carrega o extrator antes do content script sem executar escrita', () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL(
        '../manifest.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )

  const whatsappScript =
    manifest.content_scripts.find(
      (entry) =>
        entry.matches?.includes(
          'https://web.whatsapp.com/*',
        ),
    )

  assert.ok(whatsappScript)

  const enrichmentIndex =
    whatsappScript.js.indexOf(
      'src/lead-enrichment.js',
    )

  const contentIndex =
    whatsappScript.js.indexOf(
      'src/content-script.js',
    )

  assert.ok(enrichmentIndex >= 0)
  assert.ok(contentIndex > enrichmentIndex)
})

test('B2 contrato exige proveniência e confirmação humana', () => {
  const candidates =
    extractLeadEnrichmentCandidates([
      incoming(
        'Meu e-mail é Joao.Silva+vendas@Example.com',
      ),
    ])

  assert.equal(
    candidates.length,
    1,
  )

  const candidate = candidates[0]

  assert.equal(
    candidate.contract_version,
    CONTRACT_VERSION,
  )
  assert.equal(candidate.field, 'email')
  assert.equal(
    candidate.normalized_value,
    'joao.silva+vendas@example.com',
  )
  assert.equal(
    candidate.source,
    'conversation',
  )
  assert.deepEqual(
    candidate.evidence_message_ids,
    ['message-1'],
  )
  assert.equal(
    candidate.confidence,
    'high',
  )
  assert.equal(
    candidate.subject,
    'lead',
  )
  assert.equal(
    candidate.requires_human_confirmation,
    true,
  )
  assert.equal(
    isLeadEnrichmentCandidate(
      candidate,
    ),
    true,
  )

  assert.equal(
    Object.hasOwn(
      candidate,
      'conversation_text',
    ),
    false,
  )
  assert.equal(
    Object.hasOwn(
      candidate,
      'message_text',
    ),
    false,
  )
  assert.equal(
    Object.hasOwn(
      candidate,
      'evidence_text',
    ),
    false,
  )
})

test('B2 ignora mensagens enviadas pelo vendedor', () => {
  const candidates =
    extractLeadEnrichmentCandidates([
      incoming(
        'Meu e-mail é vendedor@example.com',
        {
          direction: 'outgoing',
        },
      ),
    ])

  assert.deepEqual(candidates, [])
})

test('B2 extrai CPF e CNPJ válidos quando identificados na própria mensagem', () => {
  const candidates =
    extractLeadEnrichmentCandidates([
      incoming(
        'Meu CPF é 529.982.247-25',
        { id: 'cpf-message' },
      ),
      incoming(
        'CNPJ: 11.222.333/0001-81',
        { id: 'cnpj-message' },
      ),
      incoming(
        'CPF: 111.111.111-11',
        { id: 'invalid-message' },
      ),
    ])

  assert.deepEqual(
    fields(candidates),
    ['cpf', 'cnpj'],
  )

  assert.equal(
    candidates[0].normalized_value,
    '52998224725',
  )
  assert.equal(
    candidates[0].sensitivity,
    'sensitive_document',
  )
  assert.equal(
    candidates[1].normalized_value,
    '11222333000181',
  )
  assert.equal(
    candidates[1].sensitivity,
    'sensitive_document',
  )
})

test('B2.1 associa CPF e CNPJ isolados à solicitação explícita imediatamente anterior', () => {
  const candidates =
    extractLeadEnrichmentCandidates([
      incoming(
        'Me passa seu cpf por gentileza',
        {
          id: 'ask-cpf',
          direction: 'outgoing',
        },
      ),
      incoming(
        '08561312963',
        {
          id: 'reply-cpf',
        },
      ),
      incoming(
        'Pode me enviar seu CNPJ?',
        {
          id: 'ask-cnpj',
          direction: 'outgoing',
        },
      ),
      incoming(
        '11.222.333/0001-81',
        {
          id: 'reply-cnpj',
        },
      ),
    ])

  assert.deepEqual(
    fields(candidates),
    ['cpf', 'cnpj'],
  )

  assert.equal(
    candidates[0].normalized_value,
    '08561312963',
  )

  assert.equal(
    candidates[0].detection,
    'contextual_reply',
  )

  assert.deepEqual(
    candidates[0]
      .evidence_message_ids,
    [
      'ask-cpf',
      'reply-cpf',
    ],
  )

  assert.equal(
    candidates[0]
      .requires_human_confirmation,
    true,
  )

  assert.equal(
    candidates[1].normalized_value,
    '11222333000181',
  )

  assert.deepEqual(
    candidates[1]
      .evidence_message_ids,
    [
      'ask-cnpj',
      'reply-cnpj',
    ],
  )
})

test('B2.1 não interpreta documento isolado sem solicitação explícita imediatamente anterior', () => {
  const candidates =
    extractLeadEnrichmentCandidates([
      incoming(
        '08561312963',
        {
          id: 'bare-document',
        },
      ),
      incoming(
        'Me passa seu telefone',
        {
          id: 'ask-phone',
          direction: 'outgoing',
        },
      ),
      incoming(
        '08561312963',
        {
          id: 'phone-reply',
        },
      ),
      incoming(
        'Me passa seu cpf',
        {
          id: 'ask-cpf',
          direction: 'outgoing',
        },
      ),
      incoming(
        'Só os números',
        {
          id: 'follow-up',
          direction: 'outgoing',
        },
      ),
      incoming(
        '08561312963',
        {
          id: 'late-reply',
        },
      ),
    ])

  assert.deepEqual(
    candidates,
    [],
  )
})

test('B2.1 não atribui documento contextual solicitado para terceiro', () => {
  const candidates =
    extractLeadEnrichmentCandidates([
      incoming(
        'Me passa o CPF da sua mãe',
        {
          id: 'ask-third-party',
          direction: 'outgoing',
        },
      ),
      incoming(
        '52998224725',
        {
          id: 'third-party-reply',
        },
      ),
    ])

  assert.deepEqual(
    candidates,
    [],
  )
})

test('B2.1 rejeita documento contextual com dígitos inválidos', () => {
  const candidates =
    extractLeadEnrichmentCandidates([
      incoming(
        'Me passa seu CPF',
        {
          id: 'ask-invalid-cpf',
          direction: 'outgoing',
        },
      ),
      incoming(
        '11111111111',
        {
          id: 'invalid-cpf',
        },
      ),
    ])

  assert.deepEqual(
    candidates,
    [],
  )
})

test('B2.1 não infere documento quando a solicitação é ambígua', () => {
  const candidates =
    extractLeadEnrichmentCandidates([
      incoming(
        'Me passa seu CPF ou CNPJ',
        {
          id: 'ambiguous-request',
          direction: 'outgoing',
        },
      ),
      incoming(
        '08561312963',
        {
          id: 'ambiguous-reply',
        },
      ),
    ])

  assert.deepEqual(
    candidates,
    [],
  )
})

test('B2 não atribui ao lead dado explicitamente relacionado a terceiro', () => {
  const candidates =
    extractLeadEnrichmentCandidates([
      incoming(
        'O e-mail da minha esposa é esposa@example.com',
      ),
      incoming(
        'CPF da minha mãe: 529.982.247-25',
        { id: 'cpf-third-party' },
      ),
      incoming(
        'CEP da minha filha: 89220-000',
        { id: 'cep-third-party' },
      ),
    ])

  assert.deepEqual(candidates, [])
})

test('B2 normaliza nascimento, profissão, CEP e endereço apenas por declaração explícita', () => {
  const candidates =
    extractLeadEnrichmentCandidates([
      incoming(
        'Nasci em 7/3/1990',
        { id: 'birth' },
      ),
      incoming(
        'Trabalho como gerente de vendas.',
        { id: 'profession' },
      ),
      incoming(
        'Meu CEP é 89220-000',
        { id: 'cep' },
      ),
      incoming(
        'Meu endereço é Rua das Flores, 120, Centro',
        { id: 'address' },
      ),
    ])

  assert.deepEqual(
    fields(candidates),
    [
      'birth_date',
      'profession',
      'cep',
      'address_raw',
    ],
  )

  assert.equal(
    candidates[0].normalized_value,
    '1990-03-07',
  )
  assert.equal(
    candidates[1].normalized_value,
    'gerente de vendas',
  )
  assert.equal(
    candidates[2].normalized_value,
    '89220000',
  )
  assert.equal(
    candidates[3].normalized_value,
    'Rua das Flores, 120, Centro',
  )
})

test('B2 rejeita data inexistente ou futura', () => {
  const candidates =
    extractLeadEnrichmentCandidates([
      incoming(
        'Data de nascimento: 31/02/1990',
        { id: 'invalid-date' },
      ),
      incoming(
        'Nasci em 01/01/2999',
        { id: 'future-date' },
      ),
    ])

  assert.deepEqual(candidates, [])
})

test('B2 detecta telefone adicional e não sugere o próprio WhatsApp atual', () => {
  const candidates =
    extractLeadEnrichmentCandidates(
      [
        incoming(
          'Meu outro celular é (47) 98888-7777',
          { id: 'other-phone' },
        ),
        incoming(
          'Meu telefone é (44) 99157-7710',
          { id: 'same-phone' },
        ),
      ],
      {
        currentPhone:
          '5544991577710',
      },
    )

  assert.equal(
    candidates.length,
    1,
  )
  assert.equal(
    candidates[0].field,
    'phone_mobile',
  )
  assert.equal(
    candidates[0].normalized_value,
    '47988887777',
  )
  assert.deepEqual(
    candidates[0].evidence_message_ids,
    ['other-phone'],
  )
})

test('B2 usa transcrição de áudio recebida como evidência sem precisar de nova IA', () => {
  const candidates =
    extractLeadEnrichmentCandidates([
      incoming(
        '',
        {
          id: 'audio-message',
          has_audio: true,
          audio_transcription:
            'Meu e-mail é audio@example.com',
        },
      ),
    ])

  assert.equal(
    candidates.length,
    1,
  )
  assert.equal(
    candidates[0].field,
    'email',
  )
  assert.deepEqual(
    candidates[0].evidence_message_ids,
    ['audio-message'],
  )
})

test('B2 deduplica o mesmo valor e preserva todos os IDs de evidência', () => {
  const candidates =
    extractLeadEnrichmentCandidates([
      incoming(
        'Meu e-mail é contato@example.com',
        { id: 'message-1' },
      ),
      incoming(
        'contato@example.com',
        { id: 'message-2' },
      ),
    ])

  assert.equal(
    candidates.length,
    1,
  )
  assert.equal(
    candidates[0].confidence,
    'high',
  )
  assert.deepEqual(
    candidates[0].evidence_message_ids,
    ['message-1', 'message-2'],
  )
})

test('B2 não inventa profissão por linguagem ambígua', () => {
  const candidates =
    extractLeadEnrichmentCandidates([
      incoming(
        'Sou de Joinville e gosto de vendas',
      ),
      incoming(
        'Minha esposa trabalha como médica',
        { id: 'third-party-job' },
      ),
    ])

  assert.deepEqual(candidates, [])
})

test('B2 integra candidatos reais no painel com confirmação humana explícita', () => {
  const integrationStart =
    contentScript.indexOf(
      'function getLeadEnrichmentCandidates()',
    )

  const integrationEnd =
    contentScript.indexOf(
      'function getCompactConnectionLabel()',
      integrationStart,
    )

  assert.notEqual(
    integrationStart,
    -1,
  )

  assert.notEqual(
    integrationEnd,
    -1,
  )

  const integrationBlock =
    contentScript.slice(
      integrationStart,
      integrationEnd,
    )

  assert.match(
    contentScript,
    /YolenCompanionLeadEnrichment/,
  )

  assert.match(
    integrationBlock,
    /getStructuredMessagesForEnrichment\(\)/,
  )

  assert.doesNotMatch(
    integrationBlock,
    /getStructuredMessagesForAnalysis\(\)/,
  )

  assert.match(
    integrationBlock,
    /extractLeadEnrichmentCandidates/,
  )

  assert.match(
    integrationBlock,
    /OWNED_BY_ME/,
  )

  assert.match(
    integrationBlock,
    /O cadastro só muda depois que você confirmar\./,
  )

  assert.match(
    integrationBlock,
    /data-yolen-action="confirm-lead-enrichment"/,
  )

  assert.match(
    integrationBlock,
    /data-yolen-action="ignore-lead-enrichment"/,
  )

  assert.match(
    integrationBlock,
    /applyLeadEnrichment/,
  )

  assert.match(
    integrationBlock,
    /confirmed_by_human:\s*true/,
  )

  assert.match(
    contentScript,
    /getLeadEnrichmentCandidatesHtml\(\),[\s\S]*getSellerInformationArchitectureHtml\(\)/,
  )
})


test('B2 usa candidatos no novo cadastro e remove dados já iguais no lead existente', () => {
  assert.match(
    contentScript,
    /resolution\?\.status ===\s*'NOT_FOUND'/,
  )

  assert.match(
    contentScript,
    /comparison:\s*'new_lead'/,
  )

  assert.match(
    contentScript,
    /getCurrentLeadEnrichmentValue/,
  )

  assert.match(
    contentScript,
    /areSameLeadEnrichmentValue/,
  )

  assert.match(
    contentScript,
    /current_value/,
  )

  assert.match(
    contentScript,
    /YolenCompanionLeadEnrichmentContext/,
  )

  assert.match(
    contentScript,
    /state\.leadResolution\?\.status ===[\s\S]*'NOT_FOUND'[\s\S]*return ''/,
  )
})


test('B2 enriquecimento usa ledger completo e não a janela comercial', () => {
  assert.match(
    contentScript,
    /function getStructuredMessagesForEnrichment/,
  )

  assert.match(
    contentScript,
    /getSortedLedgerMessages\(\)[\s\S]*MAX_MESSAGE_LEDGER_SIZE/,
  )

  const start =
    contentScript.indexOf(
      'function getLeadEnrichmentCandidates()',
    )

  const end =
    contentScript.indexOf(
      'function getLeadEnrichmentFieldLabel',
      start,
    )

  assert.notEqual(start, -1)
  assert.notEqual(end, -1)

  const block =
    contentScript.slice(
      start,
      end,
    )

  assert.match(
    block,
    /getStructuredMessagesForEnrichment\(\)/,
  )

  assert.doesNotMatch(
    block,
    /getStructuredMessagesForAnalysis\(\)/,
  )
})


test('B2 não mantém diagnóstico temporário no painel', () => {
  assert.doesNotMatch(
    contentScript,
    /DIAGNÓSTICO B2 TEMPORÁRIO/,
  )

  assert.doesNotMatch(
    contentScript,
    /getLeadEnrichmentDebugHtml/,
  )
})
