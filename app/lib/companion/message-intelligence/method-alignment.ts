import type {
  MessageContextSnapshotV1,
} from './context-snapshot'

import type {
  CommercialMoveDecisionV1,
  CommercialMoveV1,
  MethodAlignmentV1,
  SituationKeyV1,
} from './strategy-contracts'

function normalizeText(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
}

const MOVE_METHOD_TERMS:
  Record<CommercialMoveV1, readonly string[]> = {
  answer_directly: [
    'responder',
    'fato',
    'informacao',
  ],
  clarify_request: [
    'clarificar',
    'compreender',
    'entender',
  ],
  advance_discovery: [
    'diagnost',
    'descob',
    'compreend',
    'necessidade',
    'pergunta',
  ],
  surface_impact: [
    'impact',
    'consequencia',
  ],
  confirm_decision_criteria: [
    'criterio',
    'decisao',
  ],
  isolate_objection: [
    'objec',
    'resistencia',
    'barreira',
  ],
  resolve_objection: [
    'objec',
    'resistencia',
    'barreira',
  ],
  reduce_decision_risk: [
    'risco',
    'duvida',
    'incerteza',
    'seguranca',
  ],
  compare_on_criteria: [
    'compar',
    'alternativa',
    'criterio',
  ],
  propose_next_step: [
    'proximo passo',
    'proxima etapa',
  ],
  confirm_commitment: [
    'compromisso',
    'confirm',
  ],
  recover_stalled_process: [
    'recuper',
    'retomar',
    'corrigir',
    'desvio',
  ],
  respect_customer_timing: [
    'esper',
    'tempo',
    'aguard',
  ],
  give_customer_space: [
    'esper',
    'espaco',
    'tempo',
  ],
  close_conversation: [
    'encerrar',
    'parar',
    'recusa',
  ],
  request_more_context: [
    'compreender',
    'contexto',
    'evidencia',
  ],
  no_commercial_move: [],
}

function collectMethodText(
  snapshot: MessageContextSnapshotV1,
): {
  method_name: string | null
  stage_key: string | null
  text: string
  has_wait_rule: boolean
  has_advance_rule: boolean
  has_stop_asking_rule: boolean
} {
  const published =
    snapshot.company.published_method

  if (!published) {
    return {
      method_name: null,
      stage_key: null,
      text: '',
      has_wait_rule: false,
      has_advance_rule: false,
      has_stop_asking_rule: false,
    }
  }

  const currentKey =
    snapshot.commercial
      .current_method_stage
      ?.value
      ?.stage_key ?? null

  const stage =
    published.definition.stages.find(
      (item: { key: string }) =>
        item.key === currentKey,
    ) ?? null

  const values: string[] = [
    published.definition.name,
    published.definition.description,
    ...published.definition.principles,
  ]

  if (stage) {
    values.push(
      stage.name,
      stage.objective,
      ...stage.completion_criteria,
      ...stage.partial_completion_criteria,
      ...stage.recommended_questions,
      ...stage.common_mistakes,
      ...stage.deepen_when,
      ...stage.sufficient_when,
      ...stage.advance_when,
      ...stage.wait_when,
      ...stage.stop_asking_when,
      ...stage.dimensions.flatMap(
        (dimension: {
          name: string
          objective: string
          evidence_criteria: string[]
        }) => [
          dimension.name,
          dimension.objective,
          ...dimension.evidence_criteria,
        ],
      ),
    )
  }

  return {
    method_name:
      published.definition.name,
    stage_key:
      currentKey,
    text:
      normalizeText(values.join(' | ')),
    has_wait_rule:
      Boolean(stage?.wait_when.length),
    has_advance_rule:
      Boolean(stage?.advance_when.length),
    has_stop_asking_rule:
      Boolean(stage?.stop_asking_when.length),
  }
}

function moveSupportedByMethod(
  move: CommercialMoveV1,
  methodText: string,
): boolean {
  const terms =
    MOVE_METHOD_TERMS[move]

  if (terms.length === 0) {
    return false
  }

  return terms.some(
    term => methodText.includes(term),
  )
}

