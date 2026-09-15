# ManyChat — Gate de evidência de contexto da conversa

Estado: diagnóstico seguro preparado. Nenhuma associação automática com lead/ciclo é habilitada por este gate.

## Objetivo

Depois de validar que a rota `/workspace/chat/conversation` identifica a conversa de forma estável A → B → A, o próximo risco é promover essa identidade de conversa para identidade de contato sem evidência suficiente.

Este gate procura evidência independente e estruturada para dois pontos:

1. canal real da conversa (`whatsapp`, `instagram`, `messenger` ou `telegram`);
2. identificador estruturado do contato, como atributo explícito de contato/subscriber/user ou link de telefone/WhatsApp.

O gate não usa nome visível, texto de mensagem, posição na lista, índice do DOM ou conteúdo livre para resolver contato.

## Probe autenticado

O runtime adiciona um probe somente quando a URL contém:

`#yolen-context-probe`

O botão executa um ciclo A → B → A dentro do mesmo workspace:

1. captura o contexto da conversa A;
2. exige uma conversa B diferente;
3. exige retorno para A;
4. compara internamente, sem expor valores brutos, os candidatos estruturados observados nos escopos ancestrais do `chat-messages-list`.

## Fontes estruturadas permitidas

A busca de identidade de contato é restrita a:

- `data-contact-id`;
- `data-subscriber-id`;
- `data-user-id`;
- `data-client-id`;
- `data-customer-id`;
- `data-phone`;
- `data-phone-number`;
- `data-mobile`;
- `data-whatsapp-id`;
- links `tel:`;
- links `wa.me`;
- links `api.whatsapp.com/send?phone=...`.

A ausência dessas fontes não autoriza fallback por nome, mensagem ou heurística visual.

## Canal

O probe reconhece apenas os enums conhecidos:

- `whatsapp`;
- `instagram`;
- `messenger`;
- `telegram`.

Texto livre dentro da área de mensagens é excluído da detecção para impedir que uma mensagem contendo a palavra “WhatsApp” seja confundida com o canal da conversa.

## Privacidade

O relatório seguro nunca expõe:

- valor de telefone;
- contact/subscriber/user id bruto;
- token da rota;
- conversation key bruta;
- texto de mensagem;
- hash de identificadores pessoais.

O probe compara valores brutos somente em memória durante a sessão autenticada e publica apenas:

- contagens;
- nomes das fontes estruturadas;
- profundidade do escopo;
- canal enumerado;
- booleans de mudança/retorno A → B → A.

Também permanece:

- `persisted = false`;
- `network_sent = false`.

## Critério de PASS

Identidade estruturada de contato só é considerada provada quando, no mesmo nível de escopo:

1. existe ao menos um candidato estruturado em A;
2. a assinatura interna muda ao abrir B;
3. a assinatura retorna exatamente ao voltar para A;
4. o workspace permanece o mesmo;
5. a rota confirma conversa distinta em B e retorno a A.

Canal pode ser considerado evidência separada quando existe exatamente um enum estável no mesmo ciclo.

## Limites

Mesmo com `structured_contact_identity_ready = true`, este gate ainda não resolve lead/ciclo nem persiste mensagens.

O passo seguinte só pode integrar resolução automática se a fonte estruturada observada tiver semântica comprovada e puder ser convertida com segurança para uma chave aceita pelo backend Yolen.
