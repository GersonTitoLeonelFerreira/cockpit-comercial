# ManyChat — Gate semântico de autoria

Estado: evidência autenticada suficiente para formalizar classificação estrutural de autoria em modo diagnóstico/read-only.

Este gate NÃO cria uma nova fase do roadmap. Ele é parte da validação real necessária antes de qualquer ativação produtiva do ManyChat.

## Objetivo

Impedir que mensagens automáticas do ManyChat sejam interpretadas como fala do cliente ou como ação humana do vendedor.

A classificação é estrutural e fail-closed:

- `incoming` -> `customer`;
- `outgoing` + sinal estrutural de bot -> `automation`;
- `outgoing` sem sinal estrutural de bot -> `human_agent`;
- evidência ausente ou conflitante -> `unknown`.

`automation` nunca é elegível como evidência de fala do cliente nem como ação humana do vendedor. `unknown` também não é elegível para reasoning.

## Evidência autenticada observada

Foram avaliadas duas conversas reais distintas no Inbox autenticado do ManyChat, sem leitura do texto das mensagens e sem persistência/rede pela ferramenta diagnóstica.

Conversa A:

- total: 21;
- `customer`: 4;
- `human_agent`: 5;
- `automation`: 12;
- `unknown`: 0.

Conversa B:

- total: 20;
- `customer`: 6;
- `human_agent`: 12;
- `automation`: 2;
- `unknown`: 0.

Resultado do gate:

- 41 mensagens estruturais observadas;
- 0 classificações ambíguas;
- separação cliente / humano / automação reproduzida em mais de uma conversa.

## Implementação

Arquivo:

`app/extension/yolen-companion/src/manychat-message-semantics.js`

O módulo:

- não lê `textContent`;
- não lê valores de input;
- não envia dados;
- não persiste dados;
- não é carregado pelo manifest;
- não habilita captura;
- não habilita persistence;
- não habilita reasoning;
- não habilita composer.

A classificação usa somente sinais estruturais já observados no DOM autenticado, com fallback para `unknown` diante de conflito ou insuficiência.

## Próximo gate

A próxima validação deve provar a extração semântica de uma mensagem real completa — identidade estável da mensagem, direção/autoria, timestamp e conteúdo — preservando autoria de automação e sem ativar manifest, persistência ou Commercial Brain.
