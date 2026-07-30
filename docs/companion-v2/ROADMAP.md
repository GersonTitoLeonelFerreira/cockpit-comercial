# Roadmap oficial do Yolen Companion V2

## Objetivo

Evoluir o Companion sem interromper o V1 e medir o avanço pelo que o vendedor,
o gestor e o administrador conseguem compreender, usar e validar.

Este documento é a fonte canônica da numeração das fases do produto. Migrations,
tabelas, testes e rotas são pacotes técnicos. Eles podem sustentar uma fase, mas
não concluem uma fase do produto sozinhos.

## Duas camadas de acompanhamento

| Camada | Significado | Critério de conclusão |
|---|---|---|
| Fase do produto | Entrega de negócio aprovada pelo usuário | Resultado funcional demonstrado, forma de teste explicada e aceite registrado |
| Pacote técnico | Fundação interna de banco, API, extensão, segurança ou testes | Critérios técnicos aprovados, sem declarar entrega funcional inexistente |

## Princípios obrigatórios

1. O V1 permanece operacional até o aceite formal do V2.
2. Captura não decide estágio comercial.
3. Diagnóstico não altera o CRM automaticamente.
4. Coaching não redefine a decisão comercial.
5. Aplicação no CRM exige autorização, empresa e ciclo válidos.
6. Toda mensagem deve possuir identidade, versão e estado de exclusão
   auditáveis.
7. Nenhuma migration é aplicada sem baseline reproduzível e rollback.
8. Isolamento multiempresa e corpus de regressão são gates obrigatórios.
9. Nenhuma fase é chamada de concluída apenas porque testes passaram.
10. Toda fase termina com demonstração compreensível para o usuário.
11. Limitação de contexto deve ser declarada; nunca preenchida por invenção.
12. Sugestão de CRM sempre exige confirmação humana.

## Fases oficiais do produto

| Fase | Entrega de produto | Estado em 2026-07-30 | Critério de conclusão |
|---|---|---|---|
| 0 | Proteger o V1 e garantir rollback | Concluída | V1 preservado, flag segura, baseline, rollback e produção validados |
| 1 | Contrato completo da inteligência comercial | Aprovada funcionalmente | Contrato `phase-1-v1`, 30 conversas e confirmação humana documentados; formalização integrada e validada |
| 2 | Dados de método, produtos e configurações comerciais | Não iniciada funcionalmente | Configuração versionada, multiempresa e testável existe no banco sem depender de código fixo |
| 3 | Tela de configuração do método comercial | Não iniciada | Empresa consegue visualizar, criar e editar sua configuração sem alterar código |
| 4 | Captura completa, demonstrável e confiável | Fundação parcial | Extensão envia somente mensagens novas completas; reenvio não duplica; edição, exclusão e áudio são reconciliados; existe prévia técnica para validação |
| 5 | Motor de diagnóstico comercial V2 | Não iniciada | Conversa gera fatos, diagnóstico e orientação explicáveis, validados contra o contrato e demonstrados antes de qualquer aplicação no CRM |

Qualquer fase posterior à Fase 5 será definida somente depois do aceite do motor
de diagnóstico. Aplicação automática no CRM, rollout e retirada do V1 não estão
implicitamente autorizados por este roadmap.

## Contrato vinculante da Fase 1

O contrato funcional aprovado está em
`docs/companion-v2/PHASE_1_FUNCTIONAL_CONTRACT.md`.

Ele obriga o futuro motor a analisar nesta ordem:

1. relevância e condição da análise;
2. intenção e necessidades do cliente;
3. informações ausentes, perguntas ignoradas e objeções;
4. acertos e riscos do vendedor;
5. avanço no método comercial;
6. adequação da solução;
7. próximo movimento;
8. eventual sugestão de CRM.

O campo conceitual `apply_crm_change` foi removido. O contrato usa
`crm_suggestion.should_change_crm_stage`, sempre acompanhado de
`requires_human_confirmation=true`.

## Estado real do produto

### O que funciona hoje

