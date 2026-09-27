# YOLEN — Motor de Coaching Comercial

## FASE 3 — Commercial Techniques Engine

Base: `main@45fd3b082df80ec67be90ca0c26e3efc48172563`.

Branch: `chatgpt/coaching-engine-phase-3-techniques-engine`.

## 1. Missão

Transformar o ranking de técnicas em seleção comercial segura.

Até a Fase 2, um item podia ser semanticamente relevante e chegar a `selected_techniques` apenas por score.

A Fase 3 adiciona um segundo requisito obrigatório:

> técnica relevante não é necessariamente técnica aplicável agora.

## 2. Pipeline

O fluxo passa a ser:

1. Conversation;
2. Seller Execution Trace;
3. Sequence + Method Assessment;
4. contexto de aplicabilidade;
5. ranking contextual;
6. applicability gate;
7. somente técnicas aplicáveis entram em `selected_techniques`.

## 3. Estados de aplicabilidade

Cada candidata recebe:

- `applicable`;
- `conditional`;
- `blocked`.

`selected_techniques` recebe apenas `applicable`.

Condições não cumpridas entram em `limitations`.

## 4. Escolha guiada

### 4.1 Princípio

`technique.guided_choice` exige múltiplas opções reais.

Para agendamento, a Fase 3 só considera opção real quando ela vem de fato oficial vigente cuja identidade é explicitamente de disponibilidade/agendamento.

Horários escritos pelo vendedor no histórico não viram disponibilidade atual.

### 4.2 Consequência

C01 sem agenda conhecida:

- técnica é relevante;
- técnica fica `conditional`;
- não entra em `selected_techniques`;
- reasoning recebe a limitação `grounded_multiple_valid_options_required`;
- `do_not_do` proíbe inventar horário.

C01 com fato oficial contendo ao menos duas opções concretas:

- emite `multiple_valid_options`;
- guided choice pode ficar `applicable`;
- pode entrar em `selected_techniques`.

## 5. Espera disciplinada

`technique.commitment_wait` exige que:

- a próxima resposta esteja com o cliente;
- não tenha surgido fato novo depois da ação do vendedor.

Assim:

- C03: aplicável;
- C04: bloqueada após rejeição das opções.

## 6. Diagnóstico de objeção

Se o vendedor já executou um `objection_probe` e está aguardando resposta, a mesma técnica não pode ser selecionada novamente.

Isso evita coaching que mande o vendedor repetir exatamente a pergunta que acabou de fazer.

## 7. Discovery before prescription

Continua aplicável quando existe gap real ou preço/produto foi apresentado prematuramente.

Fica bloqueada quando:

- o vendedor já fez a pergunta e aguarda resposta;
- existe intenção explícita de fechamento e nova descoberta genérica só atrasaria o avanço.

## 8. Ranking contextual obrigatório

Nenhuma técnica pode ser selecionada se não tiver pelo menos um match contextual em:

- signals;
- situations;
- objectives.

Score isolado não é autorização.

## 9. Grounding de opções

A Fase 3 deliberadamente não trata:

- mensagem do vendedor;
- DOM;
- viewport;
- texto de UI;

como fonte de disponibilidade.

Para scheduling, o gate aceita somente fatos oficiais vigentes explicitamente identificados como disponibilidade/agendamento.

Isso é conservador por desenho.

## 10. Alteração no Commercial Reasoning

`commercial-reasoning-engine.ts` agora:

- constrói `CommercialTechniqueContext`;
- injeta apenas sinais groundeados adicionais no ranking;
- roda `selectApplicableCommercialTechniques()`;
- passa somente candidatas aplicáveis para `selected_techniques`;
- adiciona condições não satisfeitas em `limitations`;
- adiciona restrições de segurança em `do_not_do`.

O contrato público `commercial-reasoning-v1` não precisou ganhar campos novos nesta fase.

## 11. Neutralidade vertical

O contexto inicial de homologação usa exemplos de academia, mas nenhuma regra comercial do Coaching Engine pode depender desse segmento.

Princípios obrigatórios:

- técnica, método e sequência são conceitos transversais;
- regras específicas do negócio entram por `commercial_context`, Company Knowledge, produtos, fatos, objection guides e método publicado;
- o runtime não pode assumir academia, matrícula, experimental ou plano como modelo universal;
- exemplos verticais servem como fixtures, não como fonte de regra;
- a suíte inclui cenários sem vocabulário de academia para software B2B, serviços com visita, consultoria e venda consultiva genérica.

A Fase 3 amplia o vocabulário determinístico para verbos e conceitos comerciais transversais como contratar, comprar, assinar, proposta, solução, serviço, consultoria, reunião, visita e demonstração.

## 12. Invariantes

Não foram alterados:

- Core;
- adapters;
- UI;
- presenters;
- CRM;
- Agenda;
- Message Generator;
- auto-send;
- rollout ManyChat.

## 13. Gate de saída

A Fase 3 está pronta quando:

1. Fases 0–2 continuam verdes;
2. guided choice é bloqueada sem opções reais;
3. horários escritos apenas pelo vendedor não contam como disponibilidade;
4. fato oficial vigente com múltiplas opções habilita o gate;
5. commitment wait deixa de aplicar quando há fato novo;
6. objection diagnosis não repete probe pendente;
7. ranking contextual é obrigatório;
8. integração com Commercial Reasoning permanece verde.

Próxima fase: Fase 4 — Coaching Engine + ANÁLISE.
