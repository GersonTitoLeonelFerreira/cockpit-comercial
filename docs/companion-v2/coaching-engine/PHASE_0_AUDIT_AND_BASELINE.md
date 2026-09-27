# YOLEN — Motor de Coaching Comercial

## FASE 0 — Auditoria e baseline de qualidade

Base auditada: `main@53692256f4cae866df47d4236ca925580527fe61`.

Branch de execução: `chatgpt/coaching-engine-phase-0-baseline`.

## 1. Objetivo da Fase 0

Estabelecer uma baseline reproduzível antes de alterar o motor comercial.

Esta fase não muda comportamento seller-facing, não altera Core, adapters, ANÁLISE, AGORA, CLIENTE ou MENSAGEM e não ativa ManyChat em produção.

O resultado esperado é responder, com evidência:

1. o que o sistema já sabe fazer;
2. onde o motor atual perde sequência ou qualidade de coaching;
3. quais casos serão usados para provar a melhoria;
4. como a qualidade será medida;
5. quais invariantes não podem ser quebradas nas fases seguintes.

## 2. Conclusões da auditoria atual

### 2.1 Prompt já contém instruções relevantes

`stateful-communication-execution-plan.ts` usa `phase-5.2-communication-prompt-v12` e já instrui explicitamente o modelo a:

- priorizar coaching comercial;
- avaliar ação do vendedor com evidência outgoing;
- explicar acerto, problema, impacto e correção;
- detectar perda de contexto, repetição, avanço tardio e oportunidade perdida;
- não inventar fatos, regras, preço, condição ou promessa.

Conclusão: o problema não deve ser tratado como simples falta de prompt.

### 2.2 A Intelligence Library já contém técnicas corretas, mas nem todas estão conectadas a sinais emitidos

A biblioteca já possui:

- `technique.guided_choice`;
- `technique.objection_diagnosis`;
- `technique.third_party_handoff`;
- `technique.discovery_before_prescription`;
- `technique.commitment_wait`;
- `anti_pattern.repeat_completed_action`;
- `risk.premature_stage_advance`;
- `principle.company_rules_before_claim`.

Entretanto, `buildSituationSignals()` em `commercial-reasoning-engine.ts` não emite hoje estes sinais/situações usados diretamente pela escolha guiada:

- `scheduling_choice`;
- `seller_already_asked_open_question`;
- `multiple_valid_options`.

Também não emite:

- `duplicate_followup`;
- `seller_action_already_performed`.

Há proteção posterior de responsabilidade para alguns casos de espera, mas isso não equivale a uma modelagem completa da execução do vendedor.

### 2.3 Responsabilidade atual protege repetição simples, mas é coarse-grained

`CommercialResponsibilitySnapshot` contém:

- `pending_fact`;
- `seller_action_already_performed`;
- `waiting_on`;
- `evidence_message_ids`.

Além disso, `canonical-commercial-responsibility.ts` reconcilia Decision State e Commercial Reasoning para `wait` quando a UI canônica prova que o vendedor já agiu e a resposta depende do cliente.

Isso cobre parte do caso C03.

Não responde, porém:

- qual ação o vendedor executou;
- qual era o objetivo comercial;
- se a pergunta foi aberta ou guiada;
- se houve quebra de sequência;
- se o vendedor pulou etapa;
- se o conteúdo foi excessivo;
- qual foi a qualidade persuasiva;
- qual foi o resultado observado daquela ação.

Essa lacuna justifica a Fase 1 — Seller Execution Trace.

### 2.4 O corpus R5 atual é útil, mas insuficiente para o novo objetivo

`phase16-r5-commercial-experiences.json` contém seis experiências reais e já cobre:

- espera após escolha guiada;
- terceiro/intermediário;
- objeção de pagamento;
- regra factual da empresa;
- continuidade comercial;
- invariância a scroll.

Ele não cobre completamente:

- tentativa de agendamento com pergunta aberta + silêncio + envio aleatório de planos;
- cliente com pouca fala e vendedor com evidência rica;
- fato novo depois de uma espera válida;
- preço antes da necessidade;
- vendedor continuando descoberta depois do cliente já querer fechar;
- elogio específico sem crítica inventada;
- genericness/transplant test;
- disponibilidade desconhecida sem inventar horário.

Por isso a Fase 0 adiciona C01-C10 sem substituir o corpus R5.

### 2.5 O eval comercial v1 não mede coaching com granularidade suficiente

`commercial-experience-eval-v1` mede hoje nove checks essencialmente binários:

- relevância;
- buyer side;
- terceiro;
- estágio mínimo;
- waiting_on;
- decisão;
- técnica;
- company knowledge;
- must_not.

A nova baseline adiciona uma rubrica específica de coaching com 100 pontos:

| Dimensão | Peso |
| --- | ---: |
| Fidelidade ao contexto | 15 |
| Diagnóstico da execução do vendedor | 15 |
| Sequência e método | 15 |
| Não-obviedade | 10 |
| Técnica escolhida | 15 |
| Ação prática | 10 |
| Qualidade da mensagem | 10 |
| Grounding e segurança | 10 |

Baseline inicial: `>= 85/100`.

Grounding possui piso próprio de `90/100`.

São falhas bloqueantes independentemente da nota:

- mensagem genérica que falha no transplant test;
- fato inventado;
- regra/claim de empresa sem sustentação;
- envio automático.

## 3. Corpus canônico C01-C10

Arquivo: `docs/companion-v2/corpus/coaching-engine-phase0-cases.json`.

### C01 — Experimental / pergunta aberta / silêncio / quebra de sequência

Prova que o sistema precisa reconhecer simultaneamente:

- intenção explícita da cliente;
- tentativa correta de avançar para agendamento;
- qualidade ruim da pergunta aberta;
- silêncio da cliente;
- quebra posterior ao enviar planos;
- necessidade de retomar o objetivo original;
- escolha guiada somente se houver opções reais.

### C02 — Pouca fala do cliente / muita evidência do vendedor

Princípio obrigatório:

> Pouca fala do cliente não pode significar pouca análise do vendedor.

A confiança de contexto do cliente pode ser baixa ao mesmo tempo em que a confiança sobre execução do vendedor é alta.

### C03 — Ação já executada / esperar

Protege contra repetição quando o vendedor já transferiu a próxima ação ao cliente.

### C04 — Fato novo após espera

Prova que `wait` não pode ficar congelado quando surge uma nova resposta do cliente.

### C05 — Preço antes da necessidade

Prova prescrição prematura e recuperação de descoberta sem apagar o que já aconteceu.

### C06 — Cliente pronto para fechar / vendedor continua descobrindo

Prova atraso de avanço e necessidade de responder o pedido comercial atual.

### C07 — Boa objeção

Prova que análise precisa elogiar comportamento real sem inventar ponto negativo apenas para preencher a UI.

### C08 — Intermediário

Preserva interlocutor e prospect como papéis distintos.

### C09 — Genericness / transplant test

Se a mesma mensagem puder ser enviada quase sem mudança a dez leads/situações diferentes, a mensagem falha.

### C10 — Agenda desconhecida

Técnica comercial não autoriza invenção de fato. Sem disponibilidade real, nenhum horário pode ser fabricado.

## 4. Arquitetura-alvo validada pela Fase 0

A evolução será construída em camadas:

1. Conversation Reconstruction;
2. Customer Intent & Commitment Model;
3. Seller Execution Trace;
4. Method State & Sequence;
5. Situation Classifier;
6. Technique Retrieval & Ranking;
7. Coaching Synthesis;
8. Message Strategy Plan;
9. Message Generation + Critic.

A Fase 0 não implementa essas camadas; apenas fixa os contratos de qualidade que deverão guiá-las.

## 5. Invariantes

As próximas fases não podem quebrar:

- um único Core compartilhado;
- adapters apenas físicos;
- nenhuma estratégia comercial duplicada por canal;
- nenhuma escrita automática em CRM/Agenda;
- nenhum auto-send;
- Company Knowledge somente de configuração publicada;
- evidência e memória com IDs canônicos;
- proteção A → B → A;
- MENSAGEM continua dona de inserir/copiar;
- ANÁLISE continua informacional;
- ManyChat normal/prod permanece OFF até rollout explícito;
- message generator não pode se tornar um segundo Commercial Brain.

## 6. Decisão sobre fine-tuning

Não iniciar fine-tuning nesta etapa.

Ordem obrigatória:

1. corpus/evals;
2. corrigir representação de estado e sequência;
3. conectar signals/situations à biblioteca;
4. melhorar synthesis e message strategy;
5. medir novamente;
6. só então avaliar fine-tuning com holdout separado e ganho mensurável.

## 7. Artefatos criados na Fase 0

- `docs/companion-v2/corpus/coaching-engine-phase0-cases.json`;
- `app/lib/companion/coaching-quality-eval.ts`;
- `app/lib/companion/coaching-quality-eval.test.mjs`;
- `app/lib/companion/coaching-engine-phase0-baseline.test.mjs`;
- este documento.

Nenhum arquivo de runtime seller-facing é alterado nesta fase.

## 8. Gate de saída da Fase 0

A Fase 0 está pronta para encerramento quando:

1. C01-C10 estão versionados e validados;
2. todas as técnicas citadas pelo corpus existem na Intelligence Library;
3. a rubrica soma 100 pontos e possui baseline reproduzível;
4. C02 formaliza confiança separada de cliente e vendedor;
5. C09 formaliza genericness/transplant test;
6. C01/C10 proíbem disponibilidade inventada;
7. testes focais da baseline passam;
8. não há mudança em runtime de produção.

O próximo passo após esse gate é a Fase 1 — Seller Execution Trace.
