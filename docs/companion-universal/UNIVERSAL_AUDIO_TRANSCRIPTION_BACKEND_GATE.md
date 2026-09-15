# Companion — Gate do backend universal de transcrição de áudio

Estado: backend de transcrição separado por plataforma, com compatibilidade legada do WhatsApp preservada.

Este gate remove o bloqueio de persistência específica de WhatsApp identificado no contrato de áudio do ManyChat. Ele NÃO ativa ainda a injeção do ManyChat no manifest, o fetch produtivo do arquivo no runtime da extensão, nem reasoning/composer.

## Compatibilidade do WhatsApp

Chamadas antigas que não enviam `platform` continuam sendo interpretadas como:

- `platform = whatsapp`;
- `channel = whatsapp`;
- `event_type = whatsapp_audio_transcribed`;
- `metadata.source = whatsapp_companion`;
- prompt de transcrição legado do WhatsApp;
- cache por fingerprint no evento legado.

Assim o fluxo atual do WhatsApp não precisa ser migrado junto com a entrada do ManyChat.

## Semântica do ManyChat

Chamadas com:

- `platform = manychat`;
- `channel` namespaced, por exemplo `whatsapp`, `instagram`, `messenger` ou `unknown`;
- `audio_target_key` começando por `manychat:`;

passam a usar:

- `event_type = companion_audio_transcribed`;
- `metadata.source = manychat_companion`;
- `metadata.platform = manychat`;
- `metadata.channel = <channel>`;
- prompt de transcrição identificado como conversa capturada via ManyChat;
- cache por fingerprint também escopado por `metadata.platform = manychat`.

Isso impede que o histórico do ManyChat seja gravado como se tivesse sido originado diretamente no WhatsApp.

## Leitura do histórico

`/api/companion/audio-transcriptions` passa a ler os dois eventos:

- `whatsapp_audio_transcribed`;
- `companion_audio_transcribed`.

Cada transcrição retornada inclui `platform` e `channel`. Eventos legados sem esses metadados recebem fallback seguro para `whatsapp/whatsapp`.

A deduplicação passa a usar a combinação de plataforma e `audio_target_key`, reduzindo risco de colisão entre integrações diferentes.

## Contrato ManyChat

`manychat-audio-transcription-contract.js` passa a preparar o payload com:

- `platform = manychat`;
- `channel` validado;
- `audio_target_key` namespaced;
- MIME canônico do arquivo real;
- base64 cujo tamanho e SHA-256 já foram vinculados ao probe autenticado.

O `dispatch_enabled` continua `false` neste gate. O motivo deixou de ser a persistência do backend: agora o bloqueio restante está no runtime da extensão, porque o ManyChat ainda não está carregado pelo manifest e o fetch/dispatch real continua desligado.

## Segurança e causalidade preservadas

- automação do ManyChat continua bloqueada como mensagem humana;
- nenhuma identidade é derivada de posição DOM ou hash de texto;
- desaparecimento do DOM continua NÃO significando exclusão;
- mensagem de áudio conserva o `data-mid` namespaced como identidade;
- o endpoint continua validando empresa, usuário e ownership do ciclo antes de transcrever/persistir;
- o cache de ManyChat não atravessa plataformas.

## Testes adicionados

Foram adicionados testes específicos para:

- compatibilidade de payload legado sem `platform`;
- gravação ManyChat com evento universal;
- isolamento do cache por plataforma;
- rejeição de plataforma inválida;
- exigência do namespace `manychat:` no target key;
- leitura conjunta de transcrições legadas e universais;
- deduplicação por plataforma;
- propagação de `platform/channel` pelo contrato de áudio do ManyChat.

## Próximo gate

O backend deixa de ser o bloqueio principal. O próximo gate é o runtime real da extensão: obter os bytes do áudio ManyChat de forma controlada, montar o payload já validado e fazer o primeiro dispatch autenticado sem ainda liberar captura geral ou reasoning.
