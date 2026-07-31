# Progresso oficial do Yolen Companion V2

## Regra de leitura

Este relatório acompanha fases do produto. Banco, migrations, testes e rotas
aparecem como evidências ou pacotes técnicos, não como substitutos de uma
entrega funcional.

O detalhamento histórico dos pacotes anteriores permanece nos documentos
`PHASE_2_SCHEMA_BASELINE.md`, `PHASE_3_MESSAGE_LEDGER.md` e
`PHASE_4_CAPTURE_STATE.md`.

## Estado geral em 2026-07-31

| Campo | Estado |
|---|---|
| Momento atual | Fases 1 e 2 concluídas; implementação da Fase 3 concluída na branch e pronta para pull request |
| Motor ativo | `v1` |
| Commit atual da `main` | `db01cc722da58217839caff9b90bfb15848e4a6d` |
| Produção canônica | `READY`; a Fase 3 ainda não foi integrada nem publicada |
| Supabase | Projeto saudável; PT2-A, operações administrativas da Fase 3, PT4-A e PT4-B aplicadas |
| Extensão V2 | Ainda não integrada ao ledger |
| Tabelas V2 | Ledger e cursor disponíveis; configuração comercial operacional e validada com rascunho V1 |
| Interface nova V2 | `/admin/configuracao-comercial` funcional na branch da Fase 3 |
| Fase 5 do produto | Não iniciada |

## Painel executivo por fase do produto

| Fase | Entrega | Estado | Evidência existente | Próximo gate |
|---|---|---|---|---|
| 0 | Proteção do V1 e rollback | Concluída | Tag de baseline, flag padrão `v1`, rollback e produção validados | Nenhum |
| 1 | Contrato da inteligência comercial | Concluída | Contrato `phase-1-v1`, 30 conversas sintéticas, 27 controles e PR #145 integrado | Nenhum |
| 2 | Dados de método, produtos e configurações | Concluída | Contrato `phase-2-v1`, cinco tabelas versionadas, RLS, testes e migrations aplicadas | Nenhum; fundação disponível para a Fase 3 |
| 3 | Tela de configuração comercial | Implementação concluída na branch | Interface administrativa, validação, versionamento, rotas e operações transacionais com build aprovado | Abrir PR, integrar na `main` e validar o deployment |
| 4 | Captura completa e demonstrável | Fundação parcial | Ledger e cursor criados, seguros e testados | Extensão não envia ao ledger; ingestão, reconciliação e prévia técnica não existem |
| 5 | Motor de diagnóstico comercial V2 | Não iniciada | Contrato da Fase 1 define o comportamento futuro, mas nenhum motor V2 executa | Depende das Fases 2, 3 e 4 funcionalmente aceitas |

## Fase 1 — resultado funcional aprovado

O usuário aprovou o contrato com a frase:

```text
APROVADO CONTRATO FUNCIONAL FASE 1
```

A aprovação congela a seguinte ordem:

1. entender a conversa;
2. identificar intenção e necessidades;
3. avaliar descoberta e resposta do vendedor;
4. registrar lacunas, perguntas ignoradas, objeções e riscos;
5. avaliar o método configurado;
6. avaliar adequação da solução;
7. orientar o próximo movimento;
8. somente depois avaliar se cabe sugerir CRM.

### Entregas da Fase 1

- contrato funcional `phase-1-v1`;
- entradas, saídas e regras de `null` documentadas;
- distinção entre análise completa, limitada e bloqueada;
- conversa comercial, não comercial e incerta;
- intenção, necessidades e informações ausentes;
- perguntas ignoradas e objeções ativas;
- acertos e riscos do vendedor com evidência;
- método comercial separado de etapa do CRM;
- adequação da solução;
- intervenção opcional;
- pergunta e mensagem sugeridas opcionais;
- sugestão de CRM sempre sujeita a confirmação humana;
- 30 conversas sintéticas e anonimizadas;
- 28 coberturas comerciais obrigatórias;
- 27 controles automatizados aprovados.

### Mudança de governança

O campo conceitual:

```text
apply_crm_change
```

foi removido do contrato e substituído por:

```text
crm_suggestion.should_change_crm_stage
```

Todos os casos exigem:

```text
crm_suggestion.requires_human_confirmation = true
```

Essa mudança não altera o contrato do Companion V1 nem os arquivos de runtime.
Ela impede que o futuro motor V2 confunda recomendação e execução.

### O que a Fase 1 não fez

- não criou prompt V2;
- não chamou modelo de IA;
- não alterou rota;
- não alterou extensão;
- não alterou banco;
- não aplicou etapa, agenda, ganho ou perda;
- não ativou motor V2;
- não mudou a experiência atual do vendedor.

O resultado da Fase 1 é o comportamento comercial vinculante que as próximas
fases deverão implementar e demonstrar.

## Fase 2 — modelo funcional aprovado

O usuário aprovou o modelo com a frase:

```text
APROVADO MODELO FUNCIONAL FASE 2
```

A aprovação autoriza construir, mas não aplicar remotamente, a fundação:

- configuração central versionada por empresa;
- etapas ordenadas do método comercial;
- perfis comerciais ligados ao catálogo `products`;
- fatos oficiais da empresa;
- guias contextuais de objeções;
- diretrizes obrigatórias e proibidas;
- fluxo `draft -> published -> archived`;
- imutabilidade de versões publicadas e arquivadas;
- escrita exclusiva do administrador ativo da empresa;
- leitura da versão publicada por membros ativos;
- RLS forçado, grants explícitos e chaves compostas multiempresa.

O contrato completo está em
`docs/companion-v2/PHASE_2_COMMERCIAL_CONFIG.md`.

