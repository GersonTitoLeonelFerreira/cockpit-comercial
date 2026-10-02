# ManyChat — Gate de conteúdo real da mensagem

Estado: conteúdo textual e áudio foram estruturalmente diferenciados em ambiente autenticado real, ainda em modo diagnóstico/read-only.

Este gate NÃO ativa o ManyChat em produção. Manifest, captura, persistência, reasoning, composer e network write continuam desligados.

## Evidência autenticada

Conversa real observada no Inbox do ManyChat:

- 20 mensagens estruturais visíveis;
- 18 mensagens humanas/cliente com exatamente um `data-mid` já validado;
- 17/18 mensagens humanas/cliente com conteúdo textual;
- nas 17 mensagens textuais, `textContent` do nó `[data-mid]` foi exatamente igual ao conteúdo textual do wrapper;
- 1/18 mensagem humana/cliente sem texto;
- essa mensagem sem texto continha exatamente um elemento `<audio>` dentro do nó `[data-mid]`;
- nenhum avatar estava dentro do nó `[data-mid]` nas amostras textuais;
- 2 mensagens `automation`, ambas sem `data-mid`, permaneceram fora do caminho elegível;
- 0 mensagens com autoria `unknown`.

## Regra de extração

Para `customer` e `human_agent` com identidade nativa validada:

- o conteúdo é lido somente do único nó descendente `[data-mid]`;
- `textContent` não é lido indiscriminadamente do wrapper como contrato produtivo;
- texto não vazio, sem mídia visual/áudio, vira `content_type = text`;
- exatamente um `<audio>`, sem texto, vira `content_type = audio`;
- áudio não gera transcrição inventada;
- imagem, vídeo, canvas, múltiplos áudios ou conteúdo misto falham fechado até validação específica.

## Automação

Mensagens `automation` continuam separadas:

- não usam fallback de conteúdo humano;
- não ficam `content_ready` neste gate;
- não alimentam reasoning;
- permanecem contexto de automação até existir contrato próprio.

## Implementação

Arquivo:

`app/extension/yolen-companion/src/manychat-message-content.js`

O módulo expõe:

- `extractManyChatMessageContent(node)`;
- `safeManyChatMessageContentView(value)`;
- `summarizeManyChatMessageContent(nodes)`.

O safe view não expõe texto bruto. Ele usa somente presença, comprimento e fingerprint diagnóstico.

O bundle autenticado de diagnóstico passa a carregar, na ordem:

1. semântica de autoria;
2. identidade nativa;
3. conteúdo da mensagem.

## Resultado atual

A conversa autenticada observada corresponde ao seguinte perfil estrutural:

- 17 mensagens `text` elegíveis;
- 1 mensagem `audio` estruturalmente reconhecida;
- 2 mensagens `automation` bloqueadas do caminho humano;
- 0 autoria desconhecida.

## Próximo gate

O próximo passo é validar os tipos ainda não cobertos — principalmente imagem/attachment e comportamento do áudio para obtenção segura de fonte/transcrição — antes de transformar o extrator diagnóstico em `readMessage` do DOM reader e antes de qualquer ativação de captura/persistência.

## Rodada 6 (HML, pacote homolog-manychat): fidelidade da bolha

O que a captura do HML mostrou no ledger: respostas do cliente com citação
chegavam com a citação colada (`Bot` + texto do bot + escolha; nome da
página + texto do vendedor + resposta), e nenhuma mensagem do bot era
gravada (o leitor descartava toda automação, `automation_content_context_only`
— inclusive a primeira, de boas-vindas).

Mudança (só leitura do DOM; o contrato de captura não muda):

- Mensagem do bot (`_typeOut_` + `_botMessage_`): vira `outgoing` com
  `author_kind = automation`. Sem `data-mid`, a chave é
  `manychat:auto:<fnv1a(minuto | começo do texto)>`, com `:2`, `:3` para
  textos iguais no mesmo minuto. Botões ficam fora do texto e entram como
  `[opções: A · B]`; "Ver mais" nunca é opção. Texto cortado pelo layout:
  inteiro quando está no DOM (`title`/`aria-label`), senão marcado com
  `[texto cortado no ManyChat]`.
- Resposta com citação (cliente ou vendedor): só a resposta vira o texto.
  A citação sai pela estrutura (`blockquote`, classes/`data-test-id` com
  `quote`/`reply`/`context`) ou, sem estrutura, pela mensagem citada que
  está na tela (rótulo curto + texto dela, inteiro ou cortado com "…").
- Botão tocado pelo cliente: `[escolheu no menu] X` quando a citação é de
  uma mensagem do bot e X é uma das opções dela (ou, sem as opções na tela,
  uma resposta curta).
- Sem citação nem botão na bolha, o texto continua exatamente o
  `textContent` de antes.

As classes de citação e de botão não foram validadas ao vivo; o caminho
pelo texto da mensagem citada cobre a falta delas. A evidência de
diagnóstico (`extractManyChatMessageContent`, resumos e safe views)
continua tratando automação como contexto.