export function evaluateMethodAlignmentV1({
  snapshot,
  situation,
  commercial_move,
}: {
  snapshot: MessageContextSnapshotV1
  situation: SituationKeyV1
  commercial_move: CommercialMoveDecisionV1
}): MethodAlignmentV1 {
  if (
    situation === 'non_commercial' ||
    commercial_move.move === 'no_commercial_move'
  ) {
    return {
      status: 'not_applicable',
      method_name:
        snapshot.company
          .published_method
          ?.definition.name ?? null,
      stage_key:
        snapshot.commercial
          .current_method_stage
          ?.value?.stage_key ?? null,
      reason:
        'Não existe movimento comercial a alinhar ao método.',
      constraints: [],
      requested_move_outside_method: false,
    }
  }

  const method =
    collectMethodText(snapshot)

  if (!method.method_name) {
    return {
      status:
        'insufficient_method_context',
      method_name: null,
      stage_key: null,
      reason:
        'Não há método comercial publicado no snapshot.',
      constraints: [],
      requested_move_outside_method: false,
    }
  }

  const adherence =
    snapshot.commercial
      .method_adherence
      ?.value?.status ?? null

  const requestedMove =
    commercial_move.requested_move

  const moveToEvaluate =
    requestedMove ?? commercial_move.move

  const requestedDiffers =
    requestedMove !== null &&
    requestedMove !== commercial_move.move

  const moveSupported =
    moveSupportedByMethod(
      moveToEvaluate,
      method.text,
    )

  const strategyMoveSupported =
    moveSupportedByMethod(
      commercial_move.move,
      method.text,
    )

  if (
    moveToEvaluate ===
      'recover_stalled_process' &&
    snapshot.commercial
      .recovery_guidance?.value
  ) {
    return {
      status: 'aligned',
      method_name: method.method_name,
      stage_key: method.stage_key,
      reason:
        'O próprio contexto comercial indica recuperação do método/processo.',
      constraints: [],
      requested_move_outside_method: false,
    }
  }

  if (
    (
      moveToEvaluate ===
        'respect_customer_timing' ||
      moveToEvaluate ===
        'give_customer_space'
    ) &&
    situation === 'postponement' &&
    method.has_wait_rule
  ) {
    return {
      status: 'aligned',
      method_name: method.method_name,
      stage_key: method.stage_key,
      reason:
        'A etapa atual do método prevê esperar quando a situação justificar.',
      constraints: [],
      requested_move_outside_method: false,
    }
  }

  if (
    moveToEvaluate ===
      'advance_discovery' &&
    snapshot.customer
      .missing_discovery
      .filter(
        (item: { memory_status?: string }) =>
          ![
            'closed',
            'resolved',
            'superseded',
          ].includes(
            String(
              item.memory_status ??
              'active',
            ),
          ),
      ).length === 0 &&
    method.has_stop_asking_rule
  ) {
    return {
      status:
        'advisory_deviation',
      method_name: method.method_name,
      stage_key: method.stage_key,
      reason:
        'O método possui regra de parar de perguntar e não há descoberta faltante ativa.',
      constraints: [
        'Não transformar descoberta em interrogatório.',
      ],
      requested_move_outside_method:
        requestedMove ===
        'advance_discovery',
    }
  }

  if (
    requestedDiffers &&
    !moveSupported &&
    strategyMoveSupported
  ) {
    return {
      status:
        'advisory_deviation',
      method_name: method.method_name,
      stage_key: method.stage_key,
      reason:
        'O movimento solicitado pelo vendedor não encontra suporte no método publicado, embora o movimento recomendado pela estratégia encontre.',
      constraints: [
        'A decisão deve preservar a alternativa de seguir o método sem bloquear uma solicitação que não viole governance.',
      ],
      requested_move_outside_method: true,
    }
  }

  if (
    adherence === 'off_method' &&
    !moveSupported
  ) {
    return {
      status:
        'advisory_deviation',
      method_name: method.method_name,
      stage_key: method.stage_key,
      reason:
        'A leitura comercial já identifica desvio do método e o movimento avaliado não representa recuperação explícita.',
      constraints: [
        'Preferir movimento compatível com a etapa publicada ou recuperação do processo.',
      ],
      requested_move_outside_method:
        requestedMove !== null,
    }
  }

  if (
    moveSupported ||
    adherence === 'on_method' ||
    adherence ===
      'partially_on_method' ||
    (
      method.has_advance_rule &&
      [
        'propose_next_step',
        'confirm_commitment',
      ].includes(moveToEvaluate)
    )
  ) {
    return {
      status: 'aligned',
      method_name: method.method_name,
      stage_key: method.stage_key,
      reason:
        'O movimento é compatível com os princípios ou condições da etapa atual do método publicado.',
      constraints: [],
      requested_move_outside_method: false,
    }
  }

  if (
    adherence ===
      'insufficient_evidence' ||
    adherence === null
  ) {
    return {
      status:
        'insufficient_method_context',
      method_name: method.method_name,
      stage_key: method.stage_key,
      reason:
        'Existe método publicado, mas não há evidência suficiente para afirmar alinhamento ou desvio.',
      constraints: [],
      requested_move_outside_method: false,
    }
  }

  return {
    status:
      'advisory_deviation',
    method_name: method.method_name,
    stage_key: method.stage_key,
    reason:
      'O movimento não encontra apoio claro no método publicado para o contexto atual.',
    constraints: [
      'Tratar como desvio consultivo, não como bloqueio de governance.',
    ],
    requested_move_outside_method:
      requestedMove !== null,
  }
}