Não existe ligação automática entre o método comercial e as colunas do CRM.
Nenhum dado real de empresa é criado por esta entrega.

## Fase 3 — interface administrativa concluída na branch

A implementação funcional da Fase 3 foi concluída e validada localmente em
2026-07-31 na branch:

```text
feature/companion-v2-phase-3-commercial-config-ui

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

## Fundação técnica V2 disponível

### PT0 — proteção do V1

- tag `yolen-companion-v1-baseline-2026-07-29`;
- referência remota de rollback;
- seletor `COMPANION_ENGINE_VERSION` com padrão `v1`;
- documentação de arquitetura, segurança e rollback;
- deployment e fluxo real validados.

### PT1-A — contrato e corpus de regressão

- contrato funcional aprovado em 2026-07-30;
- 30 conversas sintéticas e anonimizadas;
- 14 casos anteriores preservados e 16 adicionados;
- ganho, perda, agenda, negociação, ausência de resposta, edição, exclusão,
  áudio, comportamento comercial e falsos positivos;
- 27 controles automatizados;
- nenhuma conversa real usada;
- nenhuma autorização de aplicação automática no CRM.

Esse pacote conclui a definição funcional da Fase 1. Ele não implementa o motor
da Fase 5.

### PT-BASE — baseline reproduzível do schema

- 94 migrations legadas preservadas;
- histórico oficial conciliado com o Supabase;
- 39 tabelas e respectivos controles estruturais reproduzidos em banco
  descartável;
- nenhuma linha de produção copiada.

Esse pacote reduz risco de banco, mas não cria os dados comerciais da Fase 2.

### PT2-A — configuração comercial versionada

- contrato funcional `phase-2-v1`;
- tabela central de versões;
- etapas do método separadas do CRM;
- perfis vinculados ao catálogo `products`;
- fatos oficiais e guias de objeções;
- uma versão rascunho e uma publicada por empresa;
- publicação transacional com arquivamento da versão anterior;
- versões publicadas e arquivadas imutáveis;
- RLS forçado e acesso baseado em `company_memberships`;
- grants explícitos para a Data API;
- chaves compostas contra vínculos entre empresas;
- teste sintético e descartável aprovado;
- migration `20260731000105` ainda não aplicada ao Supabase.

Esse pacote é fundação técnica. A Fase 2 só poderá ser encerrada depois da
revisão, aplicação controlada e validação do schema remoto.

### PT3-A — administração da configuração comercial

- migration `20260731123000` com operações administrativas transacionais;
- salvamento integral e atômico do rascunho;
- clonagem integral de versão publicada ou arquivada;
- publicação com arquivamento automático da versão anterior;
- exclusão restrita a versões em rascunho;
- autorização por administrador ativo e empresa;
- teste transacional específico aprovado;
- página administrativa completa;
- validação prévia das exigências de publicação;
- integração com o catálogo real de produtos;
- build completo aprovado;
- migration aplicada ao Supabase;
- implementação ainda aguardando integração na `main`.

### PT4-A — ledger de mensagens

- tabela `conversation_messages`;
- versões imutáveis para texto, áudio, edição e exclusão;
- isolamento por empresa;
- RLS forçado e grants mínimos;
- migration `20260730155903` aplicada;
- teste local 1/1 aprovado.

### PT4-B — estado de captura

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
| Proteção do V1 | Commit direto de governança | `59842da` | Produção validada |
| Bloqueio de agenda vencida | #136 | `27ea5a9` | V1 protegido |
| Integridade de edição/exclusão | #137 | `1fb1aeb` | V1 validado no Firefox |
| Corpus inicial | #138 | `651765e` | Integrado; sucedido pelo contrato V2 |
| Baseline do schema | #139 | `84e57a3` | Integrado |
| Compatibilidade dos testes | #140 e #141 | `3b6b147` e `63a23fb` | Integrado |
| Ledger PT4-A | #142 | `b92bbd4` | Integrado e aplicado no Supabase |
| Cursor PT4-B | #143 | `516dc92` | Integrado e aplicado no Supabase |
| Realinhamento do roadmap | #144 | `1948546` | Integrado e em produção |
| Contrato funcional da Fase 1 | #145 | `e6af2e3` | Integrado e em produção |
| Configuração comercial versionada | #146 | `db01cc7` | Integrada e aplicada no Supabase |
| Interface administrativa da Fase 3 | PR pendente | branch até `d3a0723` | Build aprovado; aguardando integração |

## Itens explicitamente não entregues

- nenhuma mensagem real gravada no ledger V2;
- nenhuma rota V2 de ingestão;
- nenhum `device_key` gerado pela extensão;
- nenhuma prévia de mensagens capturadas;
- nenhuma versão comercial publicada para uso do motor V2;
- nenhum diagnóstico executado pelo motor V2;
- nenhuma alteração automática de estágio, agenda ou CRM pelo V2;
- nenhuma integração da extensão com ledger e cursor;
- nenhum rollout para empresa piloto;
- interface da Fase 3 ainda não integrada na `main` nem publicada em produção.

## Próximo gate

1. Registrar esta validação final no GitHub.
2. Abrir o pull request da Fase 3 contra a `main`.
3. Revisar o diff e os checks do pull request.
4. Integrar a branch somente após aprovação explícita.
5. Validar o deployment da página e das rotas administrativas.
6. Completar os perfis dos produtos ativos antes de publicar a V1 comercial.
7. Manter o motor ativo em `v1` até a Fase 5 implementar e validar o diagnóstico.

A integração da Fase 3 não autoriza o motor V2, mudanças automáticas no CRM ou
rollout para empresas clientes.
