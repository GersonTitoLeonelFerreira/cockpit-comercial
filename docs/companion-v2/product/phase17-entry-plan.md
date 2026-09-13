# YOLEN Companion — FASE 17

## MENSAGEM / MIE seller-facing

Estado de abertura: 2026-09-13

Base de entrada: `main` após merge do PR #294 (FASE 16.9).

## 1. Objetivo da fase

Transformar a aba **MENSAGEM** em consequência direta do mesmo Commercial Brain + Commercial Reasoning Engine que alimenta AGORA, ANÁLISE e CLIENTE.

A FASE 17 não cria um segundo cérebro comercial. O Message Intelligence Engine (MIE) passa a executar a comunicação da decisão já tomada, com qualidade de linguagem, naturalidade, factualidade e adequação ao contexto.

## 2. Contrato de produto

- Commercial Reading continua sendo a leitura canônica da venda.
- Commercial Reasoning continua sendo a autoridade sobre decisão, técnica, limites e próximo movimento.
- Communication Context define o que pode e não pode ser comunicado naquele momento.
- MIE redige, compara candidatos, aplica hard gates e critic; não reconstrói a venda em paralelo.
- `silence` / `no_intervention` continua sendo uma saída válida.
- Sem auto-send.
- Sem escrita automática em CRM.
- Sem escrita automática em Agenda.
- Rollout por allowlist de empresa e reversível.

## 3. Auditoria do estado atual

### 3.1 Runtime seller-facing atual

`app/api/companion/method-guidance/route.ts` hoje mantém o MIE fora do caminho seller-facing por decisão explícita da FASE 16.9.

O caminho ativo atual é:

`Canonical Seller Context -> Canonical Seller Reasoning -> composeSellerMessage`

O MIE continua em shadow/telemetria.

### 3.2 MIE existente

O MIE V1 já possui:

- context assembler;
- estratégia comercial;
- message planner;
- candidate generator;
- hard gates;
- commercial/naturalness critic;
- final selector;
- shadow evaluation;
- telemetria;
- activation module por allowlist.

### 3.3 Gap que impede ativação segura

`message-intelligence-runner.ts` ainda consegue construir seu próprio reasoning a partir das fontes do source loader. Esse caminho não é idêntico ao `loadCanonicalSellerReasoning()` seller-facing, que também reconcilia responsabilidade operacional e usa a fotografia canônica consolidada.

Além disso, o MIE não recebe hoje o `CommunicationContext` canônico como contrato obrigatório de execução.

Portanto, simplesmente religar `message-intelligence-seller-activation.ts` seria reintroduzir o risco de duas autoridades comerciais.

## 4. Ordem de execução

### FASE 17.1 — Canonical Handoff

Criar um contrato explícito de entrada seller-facing para o MIE contendo, no mínimo:

- contexto comercial canônico da oportunidade;
- Commercial Reasoning canônico já resolvido;
- Communication Context canônico;
- seller intent;
- reference time;
- company/cycle/conversation scope.

Regra: o MIE não pode recalcular decisão, técnica, silêncio ou responsabilidade operacional.

Saída esperada: o pipeline pode gerar mensagem usando a mesma decisão já visível em AGORA/ANÁLISE.

### FASE 17.2 — Generation + Critic

Recalibrar planner, candidate generator e critic para avaliar:

- naturalidade;
- especificidade;
- aderência ao objetivo comercial;
- continuidade da conversa;
- não repetição de ação já executada;
- factualidade;
- tom da empresa;
- tratamento de objeção;
- follow-up;
- clareza e concisão.

A mensagem deve soar como uma boa mensagem de vendedor, não como resposta de IA ou script genérico.

### FASE 17.3 — Seller-facing activation

Ativar somente quando:

- o handoff canônico estiver válido;
- `do_not_generate === false`;
- final selector retornar candidato seguro;
- hard gates estiverem verdes;
- critic aprovar;
- empresa estiver em allowlist explícita.

Fallback seguro: manter o gerador atual ou não sugerir mensagem; nunca inventar.

### FASE 17.4 — Gate

Validar casos comerciais completos, incluindo:

- pedido de informação já atendido;
- agendamento pendente;
- objeção real;
- cliente pedindo espaço;
- follow-up devido;
- terceiro/intermediário;
- preço/pagamento;
- conversa sem necessidade de intervenção.

Critério de sucesso: MENSAGEM executa a mesma decisão comercial das outras abas e melhora a comunicação sem criar uma nova decisão.

## 5. Invariantes

1. Uma venda = uma verdade comercial.
2. MENSAGEM nunca contradiz AGORA/ANÁLISE.
3. MIE nunca transforma silêncio em CTA.
4. Fato já realizado não vira sugestão repetida.
5. Regra, preço, disponibilidade, desconto ou promessa precisam de fonte válida.
6. Nenhum auto-send nesta fase.
7. Ativação global por `*` continua proibida.
8. O vendedor sempre mantém controle final sobre a mensagem enviada.

## 6. Primeiro trabalho técnico

Antes de qualquer ativação seller-facing:

1. mapear o contrato exato de `loadCanonicalSellerReasoning()`;
2. mapear `CommunicationContext` e Decision State que alimentam comunicação;
3. remover do caminho seller-facing do MIE qualquer decisão paralela;
4. adicionar testes que provem que reasoning/silêncio/técnica não são recalculados pelo MIE;
5. somente então ligar o pipeline de geração/critic à aba MENSAGEM.

Este documento é o checkpoint de entrada da FASE 17 e não autoriza auto-send nem ativação global.