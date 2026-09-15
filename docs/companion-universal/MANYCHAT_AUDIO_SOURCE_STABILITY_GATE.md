# ManyChat — Gate de estabilidade da fonte de áudio

Estado: estabilidade da identidade e da fonte HTTPS de áudio validada após remount real do DOM.

Este gate NÃO ativa download, transcrição, captura, persistência, reasoning, composer ou manifest para ManyChat.

## Evidência autenticada

Foi observado um áudio real de cliente com:

- `data-mid` validado;
- fonte HTTPS única;
- MIME `audio/mpeg`;
- duração finita de `25.24s`;
- URL sem query string no cenário observado.

Baseline seguro:

- `midHash: 776fe891`;
- `protocol: https:`;
- `hostHash: c19a8742`;
- `pathnameHash: f90f9a14`;
- `queryKeys: []`;
- `fullHash: dee52aea`;
- comprimento da fonte: `101`;
- MIME `audio/mpeg`;
- duração `25.24`.

A conversa foi desmontada ao navegar para outra thread e, em seguida, renderizada novamente ao retornar.

Resultado autenticado:

- `found: true`;
- `sameMessage: true`;
- `sameSource: true`;
- `sameHost: true`;
- `samePath: true`;
- `sameQueryShape: true`;
- `sameMime: true`;
- `sameDuration: true`.

Conclusão: neste cenário autenticado, a mensagem manteve a mesma identidade nativa e a mesma fonte de áudio após remount real do ManyChat.

## Implementação

Arquivo:

`app/extension/yolen-companion/src/manychat-audio-source-stability.js`

O módulo cria snapshots diagnósticos seguros e compara baseline x remount usando apenas fingerprints e metadados estruturais.

Nenhum snapshot expõe:

- `data-mid` bruto;
- URL bruta do áudio;
- conteúdo da mensagem.

A comparação só retorna `stable = true` quando permanecem iguais:

- identidade da mensagem;
- fonte completa;
- host;
- pathname;
- formato de query;
- MIME;
- duração.

Qualquer divergência falha fechado.

## Restrições preservadas

Mesmo com a estabilidade comprovada:

- `network_fetch_allowed = false`;
- `transcription_enabled = false`;
- `persistence_enabled = false`;
- `capture_enabled = false`.

A URL nunca é usada como `message_key`; a identidade da mensagem continua sendo o `data-mid` validado.

## Próximo gate

O próximo passo é testar a acessibilidade real do arquivo de áudio para transcrição de maneira controlada, sem ainda habilitar captura produtiva. Esse teste precisa provar se a fonte HTTPS pode ser obtida fora do elemento `<audio>` com resposta válida e tipo de conteúdo compatível antes de qualquer integração com o pipeline de transcrição.
