# ManyChat — Gate de fonte de áudio

Estado: fonte estrutural de áudio validada em ambiente autenticado real, ainda em modo diagnóstico/read-only.

Este gate NÃO autoriza download, transcrição, persistência, captura produtiva nem ativação do ManyChat no manifest.

## Evidência autenticada

Foi observada uma mensagem real `customer` já coberta pelos gates anteriores de autoria, identidade e conteúdo.

Estrutura observada:

- exatamente um nó `[data-mid]` para a mensagem;
- exatamente um elemento `<audio>` dentro desse nó;
- o `<audio>` não possuía `src` direto;
- `audio.currentSrc` estava preenchido com uma URL HTTPS;
- existia exatamente um `<source>` filho com `src` HTTPS;
- `audio.currentSrc` e `source.src` apontavam para a mesma fonte estrutural;
- o `<source>` possuía um `type` de áudio;
- `readyState = 4`;
- `networkState = 1`;
- duração finita observada: `25.24` segundos.

A URL bruta não foi exposta no diagnóstico compartilhado. Somente tipo, comprimento e fingerprint foram observados.

## Regra de segurança

A fonte de áudio não é identidade de mensagem.

Portanto:

- `data-mid` continua sendo a identidade nativa da mensagem humana/cliente;
- a URL de mídia nunca substitui `message_key`;
- a URL pode ser temporária, assinada ou mudar entre renderizações;
- a URL não deve ser persistida como identidade;
- nenhuma requisição de rede é autorizada por este gate.

## Implementação

Arquivo:

`app/extension/yolen-companion/src/manychat-audio-source.js`

O módulo aceita somente mensagens já classificadas como `content_type = audio` pelo gate de conteúdo.

Para ficar `source_ready`:

- deve existir exatamente um `<audio>` no nó nativo `[data-mid]`;
- a fonte precisa resolver para exatamente uma URL HTTPS única;
- `currentSrc`, `audio.src` e `source.src` são deduplicados;
- fontes divergentes falham fechado como `audio_source_ambiguous`;
- fontes não HTTPS não ficam elegíveis;
- múltiplos MIME types falham fechado;
- o safe view não expõe URL bruta.

Mesmo quando `source_ready = true`, permanecem obrigatoriamente:

- `network_fetch_allowed = false`;
- `persistence_enabled = false`;
- `transcription_enabled = false`.

## Resultado atual

Temos evidência suficiente para afirmar que o ManyChat fornece uma fonte HTTPS reutilizável pelo elemento de áudio no cenário autenticado observado.

Isso NÃO prova ainda que a extensão pode buscar essa URL fora do contexto da página, nem que ela permanece válida por tempo suficiente para transcrição.

## Próximo gate

Antes de ativar transcrição, validar o caminho de obtenção do áudio sem quebrar autenticação/CORS e sem persistir URL sensível. Em paralelo, ainda precisam ser validados os tipos visuais/attachment que permanecem fail-closed no gate de conteúdo.
