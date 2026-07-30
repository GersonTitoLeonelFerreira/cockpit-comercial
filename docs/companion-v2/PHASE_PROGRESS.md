# Progresso oficial do Yolen Companion V2

## Regra de leitura

Este relatório acompanha fases do produto. Banco, migrations, testes e rotas
aparecem como evidências ou pacotes técnicos, não como substitutos de uma
entrega funcional.

O detalhamento histórico dos pacotes anteriores permanece nos documentos
`PHASE_2_SCHEMA_BASELINE.md`, `PHASE_3_MESSAGE_LEDGER.md` e
`PHASE_4_CAPTURE_STATE.md`.

## Estado geral em 2026-07-30

| Campo | Estado |
|---|---|
| Momento atual | Realinhamento de governança antes de retomar a Fase 1 |
| Motor ativo | `v1` |
| Commit de produção | `516dc92c227a86229548e9def4712c141caae694` |
| Produção canônica | `READY`; `/login` respondeu HTTP 200 |
| Supabase | Projeto saudável; migrations técnicas PT4-A e PT4-B aplicadas |
| Extensão V2 | Não integrada ao ledger |
| Tabelas V2 | Criadas e vazias |
| Interface nova V2 | Não existe |
| Fase 5 do produto | Não iniciada |

## Painel executivo por fase do produto

| Fase | Entrega | Estado | Evidência existente | Pendência que impede conclusão |
|---|---|---|---|---|
| 0 | Proteção do V1 e rollback | Concluída | Tag de baseline, flag padrão `v1`, rollback e produção validados | Nenhuma |
| 1 | Contrato da inteligência comercial | Parcial | Corpus sintético com 14 conversas e 22 testes | Contrato completo de entradas, fatos, diagnóstico, evidências, orientação e proibições ainda não foi apresentado e aprovado |
| 2 | Dados de método, produtos e configurações | Não iniciada funcionalmente | Baseline do schema pronto | Modelo configurável por empresa ainda não foi criado |
| 3 | Tela de configuração comercial | Não iniciada | Nenhuma entrega funcional | Interface e fluxo de salvar/editar configurações ainda não existem |
| 4 | Captura completa e demonstrável | Fundação parcial | Ledger e cursor criados, seguros e testados | Extensão não envia ao ledger; ingestão, reconciliação e prévia técnica não existem |
| 5 | Motor de diagnóstico comercial V2 | Não iniciada | Nenhuma execução V2 | Depende do aceite funcional das Fases 1 a 4 |

## O que o vendedor consegue usar hoje

O que existe para uso continua sendo o Companion V1:

- conexão e resolução do lead;
- análise incremental de mensagens novas;
- reanálise controlada após edição, exclusão ou restauração;
- reutilização do resultado quando não há mudança na conversa;
- separação entre analisar e aplicar a sugestão;
- bloqueio de agendamento com horário vencido.

Essas correções preservaram o fluxo existente. Elas não representam uma nova
interface do V2.

## Fundação técnica V2 concluída

### PT0 - proteção do V1

- tag `yolen-companion-v1-baseline-2026-07-29`;
- referência remota de rollback;
- seletor `COMPANION_ENGINE_VERSION` com padrão `v1`;
- documentação de arquitetura, segurança e rollback;
- deployment e fluxo real validados.

### PT1-A - corpus de regressão

- 14 conversas sintéticas e anonimizadas;
- ganho, perda, agenda, negociação, ausência de resposta, edição, exclusão,
  áudio e falsos positivos;
- 22 cenários automatizados;
- nenhuma conversa real usada.

Esse pacote sustenta a Fase 1, mas não substitui o contrato comercial que ainda
precisa de aprovação do usuário.

### PT-BASE - baseline reproduzível do schema

- 94 migrations legadas preservadas;
- histórico oficial conciliado com o Supabase;
- 39 tabelas e respectivos controles estruturais reproduzidos em banco
  descartável;
- nenhuma linha de produção copiada.

Esse pacote reduz risco de banco, mas não cria os dados comerciais da Fase 2.

### PT4-A - ledger de mensagens

- tabela `conversation_messages`;
- versões imutáveis para texto, áudio, edição e exclusão;
- isolamento por empresa;
- RLS forçado e grants mínimos;
- migration `20260730155903` aplicada;
- teste local 1/1 aprovado.

### PT4-B - estado de captura

- tabela `conversation_capture_state`;
- separação entre última mensagem observada e processada;
- estado independente por empresa, conversa e dispositivo;
- RLS forçado e grants mínimos;
- migration `20260730170515` aplicada;
- teste local 1/1 aprovado.

PT4-A e PT4-B permanecem vazios porque a extensão V2 ainda não escreve neles.
Por isso, a Fase 4 do produto continua parcial.

## Evidências integradas

| Entrega técnica | PR | Commit integrado | Estado |
|---|---|---|---|
| Proteção do V1 | #136 | `59842da` | Produção validada |
| Integridade de edição/exclusão | #137 | anterior ao corpus | V1 validado no Firefox |
| Corpus de regressão | #138 | `651765e` | Integrado |
| Baseline do schema | #139 | `84e57a3` | Integrado |
| Compatibilidade dos testes | #140 e #141 | `3b6b147` e `63a23fb` | Integrado |
| Ledger PT4-A | #142 | `b92bbd4` | Integrado e aplicado no Supabase |
| Cursor PT4-B | #143 | `516dc92` | Integrado e aplicado no Supabase |

## Correção do registro técnico da antiga Fase 4

O documento anterior ainda marcava como pendentes itens que já foram
concluídos. O estado correto é:

- PR #143 integrado por squash;
- deployment canônico `READY`;
- migration `20260730170515` aplicada;
- RLS, policy e privilégios verificados;
- advisors sem novo alerta de segurança do pacote;
- teste local 1/1 aprovado;
- repositório do usuário limpo depois da validação.

Esse fechamento comprova PT4-B. Ele não comprova captura funcional da Fase 4.

## Itens explicitamente não entregues

- nenhuma mensagem real gravada no ledger V2;
- nenhuma rota V2 de ingestão;
- nenhum `device_key` gerado pela extensão;
- nenhuma prévia de mensagens capturadas;
- nenhuma tela de configuração comercial;
- nenhum diagnóstico do motor V2;
- nenhuma alteração automática de estágio, agenda ou CRM pelo V2;
- nenhum rollout para empresa piloto.

## Próximo gate

1. Integrar este realinhamento documental.
2. Produzir o contrato comercial da Fase 1 em linguagem de negócio.
3. Apresentar exemplos de entrada, fatos, diagnóstico, evidências, orientação e
   situações em que o motor deve se recusar a decidir.
4. Obter aprovação explícita do usuário.
5. Somente então iniciar o modelo de dados da Fase 2.

Nenhuma ingestão, migration, tela ou motor V2 deve ser iniciado durante o gate
de realinhamento.
