# ManyChat — Gate do contrato de transcrição de áudio

Estado: contrato de preparação e normalização validado em código, sem dispatch produtivo.

Este gate conecta semanticamente a evidência já validada do ManyChat ao contrato do pipeline de transcrição existente da Yolen, mas NÃO habilita ainda o envio produtivo do ManyChat para `/api/companion/transcribe-audio`.

## Evidência já fechada antes deste gate

O cenário autenticado real comprovou:

- identidade nativa estável via `data-mid` para mensagens humanas;
- autoria `customer` x `human_agent` x `automation` sem ambiguidade no corpus observado;
- timestamp parseável;
- conteúdo textual isolado no nó nativo;
- áudio localizado no mesmo nó nativo;
- fonte HTTPS única e estável após remount;
- arquivo obtido externamente com HTTP `206`;
- `59817` bytes reais;
- transporte e detecção confirmando `audio/ogg`;
- suporte a ranges;
- SHA-256 válido.

O DOM havia declarado `audio/mpeg`, portanto esse valor permanece apenas como hint. O MIME canônico continua sendo o MIME detectado do arquivo real.

## Implementação

Arquivo:

`app/extension/yolen-companion/src/manychat-audio-transcription-contract.js`

O módulo executa duas responsabilidades controladas.

### 1. Preparação do payload

`buildManyChatAudioTranscriptionPlan(...)` é assíncrono e só produz um payload pronto quando:

- a mensagem tem identidade ManyChat validada;
- a autoria é humana (`customer` ou `human_agent`);
- o conteúdo foi classificado como áudio;
- a fonte HTTPS foi validada;
- o probe externo confirmou acesso real ao arquivo;
- o base64 é decodificado localmente para os bytes reais;
- o tamanho real dos bytes decodificados coincide exatamente com `bytes_downloaded` do probe;
- o SHA-256 é calculado localmente com Web Crypto sobre os próprios bytes e coincide exatamente com o SHA-256 do probe;
- existe `cycle_id`.

Esse vínculo impede que um probe válido de um arquivo seja reutilizado acidentalmente para autorizar bytes diferentes, inclusive quando os arquivos têm exatamente o mesmo tamanho.

O `message_key` derivado é namespaced como:

`manychat:<data-mid codificado>`

A URL do áudio NÃO é usada como identidade.

O payload preparado é compatível com o formato de `/api/companion/transcribe-audio`:

- `cycle_id`;
- `audio_base64`;
- `mime_type` canônico;
- `file_name` coerente com o MIME real;
- `audio_index`;
- `audio_target_key` igual ao `message_key` ManyChat.

### 2. Normalização do resultado

`applyManyChatAudioTranscriptionResult(...)` recebe a resposta de transcrição e monta uma mensagem de áudio compatível com `yolen-universal-conversation-v1`:

- `message_key` preservado;
- `direction` preservada;
- `occurred_at` preservado da mensagem original;
- `content_type = audio`;
- `audio_transcription` preenchida;
- `is_deleted = false`;
- nenhuma inferência de exclusão por desaparecimento do DOM.

A autoria permanece em sidecar semântico porque o contrato universal v1 ainda não possui `author_kind` nativo.

Regras mantidas:

- cliente: `customer_evidence_eligible = true`;
- vendedor humano: `seller_action_eligible = true`;
- automação: bloqueada antes de gerar `message_key` ou payload de transcrição.

## Bloqueio produtivo intencional

Apesar de o payload ser compatível com o endpoint atual, `dispatch_enabled` continua `false`.

Motivo: o endpoint existente ainda persiste semântica específica de WhatsApp, incluindo:

- `event_type = whatsapp_audio_transcribed`;
- metadata histórica com origem WhatsApp;
- texto de prompt orientado a conversa do WhatsApp.

Ativar ManyChat diretamente nesse endpoint agora contaminaria a semântica do histórico.

Portanto este gate valida o contrato sem alterar a persistência existente.

## Restrições preservadas

- nenhum fetch produtivo do áudio foi habilitado;
- nenhum dispatch ManyChat foi habilitado;
- nenhuma persistência ManyChat foi habilitada;
- reasoning continua desligado;
- composer continua desligado;
- manifest continua sem injeção ManyChat;
- automação continua proibida como evidência de cliente;
- safe views não expõem URL, `data-mid`, base64 ou SHA-256 bruto.

## Próximo gate

Universalizar o pipeline de transcrição no backend sem quebrar WhatsApp: separar `platform/source` da transcrição, manter compatibilidade com os eventos legados e só então permitir dispatch real do ManyChat.
