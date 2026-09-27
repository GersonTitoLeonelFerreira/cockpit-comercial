# YOLEN Companion — Plano de canário ManyChat, monitoramento e rollback

Base da homologação: `30339cb6ae970cef1ca9b12bf29d83c15d163ed4`

Este documento fecha a preparação operacional da **Onda D — Homologação e rollout**.

## 1. O que o handoff exige

O handoff pós-reconstrução exige, antes de qualquer ativação ampla:

- uso exploratório real por Gerson e depois vendedores selecionados;
- checklist de tarefas reais;
- rollout ManyChat por canário;
- rollback simples;
- monitoramento de criação, análise, troca de conversa e composer;
- decisão de ativação ampla somente depois de aceite operacional explícito.

Este documento prepara essas condições. Ele **não autoriza rollout**.

## 2. Estado técnico que torna o canário reversível

O runtime normal continua fail-closed:

`app/extension/yolen-companion/src/manychat-feature-flags.js`

```js
const MANYCHAT_CAPTURE_ENABLED = false
```

O canal E2E usa uma fonte separada:

`app/extension/yolen-companion/src/manychat-feature-flags.e2e.js`

```js
const MANYCHAT_CAPTURE_ENABLED = true
const BUILD_CHANNEL = 'e2e'
```

O build E2E também é identificável no Firefox como:

`Yolen Companion [E2E] <commit>`

e usa um Gecko ID separado:

`yolen-companion-e2e@gerson.local`

Portanto, o canário inicial pode ocorrer **sem mudar o kill switch do pacote normal**.

## 3. Estratégia de canário proposta

> Esta sequência é uma proposta operacional; o handoff exige canário/rollback, mas não fixa quantidade de vendedores ou duração.

### C0 — Gerson

Status: **CONCLUÍDO**.

Já houve homologação real de:

- criação de lead;
- análise;
- latência;
- expand/collapse;
- A→B→A;
- MENSAGEM;
- empresa/usuário;
- logo WhatsApp/ManyChat.

### C1 — um vendedor selecionado

Usar somente o pacote E2E identificado pelo commit aprovado.

Preferência operacional:

- perfil Firefox dedicado ao canário; ou
- instalação normal desabilitada nesse perfil antes de carregar o E2E.

Motivo: o E2E tem ID próprio, mas também injeta o Companion no WhatsApp; não queremos duas extensões Yolen atuando na mesma página.

Durante o uso normal, observar obrigatoriamente:

1. identificação da conversa/lead;
2. criação de lead;
3. ANÁLISE;
4. troca A→B→A;
5. geração/cópia/inserção em MENSAGEM;
6. preservação de rascunho do host;
7. usuário/empresa/sessão;
8. expand/collapse.

Se não houver blocker, o canário pode avançar para C2.

### C2 — pequeno grupo de vendedores

Repetir o mesmo pacote E2E em um grupo pequeno e controlado.

Objetivo desta etapa:

- confirmar que o resultado de C1 não depende do perfil de um único usuário;
- observar uso real com diferentes volumes e estilos de atendimento;
- confirmar ausência de regressão no WhatsApp.

Nenhuma mudança no pacote normal nesta etapa.

### C3 — decisão de ativação de produção

Somente depois de C1/C2 aprovados e com autorização explícita de Gerson.

A ativação ampla exigirá uma decisão separada para mudar o runtime normal, hoje com:

`MANYCHAT_CAPTURE_ENABLED = false`

Nenhum commit desta homologação faz essa mudança.

## 4. Kill criteria — rollback imediato

Qualquer um dos eventos abaixo encerra o canário até diagnóstico:

- lead duplicado;
- criação que exige segundo clique de forma reproduzível;
- contexto de A aparecendo em B;
- resposta tardia de A aplicada depois de A→B→A;
- mensagem inserida na conversa errada;
- rascunho existente sobrescrito silenciosamente;
- qualquer envio automático;
- empresa ou usuário incorretos;
- captura atribuída à conversa/lead errado;
- shell/cabeçalho desaparecendo ou tornando ManyChat/WhatsApp inutilizável;
- análise ficando indefinidamente em loading sem estado recuperável;
- regressão crítica no WhatsApp causada pelo pacote canário.

Erros claros e recuperáveis de análise não são, sozinhos, rollback automático; devem ser registrados e avaliados.

## 5. Rollback do canário

### C1/C2 — rollback imediato

