# YOLEN — Motor de Coaching Comercial

## FASE 5 — Message Strategy + MENSAGEM

Base: `main@68b2e579a9842841ffc4dca78b4660a6c8c4267d`.

Branch: `chatgpt/coaching-engine-phase-5-message-strategy`.

## 1. Missão

Transformar Commercial Reasoning + Coaching Diagnosis em um plano determinístico de mensagem antes da redação pelo modelo.

A redação continua sendo feita por `composeSellerMessage`.

O modelo não escolhe situação, técnica, conhecimento da empresa ou objetivo.

## 2. Novo contrato

`commercial-message-strategy-v1`:

- objective;
- relationship_bridge;
- context_reference;
- technique_id/title;
- desired_microcommitment;
- facts_allowed;
- facts_required_but_missing;
- prohibited_moves;
- tone;
- max_length;
- evidence/message provenance.

## 3. Mesmo snapshot

O caminho seller-facing passa a ser:

`loadCanonicalSellerCommercialContext`
→ `loadCanonicalSellerReasoningBundle`
→ `CommercialReasoning`
→ `CommercialCoachingDiagnosis`
→ `CommercialMessageStrategy`
→ `composeSellerMessage`.

Nenhum Message Intelligence Engine volta a ser autoridade ativa.

## 4. Especificidade

Quando existe intenção clara do cliente ou recuperação de quebra de sequência, `context_reference.required_in_draft=true`.

O critic determinístico exige que a mensagem preserve pelo menos uma âncora pertinente do contexto.

Isso formaliza o transplant test: mensagem que poderia ser enviada quase igual para qualquer lead falha quando deveria ser contextual.

## 5. Repetição

O critic também bloqueia mensagem praticamente idêntica a uma ação outgoing recente.

Isso transforma em gate determinístico a regra já existente no prompt de não repetir pergunta/confirmação/cobrança que o vendedor acabou de enviar.

## 6. Grounding

`facts_allowed` recebe somente conhecimento de empresa que o Commercial Reasoning selecionou.

O plano não despeja todo o Company Knowledge no gerador.

Quando o reasoning informa ausência de opções reais para guided choice, o strategy registra:

`facts_required_but_missing = ['multiple_valid_options']`

e acrescenta uma proibição explícita contra inventar horários, vagas ou alternativas.

## 7. Autonomia do vendedor

`seller_intent` continua descrevendo o que o vendedor quer comunicar.

Ele não é tratado como fala do cliente nem como prova de fatos anteriores.

Grounding, papéis, fatos protegidos e `prohibited_moves` permanecem limites duros.

## 8. Neutralidade vertical

O strategy não conhece academia como regra.

Fixtures incluem:

- demonstração de software;
- contratação de licença B2B;
- consultoria;
- visita;
- contexto genérico.

Termos de cada empresa entram pelo contexto publicado.

## 9. MENSAGEM

O prompt de geração e o gate customer-facing passam a receber `message_strategy`.

O modelo deve:

- executar o objetivo;
- manter a ponte de relacionamento;
- usar contexto específico quando obrigatório;
- aplicar somente técnica já selecionada;
- buscar o microcompromisso adequado;
- usar apenas fatos permitidos;
- respeitar fatos ausentes;
- não violar movimentos proibidos;
- seguir o tom publicado.

## 10. Ownership

MENSAGEM continua sendo dona de:

- gerar;
- revisar;
- copiar/inserir pela UI existente.

Continua proibido auto-send.

ANÁLISE permanece informativa.

## 11. Gate de saída

A Fase 5 está pronta quando:

1. Fases 0–4 permanecem verdes;
2. strategy nasce do mesmo snapshot do reasoning;
3. generic transplant test bloqueia texto intercambiável;
4. repetição outgoing é bloqueada;
5. facts allowed vêm somente do reasoning;
6. disponibilidade ausente continua não inventável;
7. B2B/consultoria/serviço permanecem verdes;
8. single seller-facing authority continua verde;
9. geração/revisão continuam sem auto-send.

Próxima fase: Fase 6 — integração, evals e homologação MVP.
