# ManyChat — resultado live do gate de identidade interna MAIN world

Estado: PASS live de existência de identidade interna estável. Nenhuma associação automática com lead/ciclo é habilitada por este gate.

## Evidência executada

Validação autenticada real em `app.manychat.com`, com extensão Firefox carregada a partir do pacote gerado da branch `chatgpt/manychat-mainworld-identity-evidence-gate`.

O fluxo A → B → A foi concluído no mesmo workspace:

1. captura da conversa A;
2. troca para conversa B distinta;
3. retorno para conversa A;
4. avaliação do estado React no MAIN world.

Resultado seller-facing observado:

`Yolen · identidade interna PASS · relatório copiado`

## Evidência local de regressão

A execução local que precedeu o teste live terminou com:

- 9 testes executados;
- 9 testes aprovados;
- 0 falhas;
- pacote Chrome dev gerado;
- pacote Chrome prod gerado;
- pacote Firefox dev gerado;
- pacote Firefox prod gerado.

O pacote Firefox contém tanto `manychat-mainworld-identity-probe.js` quanto `manychat-mainworld-probe-bootstrap.js`.

## O que este PASS prova

Este PASS prova apenas que existe ao menos um locator interno no estado React que:

- está presente em A;
- muda em B;
- retorna ao mesmo valor ao voltar para A.

Isso é evidência suficiente para afirmar que o ManyChat expõe uma identidade interna estável relacionada à conversa/contato no estado da aplicação.

## O que este PASS ainda não prova

O gate não autoriza promover nenhum locator para identidade de contato produtiva sem capturar e revisar o relatório seguro que contém apenas os nomes dos locators aprovados.

Portanto continuam desligados:

- resolução automática de lead por esse locator;
- associação automática com `cycle_id`;
- persistência geral de mensagens ManyChat;
- reasoning produtivo ManyChat;
- composer/escrita no ManyChat.

## Próximo gate

O próximo passo é capturar os `proven_locators` do relatório seguro e validar sua semântica. Somente depois disso um locator poderá ser convertido em chave determinística e namespaced para integração com a Yolen.

Nenhum fallback por nome, texto da conversa, posição no DOM ou heurística visual é permitido.