Como o ManyChat continua OFF no build normal:

1. remover/desabilitar o `Yolen Companion [E2E]` do perfil do vendedor;
2. reativar a instalação normal da Yolen, se ela tiver sido desabilitada;
3. atualizar WhatsApp/ManyChat;
4. confirmar que o painel E2E desapareceu.

No Firefox, um Temporary Add-on também deixa de existir após ser removido/reiniciar o navegador.

Este rollback:

- não exige migration;
- não exige alteração de banco;
- não exige alteração de backend;
- não exige flip de feature flag em produção.

### Futuro rollout amplo

Se futuramente o pacote normal for habilitado para ManyChat, o rollback mínimo continua sendo restaurar:

```js
const MANYCHAT_CAPTURE_ENABLED = false
```

e gerar/distribuir novo pacote normal.

Esse passo futuro só pode ser executado após autorização explícita.

## 6. Monitoramento durante o canário

O handoff exige monitorar criação, análise, troca de conversa e composer.

### 6.1 ANÁLISE

Fonte existente:

`public.companion_background_analysis_jobs`

Campos úteis já existentes:

- `status`: queued / running / succeeded / failed / superseded;
- `requested_at`;
- `started_at`;
- `completed_at`;
- `failure_code`;
- `failure_path`;
- `attempt_count`.

Usar para separar fila, processamento e total quando houver investigação.

### 6.2 Ações de MENSAGEM

Fonte existente:

`public.companion_action_events`

Tipos já suportados incluem:

- suggestion_shown;
- suggestion_copied;
- suggestion_inserted;
- suggestion_ignored;
- suggestion_edited;
- suggestion_sent.

A telemetria é idempotente por `(company_id, idempotency_key)` e não deve armazenar conteúdo da conversa.

### 6.3 Captura

Fonte canônica:

`conversation_messages` / pipeline `/api/companion/capture/messages`.

Usar apenas quando houver suspeita de:

- mensagem ausente;
- autoria errada;
- duplicidade;
- conversa errada;
- áudio não incorporado.

Não abrir investigação de ledger em cada interação normal.

### 6.4 Criação de lead

Durante C1/C2 registrar apenas:

- tentativa;
- um clique / mais de um;
- criado / erro claro;
- duplicidade sim/não.

Se houver duplicidade, rollback imediato.

### 6.5 Troca de conversa

Não existe necessidade de criar telemetria nova só para o canário.

A validação operacional é:

- identidade visual muda para o contato correto;
- AGORA/ANÁLISE/CLIENTE não carregam conteúdo do contato anterior;
- rascunho de MENSAGEM não vaza;
- resposta async stale não reaparece em B.

## 7. Checklist diário do vendedor canário

O vendedor não precisa produzir logs técnicos.

Ao final do período, responder somente:

- Criação em um clique: OK / falhou.
- Alguma duplicidade: não / sim.
- Análise concluiu ou mostrou erro claro: OK / falhou.
- Troca de contatos sem mistura: OK / falhou.
- MENSAGEM preservou rascunho: OK / falhou.
- Inserção foi para a conversa correta: OK / falhou.
- Houve envio automático: não / sim.
- WhatsApp continuou normal: sim / não.
- Algum comportamento impediu trabalhar: não / sim.

Se houver falha, registrar contato/horário aproximado e parar apenas a ação afetada; evidência técnica é coletada depois pela equipe de produto.

## 8. Critério para avançar

C1 → C2:

- nenhum kill criterion;
- vendedor consegue trabalhar normalmente;
- criação/análise/troca/composer sem blocker reproduzível.

C2 → decisão de produção:

- nenhum kill criterion recorrente;
- ausência de regressão no WhatsApp;
- Gerson aceita operacionalmente o canário;
- plano de rollback permanece testável;
- autorização explícita para alterar o build normal.

## 9. Estado atual

- Homologação Gerson: PASS.
- Plano de canário: DOCUMENTADO.
- Kill switch normal: OFF.
- Canary package: ainda NÃO distribuído a vendedores.
- C1/C2: ADIADOS por decisão operacional de Gerson.
- Evidência aceita nesta rodada: testes live realizados por Gerson.
- Rollout amplo: NÃO AUTORIZADO.
- Produção ManyChat: NÃO ALTERADA.
- Retomada futura: iniciar em C1, sem repetir os testes já aprovados salvo evidência de regressão.
