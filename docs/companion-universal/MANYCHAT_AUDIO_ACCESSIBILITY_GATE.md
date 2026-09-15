# ManyChat — Gate de acessibilidade real do áudio

Estado: acesso externo controlado ao arquivo de áudio validado.

Este gate NÃO ativa captura produtiva, persistência, reasoning, composer ou transcrição automática.

## Evidência autenticada

Foi testada uma URL HTTPS real de áudio extraída do ManyChat fora do elemento `<audio>` do navegador.

Resultado do probe controlado:

- `http_code = 206`;
- `content_type = audio/ogg`;
- `bytes_downloaded = 59817`;
- `detected_mime = audio/ogg`;
- `accept_ranges = bytes`;
- SHA-256 válido presente.

Conclusão: o arquivo pôde ser obtido diretamente por HTTP fora do player do ManyChat, com bytes reais e MIME de áudio válido.

## Divergência de MIME observada

O DOM havia informado `audio/mpeg` no elemento `<source>`, mas o transporte HTTP e a detecção do arquivo retornaram `audio/ogg`.

Portanto:

- o MIME do DOM passa a ser tratado apenas como `source_mime_hint`;
- o MIME canônico para processamento deve vir do arquivo obtido/detectado;
- divergência entre hint DOM e MIME real NÃO deve invalidar um áudio quando transporte e detecção confirmam um `audio/*` válido.

Isso evita classificar incorretamente arquivos `.ogg` como MPEG apenas porque o markup do ManyChat forneceu um hint impreciso.

## Implementação

Arquivo:

`app/extension/yolen-companion/src/manychat-audio-accessibility.js`

O módulo avalia metadados de um probe controlado e só retorna `ready = true` quando:

- HTTP é `200` ou `206`;
- `content_type` é `audio/*`;
- MIME detectado é `audio/*`;
- há bytes baixados;
- existe SHA-256 válido.

O `canonical_mime` é o MIME detectado do arquivo, não o hint do DOM.

## Restrições preservadas

Mesmo com a acessibilidade comprovada:

- `production_network_fetch_enabled = false`;
- `transcription_enabled = false`;
- `persistence_enabled = false`;
- `capture_enabled = false`;
- `reasoning_enabled = false`.

O módulo não recebe nem expõe a URL bruta do arquivo.

## Próximo gate

O próximo passo é integrar, ainda em modo controlado, a obtenção do áudio com o pipeline de transcrição existente da Yolen e validar que o texto transcrito entra no contrato normalizado sem alterar identidade, autoria ou causalidade da mensagem.
