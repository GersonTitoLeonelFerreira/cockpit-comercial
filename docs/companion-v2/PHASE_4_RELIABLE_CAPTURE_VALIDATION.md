# Validação funcional da Fase 4 — captura confiável

## Estado da entrega

| Campo | Estado |
|---|---|
| Fase do produto | Fase 4 — Captura completa, demonstrável e confiável |
| Branch | `feature/companion-v2-phase-4-reliable-capture` |
| Commit validado | `a190fb5` |
| Data da validação | 2026-08-03 |
| Motor ativo | `v1` |
| Integração na `main` | Pendente de pull request e aprovação explícita |
| Deployment da branch | Não realizado |
| Migration de ingestão | Aplicada no Supabase |
| Teste real no Firefox | Captura inicial, texto, chave, direção e idempotência validados |

## Objetivo funcional

A Fase 4 cria um fluxo confiável entre o WhatsApp Web e o ledger relacional
da Yolen.

O fluxo validado é:

```text
WhatsApp Web
→ content script
→ lote canônico
→ background da extensão
→ rota autenticada da Yolen
→ RPC transacional
→ conversation_messages
→ conversation_capture_state
```

Essa entrega não ativa o motor de diagnóstico V2 e não autoriza alterações
automáticas no CRM.

## Entregas implementadas

### Identidade da conversa

A ingestão utiliza uma chave estável derivada do telefone normalizado:

```text
phone:<telefone-normalizado>
```

A URL temporária do avatar do WhatsApp não é utilizada como identidade
persistida.

Quando o telefone ainda não está disponível, existe fallback controlado pelo
título normalizado. A ingestão comercial só é liberada depois que o ciclo e a
conversa são resolvidos.

### Identidade do dispositivo

Cada instalação da extensão possui um `device_key` UUID aleatório e
pseudônimo.

O identificador:

- não usa fingerprint de hardware;
- não usa endereço IP;
- não usa dados ocultos do equipamento;
- permanece isolado por empresa, conversa e instalação.

### Captura das mensagens

O corpo real da mensagem é lido pelo seletor atual do WhatsApp:

```text
[data-testid="selectable-text"]
```

A captura não usa o `textContent` integral do balão para mensagens ativas.

Isso impede a persistência indevida de:

- horário anexado ao final do texto;
- nome do contato;
- conteúdo de mensagem citada;
- rótulos auxiliares da interface;
- conteúdo agregado de outro balão.

Quebras de linha internas legítimas são preservadas.

### Direção das mensagens

A extensão preserva os marcadores antigos quando disponíveis:

```text
.message-out
.message-in
true_ no data-id
false_ no data-id
```

Na estrutura atual do WhatsApp, a direção é determinada pelo posicionamento do
contêiner:

```text
[data-testid="msg-container"]
```

Regra validada:

```text
lado esquerdo → incoming
lado direito → outgoing
```

### Versionamento

O ledger é append-only.

Uma alteração real de estado gera uma nova versão para a mesma
`message_key`.

Estados reconhecidos:

- mensagem nova;
- mensagem inalterada;
- mensagem editada;
- mensagem excluída;
- mensagem restaurada;
- transcrição adicionada a áudio.

Uma fotografia idêntica não cria nova versão.

### Cursor observado

A RPC avança o `last_observed_message_id` somente depois que as versões foram
persistidas no ledger.

O estado é mantido por:

```text
empresa + conversa + dispositivo
```

O cursor `last_processed_message_id` continua nulo nesta fase. Ele pertence ao
consumidor do motor de diagnóstico da Fase 5.

## Segurança

A rota de ingestão:

- exige token Bearer válido do Companion;
- valida assinatura e expiração;
- valida empresa, usuário e papel;
- limita o lote a duzentas mensagens;
- rejeita chaves duplicadas dentro do mesmo lote;
- rejeita formatos incompatíveis com o contrato;
- chama a RPC usando o backend;
- não concede acesso direto do cliente às tabelas.

A RPC:

- valida associação ativa do usuário;
- valida que o ciclo pertence à empresa;
- usa lock transacional por empresa e conversa;
- cria somente novas versões;
- avança o cursor observado atomicamente;
- permite execução somente ao `service_role`;
- bloqueia `anon` e `authenticated`;
- executa com `search_path` vazio e `row_security=off`.

## Validação automatizada final

Executado na branch:

```text
npm run test:companion
82 testes aprovados

npm run test:companion-ingestion-rpc
1 teste aprovado

npm run test:companion-ledger
1 teste aprovado

npm run test:companion-capture-state
1 teste aprovado

npm run test:schema-baseline
1 teste aprovado

npx tsc --noEmit
aprovado

npm run build
110 de 110 páginas geradas
```

Também foram aprovados:

```text
node --check
ESLint
git diff --check
working tree limpo
branch sincronizada com o remoto
```

## Validação real no Firefox

O teste controlado utilizou:

```text
Firefox
WhatsApp Web
extensão temporária
servidor Next.js local
Supabase do projeto
```

### Transporte

A chamada real chegou à aplicação:

```text
OPTIONS /api/companion/capture/messages 204
POST /api/companion/capture/messages 200
```

### Chave e texto

Foram confirmados:

```text
conversation_key baseada em phone:
nenhum horário anexado ao texto
nenhum estado idêntico duplicado
quebras de linha legítimas preservadas
```

### Direção

Na fotografia validada:

```text
15 mensagens atuais
4 incoming
11 outgoing
11 mensagens receberam versão 2 após a correção de direção
0 estados idênticos duplicados
```

As mensagens à esquerda permaneceram `incoming`. As mensagens à direita
receberam nova versão como `outgoing`.

### Cursores

O cursor observado avançou depois da persistência.

Instalações temporárias diferentes do Firefox mantiveram `device_key`
independentes sem duplicar as mensagens do ledger.

## Pendência operacional

O teste real abaixo não foi executado porque não era possível enviar mensagens
no momento da validação:

```text
criar mensagem
→ editar a mesma mensagem
→ apagar para todos
```

O comportamento permanece coberto por testes automatizados:

- edição altera a chave de estado;
- exclusão remove conteúdo;
- edição ou exclusão força reprocessamento do dia atual;
- mensagem restaurada prevalece sobre a fotografia excluída;
- ledger cria versões imutáveis;
- RPC não cria versão para estado idêntico.

Essa pendência deve permanecer declarada no pull request. Ela não deve ser
descrita como teste real aprovado.

## Limites da Fase 4

Esta fase não:

- ativa `COMPANION_ENGINE_VERSION=v2`;
- executa o diagnóstico comercial V2;
- avança o cursor processado;
- decide etapa do CRM;
- agenda próxima ação;
- registra ganho ou perda;
- aplica mudança sem confirmação humana;
- envia mensagens automaticamente;
- realiza rollout para empresas clientes.

## Resultado

A implementação da captura confiável está tecnicamente pronta para pull
request.

O merge depende de:

1. documentação integrada à branch;
2. revisão do diff completo;
3. checks do pull request;
4. aprovação explícita do usuário;
5. validação do deployment após a integração.

A pendência do teste real de edição e exclusão permanece registrada para
execução posterior.
