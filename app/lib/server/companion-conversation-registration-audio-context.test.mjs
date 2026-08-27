import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PENDING_AUDIO_TRANSCRIPTION_PLACEHOLDER,
  isPendingAudioTranscription,
  toCanonicalMessagePromptText,
} from './companion-conversation-registration-loader.ts'

test('áudio transcrito entra como conteúdo canônico normal', () => {
  assert.equal(
    toCanonicalMessagePromptText({
      content_type: 'audio',
      text: 'Quero cancelar o plano.',
    }),
    'Quero cancelar o plano.',
  )
})

test('áudio pendente não desaparece e não inventa conteúdo', () => {
  const message = {
    content_type: 'audio',
    text: null,
    is_deleted: false,
  }

  assert.equal(isPendingAudioTranscription(message), true)
  assert.equal(
    toCanonicalMessagePromptText(message),
    PENDING_AUDIO_TRANSCRIPTION_PLACEHOLDER,
  )
  assert.doesNotMatch(
    PENDING_AUDIO_TRANSCRIPTION_PLACEHOLDER,
    /cancelar|comprar|proposta|pagamento/i,
  )
})
