// Lê o relatório técnico do corpus de regressão (JSON) e a conversa original
// de cada caso, e gera um resumo em Markdown fácil de ler: conversa de um
// lado, orientação real da IA do outro. Serve para a revisão manual de
// qualidade (Fase 18 do roadmap) — não faz nenhuma chamada nova à OpenAI.
//
// Uso:
//   node scripts/companion-corpus-regression-to-markdown.mjs

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here =
  path.dirname(fileURLToPath(import.meta.url))

const corpusPath =
  path.resolve(here, '../docs/companion-v2/corpus/cases.json')

const reportPath =
  path.resolve(here, 'output/companion-corpus-regression-report.json')

const outputPath =
  path.resolve(here, 'output/companion-corpus-regression-report.md')

const DIRECTION_LABEL = {
  incoming: 'Cliente',
  outgoing: 'Vendedor',
}

function formatConversation(corpusCase) {
  const latestById = new Map()

  for (const message of corpusCase.messages) {
    const existing = latestById.get(message.id)

    if (!existing || message.version > existing.version) {
      latestById.set(message.id, message)
    }
  }

  return [...latestById.values()]
    .sort((a, b) => a.sequence - b.sequence)
    .map((message) => {
      const who = DIRECTION_LABEL[message.direction] ?? message.direction

      if (message.state === 'deleted') {
        return `- **${who}:** _(mensagem apagada, não entra no contexto)_`
      }

      const text =
        message.text ??
        (message.audio_transcription
          ? `(áudio transcrito) ${message.audio_transcription}`
          : '(áudio sem transcrição)')

      return `- **${who}:** ${text}`
    })
    .join('\n')
}

function formatResult(result) {
  if (!result.ok) {
    return (
      `> ⚠️ Não deu pra avaliar: ${result.error.code} — ` +
      `${result.error.message}`
    )
  }

  if (result.mode === 'blocked') {
    return `> Diagnóstico bloqueado: ${(result.limitations ?? []).join(', ') || 'sem detalhe'}`
  }

  const communication = result.communication_output

  if (!communication) {
    return '> Sem saída de comunicação.'
  }

  const lines = [
    `- **Precisa intervir?** ${communication.intervention_needed ? 'sim' : 'não'}`,
    `- **Orientação:** ${communication.guidance}`,
  ]

  if (communication.recommended_question) {
    lines.push(`- **Pergunta sugerida:** ${communication.recommended_question}`)
  }

  if (communication.suggested_message) {
    lines.push(`- **Mensagem sugerida:** ${communication.suggested_message}`)
  }

  return lines.join('\n')
}

async function main() {
  const [corpus, report] = await Promise.all([
    readFile(corpusPath, 'utf8').then(JSON.parse),
    readFile(reportPath, 'utf8').then(JSON.parse),
  ])

  const resultsById = new Map(
    report.results.map((result) => [result.id, result]),
  )

  const sections = corpus.cases.map((corpusCase) => {
    const result = resultsById.get(corpusCase.id)

    if (!result) {
      return (
        `## ${corpusCase.title} (\`${corpusCase.id}\`)\n\n` +
        '_Não está no relatório atual — rode o corpus de novo._'
      )
    }

    return [
      `## ${corpusCase.title} (\`${corpusCase.id}\`)`,
      '',
      `Cobertura: ${corpusCase.coverage.join(', ')}`,
      '',
      '**Conversa:**',
      '',
      formatConversation(corpusCase),
      '',
      '**O que a IA respondeu:**',
      '',
      formatResult(result),
      '',
      '**Sua avaliação:** ⬜ boa ⬜ regular ⬜ ruim — motivo: ___________',
    ].join('\n')
  })

  const document = [
    '# Revisão de qualidade — corpus de regressão do Companion',
    '',
    `Gerado a partir de ${reportPath}`,
    `(execução original em ${report.generated_at})`,
    '',
    '---',
    '',
    sections.join('\n\n---\n\n'),
    '',
  ].join('\n')

  await writeFile(outputPath, document)

  console.log(`Resumo em Markdown salvo em ${outputPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
