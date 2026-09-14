# Yolen Companion Universal — Fase 6

## Probe seguro de evidência estrutural do ManyChat

Data de referência: 2026-09-14

## Objetivo

Criar a ferramenta necessária para obter evidência real da interface autenticada do ManyChat sem inventar seletores, sem ler o conteúdo comercial da conversa e sem ativar captura, persistência ou Reasoning.

A Fase 5 encerrou com um `ManyChatDomReader` configurável, mas corretamente sem seletores de produção. A próxima etapa exige descobrir, em uma sessão autenticada real, quais atributos e estruturas da interface são estáveis o suficiente para formar o primeiro profile de produção.

Esta fase cria esse instrumento de observação.

## Implementado

Novo módulo:

```text
app/extension/yolen-companion/src/manychat-evidence-probe.js
```

O módulo recebe o DOM de uma conversa ManyChat suportada e coleta apenas evidência estrutural de elementos candidatos.

Ele não contém seletores específicos do ManyChat.

O fluxo fica:

```text
ManyChat autenticado
    ↓
ManyChatEvidenceProbe
    ↓
evidência estrutural redigida
    ↓
profile comprovado
    ↓
ManyChatDomReader
    ↓
ManyChatAdapter
```

## O que o probe observa

Para elementos com sinais estruturais potencialmente úteis, o probe pode registrar:

```text
tag
role
aria-label
data-testid
data-test
data-test-id
data-cy
data-qa
contenteditable
placeholder
type
name
class
id
```

Também registra uma cadeia curta de ancestrais, sem `textContent`.

Esses dados servem somente para identificar candidatos de seletor e compreender a estrutura do Inbox.

## O que o probe deliberadamente NÃO coleta

O snapshot declara explicitamente:

```text
text_content_collected = false
input_values_collected = false
network_sent = false
persisted = false
```

O probe nunca lê:

```text
node.textContent
input.value
textarea.value
```

Também não realiza `fetch`, chamadas ao backend, gravação no Supabase ou escrita em storage.

## Redação defensiva

Valores de atributos podem conter dados operacionais ou identificadores. Antes de entrar no snapshot, o probe aplica redação para:

- e-mails;
- números com aparência de telefone;
- sequências numéricas longas;
- valores excessivamente grandes.

A finalidade não é anonimização jurídica completa. A finalidade é reduzir a chance de um snapshot técnico carregar conteúdo pessoal desnecessário.

## Fail-closed por superfície

O probe só varre o DOM quando `manychat-surface.js` confirma que a URL atual representa uma conversa suportada.

Exemplo suportado:

```text
https://app.manychat.com/fb871594/chat/1443150072
```

Uma rota como:

```text
https://app.manychat.com/fb871594/dashboard
```

retorna:

```text
supported = false
reason = unsupported_route
candidates = []
```

Nesse caso o DOM nem sequer é percorrido.

## Limite operacional

O probe limita o número máximo de candidatos a 400 e permite limite inferior por configuração.

Isso evita que uma interface muito grande produza snapshots descontrolados.

## Segurança arquitetural

A Fase 6 NÃO altera:

- `manifest.json`;
- permissões da extensão;
- runtime do WhatsApp;
- `manychat-adapter.js`;
- `manychat-dom-reader.js`;
- Supabase;
- Vercel;
- APIs do Companion;
- Commercial Brain;
- Commercial Reasoning;
- composer do ManyChat.

O probe ainda não é injetado automaticamente no ManyChat.

Isso é intencional: ampliar permissões antes de conhecer o DOM real faria a extensão executar código numa nova superfície sem necessidade operacional comprovada.

## Testes

Novo arquivo:

```text
app/extension/yolen-companion/tests/manychat-evidence-probe.test.mjs
```

Cobertura:

- captura de atributos estruturais sem `textContent`;
- proibição de coletar valor de `input`/`textarea`;
- redação de e-mail, telefone e IDs numéricos longos;
- fail-closed fora de rota de conversa;
- limite de candidatos;
- filtragem de elementos sem sinal semântico;
- serialização JSON do snapshot;
- preservação da identidade canônica criada pela Fase 3.

## Decisão de produto e engenharia

Não será criado um `ManyChatProfile` de produção a partir de screenshots, documentação genérica ou inferência visual.

O profile só será promovido quando houver evidência da interface autenticada real.

Essa decisão protege o Companion contra dois problemas:

1. selecionar elementos errados e misturar contexto de conversas;
2. depender de seletores frágeis inventados antes de observar a aplicação real.

## Próximo gate técnico

A próxima fase deverá executar este probe contra uma sessão autenticada do ManyChat, comparar evidência em múltiplas conversas e estados e então definir o primeiro `ManyChatDomProfile` real.

O profile só poderá ser aceito se os mesmos sinais permanecerem coerentes em cenários como:

```text
A → B
B → A
assigned → unassigned
conversa com bot
conversa assumida por vendedor
scroll
remount
histórico curto
histórico longo
```

Somente depois disso o `manifest.json` deverá receber a permissão do ManyChat e o caminho read-only poderá ser injetado automaticamente.

## Gate de encerramento

Fase 6: **PASS**.

Existe agora uma ferramenta específica para transformar a interface autenticada do ManyChat em evidência técnica redigida, sem transformar DOM em verdade comercial e sem ampliar a superfície de execução da extensão antes da hora.
