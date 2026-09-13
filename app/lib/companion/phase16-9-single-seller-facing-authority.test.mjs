import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// FASE 16.9 (correção final) — prova que, independentemente de
// MESSAGE_INTELLIGENCE_ENGINE_VERSION ser 'v1' ou 'v2' (ou de
// MESSAGE_INTELLIGENCE_SELLER_MODE=active), o código de
// generate_message não tem mais NENHUM caminho capaz de chamar o
// Message Intelligence Engine para produzir a resposta seller-facing.
//
// Isso não é um teste de string por si só: é a prova estrutural de que
// a REGRESSÃO ARQUITETURAL apontada pela auditoria (duas autoridades
// comerciais possíveis, uma delas condicionada a uma variável de
// ambiente) foi eliminada do código executável, e não apenas
// "desligada por configuração" — a auditoria explicitamente rejeitou
// essa segunda forma de correção. Combinado com
// `npx tsc --noEmit` (que falharia se qualquer import morto
// permanecesse) e com os testes comportamentais de
// phase16-9-message-unified-reasoning.test.mjs (que provam que a
// ÚNICA função capaz de responder ao vendedor,
// `composeSellerMessage`, só redige dentro do Commercial Reasoning
// canônico), esta prova estrutural fecha o ciclo: não existe mais
// nenhum código, em nenhum valor de configuração, capaz de reintroduzir
// uma segunda autoridade comercial na resposta seller-facing.

const here = path.dirname(fileURLToPath(import.meta.url))
const routeSource = fs.readFileSync(
  path.join(
    here,
    '../../api/companion/method-guidance/route.ts',
  ),
  'utf8',
)

test(
  '16.9: route.ts de generate_message não importa nenhum motor do Message Intelligence Engine (V1 ou V2)',
  () => {
    assert.doesNotMatch(
      routeSource,
      /message-intelligence-seller-activation-v2/,
      'route.ts não pode importar o módulo de ativação do MIE V2',
    )

    assert.doesNotMatch(
      routeSource,
      /from '\.\.\/\.\.\/\.\.\/lib\/server\/message-intelligence-seller-activation'/,
      'route.ts não pode importar o módulo de ativação do MIE V1',
    )

    assert.doesNotMatch(
      routeSource,
      /resolveMessageIntelligenceEngineVersion/,
      'route.ts não pode mais decidir motor (v1/v2): não existe mais motor a decidir',
    )

    assert.doesNotMatch(
      routeSource,
      /tryGenerateActivatedMessageIntelligenceSellerMessageV1|tryGenerateActivatedMessageIntelligenceSellerMessageV2/,
      'nenhuma função de ativação do MIE pode ser chamada por route.ts',
    )
  },
)

test(
  '16.9: o único gerador de resposta seller-facing em generate_message é composeSellerMessage, alimentado pelo Commercial Reasoning canônico',
  () => {
    const generateMessageBlock =
      routeSource.slice(
        routeSource.indexOf(
          "if (operation === 'generate_message') {",
        ),
        routeSource.indexOf(
          'const canonicalMessages = await loadCanonicalMessages',
        ),
      )

    assert.ok(
      generateMessageBlock.length > 0,
      'não encontrei o bloco de generate_message em route.ts',
    )

    // A única chamada capaz de produzir texto seller-facing dentro do
    // bloco de generate_message é composeSellerMessage — e ela só pode
    // ser chamada depois de carregar o reasoning canônico.
    const reasoningIndex = generateMessageBlock.indexOf(
      'loadCanonicalSellerReasoning',
    )
    const composeIndex = generateMessageBlock.indexOf(
      'composeSellerMessage(',
    )

    assert.ok(
      reasoningIndex > -1 && composeIndex > -1,
      'generate_message precisa carregar o reasoning canônico antes de compor a mensagem',
    )

    assert.ok(
      reasoningIndex < composeIndex,
      'o reasoning canônico precisa ser carregado ANTES de composeSellerMessage, nunca depois',
    )

    assert.match(
      generateMessageBlock,
      /reasoning:\s*canonicalReasoning/,
      'composeSellerMessage precisa receber o reasoning canônico, não uma orientação própria',
    )

    // Nenhum `return NextResponse.json` pode existir entre o início do
    // bloco e a chamada de composeSellerMessage — isso é exatamente o
    // padrão proibido (MIE decidindo e retornando antes do reasoning
    // canônico).
    const beforeCompose = generateMessageBlock.slice(
      0,
      composeIndex,
    )

    assert.doesNotMatch(
      beforeCompose,
      /return NextResponse\.json/,
      'nenhuma resposta seller-facing pode ser devolvida antes de composeSellerMessage usar o reasoning canônico',
    )
  },
)