- O Companion V1 continua ativo no WhatsApp.
- Mensagem nova pode gerar análise incremental no fluxo V1.
- Edição, exclusão e restauração acionam reanálise controlada do período mais
  recente.
- Clique sem mudança reutiliza o resultado salvo.
- Agendamento vencido é bloqueado antes da aplicação.

### O que está aprovado como comportamento futuro

- contrato funcional `phase-1-v1`;
- análise completa, limitada ou bloqueada;
- separação de conversa comercial e não comercial;
- intenção, necessidades e informações ausentes;
- perguntas ignoradas e objeções ativas;
- avaliação do vendedor sustentada por evidências;
- método comercial separado de etapa do CRM;
- adequação da solução;
- intervenção, pergunta e mensagem opcionais;
- CRM apenas como sugestão com confirmação humana;
- corpus sintético com 30 conversas e 28 coberturas.

Esse comportamento ainda não é executado pelo produto. Ele é a especificação que
o motor da Fase 5 deverá cumprir.

### O que existe apenas como fundação V2

- baseline reproduzível do schema;
- ledger versionado `conversation_messages`;
- estado de captura `conversation_capture_state`;
- RLS, grants mínimos, constraints e testes dessas duas tabelas.

### O que ainda não existe

- dados configuráveis de método, produtos e regras por empresa;
- tela de configuração comercial;
- rota V2 de ingestão;
- escrita da extensão no ledger;
- prévia técnica da captura V2;
- mensagens reais nas duas tabelas V2;
- motor de diagnóstico V2 ativo;
- interface nova do Companion V2.

## Reclassificação dos pacotes técnicos

| Nome histórico no repositório | Classificação correta | Relação com o produto |
|---|---|---|
| Fase técnica 0 — proteção do V1 | PT0 | Conclui a Fase 0 do produto |
| Fase técnica 1 — corpus de regressão | PT1-A | Contrato e corpus que concluem a definição funcional da Fase 1 |
| Fase técnica 2 — baseline do schema | PT-BASE | Fundação transversal; não entrega a Fase 2 funcional |
| Fase técnica 3 — ledger de mensagens | PT4-A | Fundação da Fase 4 |
| Fase técnica 4 — cursor de captura | PT4-B | Fundação da Fase 4 |
| Antiga Fase técnica 5 — ingestão idempotente | PT4-C | Parte ainda pendente da Fase 4, não é a Fase 5 do produto |

Os nomes dos arquivos e migrations históricos são preservados para
rastreabilidade. Novos documentos e relatórios usam a numeração oficial do
produto e o identificador `PT` para trabalho interno.

## Sequência de execução

1. Integrar e validar a formalização da Fase 1.
2. Apresentar o modelo funcional dos dados da Fase 2.
3. Criar a estrutura de dados somente depois da aprovação do modelo.
4. Entregar a tela de configuração da Fase 3.
5. Concluir a Fase 4 com ingestão, integração da extensão e demonstração
   funcional.
6. Iniciar a Fase 5 somente depois das fases anteriores estarem funcionalmente
   aceitas.

O ledger e o cursor já construídos serão reaproveitados. O contrato da Fase 1
não autoriza antecipar o motor da Fase 5.

## Gate obrigatório de comunicação e aceite

Toda entrega deve responder, nesta ordem:

1. Qual problema foi resolvido.
2. Qual resultado muda para vendedor, gestor ou administrador.
3. Onde a mudança aparece.
4. Como o usuário testa.
5. O que ainda não está pronto.
6. Quais evidências técnicas sustentam a entrega.

Se não houver mudança visível ou fluxo demonstrável, o relatório deve usar o
termo **fundação técnica**, nunca **fase concluída**.

## Regra de promoção

O V2 não pode ser habilitado em produção apenas porque compila. A promoção
exige:

- contrato comercial aprovado;
- configuração por empresa disponível;
- captura completa demonstrada;
- corpus de regressão aprovado;
- isolamento multiempresa validado;
- comparação V1/V2 documentada;
- rollback exercitado;
- autorização explícita para o piloto.
