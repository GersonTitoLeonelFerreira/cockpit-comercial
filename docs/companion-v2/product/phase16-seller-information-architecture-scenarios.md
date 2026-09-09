# Cenários Canônicos — Arquitetura de Informação das Quatro Abas (FASE 16.1)

**Status:** contrato normativo, complementar a
[`companion-seller-product-contract.md`](./companion-seller-product-contract.md).
**Fonte principal:** este documento. A projeção machine-readable usada pela
validação determinística vive em
[`../../../app/extension/yolen-companion/tests/fixtures/phase16-seller-information-architecture-scenarios.mjs`](../../../app/extension/yolen-companion/tests/fixtures/phase16-seller-information-architecture-scenarios.mjs)
e espelha os mesmos 10 cenários abaixo pelo mesmo `id`. Qualquer alteração de
cenário precisa atualizar os dois arquivos.

**Propósito:** estes cenários existem para deixar impossível, daqui para a
frente, que uma implementação (ou um teste de implementação) volte a
confundir AGORA, ANÁLISE, CLIENTE e MENSAGEM. Cada cenário abaixo descreve o
resultado esperado nas quatro áreas para uma mesma situação de entrada — a
mesma disciplina que a `content-script-dom-seller-information-architecture.test.mjs`
já aplica para casos de implementação real; aqui a disciplina é aplicada ao
**contrato**, antes da implementação existir para os novos conceitos
(Decision State, Cards de Intervenção, Operational Signals — ver contrato de
produto, seção 2.1).

Cada cenário é avaliado contra as regras da seção 36 do prompt de missão da
FASE 16.1, formalizadas como as 12 regras de
[`phase16-seller-information-architecture-contract.test.mjs`](../../../app/extension/yolen-companion/tests/phase16-seller-information-architecture-contract.test.mjs).

---

## Cenário 1 — Venda ativa / pergunta de preço

**Entrada:** cliente diz "Achei interessante, mas está caro." Sessão
comercial, oportunidade ativa, sem sinal operacional adicional.

| Área | Resultado esperado |
|---|---|
| AGORA | Momento atual: "Cliente questionou o investimento." Decisão principal: "Entenda o que está pesando antes de oferecer condição." Nenhum card de intervenção (a objeção de preço já é a própria decisão principal, não precisa duplicar como card). |
| ANÁLISE | Mantém problema, necessidade, valor percebido, objeção de preço, estágio, método, seller coaching — a leitura completa da oportunidade, não só a última mensagem. |
| CLIENTE | Pode guardar sensibilidade a preço (se evidenciada), critérios de decisão, gaps de descoberta — nunca avaliação do vendedor. |
| MENSAGEM | Nesta fase, não gera texto seller-facing (fora de escopo da FASE 16.1) — futuramente consome o Decision State produzido por AGORA/ANÁLISE. |

---

## Cenário 2 — Conversa pessoal + oportunidade ativa

**Entrada:** sessão atual é "Oi amor. Tudo bem? Comeu?" — puramente pessoal.
Existe histórico comercial: interesse, proposta, preço, pendência.

| Área | Resultado esperado |
|---|---|
| AGORA | Momento atual: "Conversa pessoal. Nenhuma ação comercial nesta interação." Sem decisão principal comercial, sem card (não há sinal operacional neste cenário — ver Cenário 3 para a variante com Agenda). |
| ANÁLISE | **Preserva a oportunidade comercial completa** — problema, necessidades, proposta, objeções, pendências, condução, método. A sessão pessoal não apaga a venda (contrato, seção 6.1). |
| CLIENTE | Preserva a memória válida da pessoa. |
| MENSAGEM | Silêncio comercial. |

Este é o cenário que motivou a FASE 16.1 (ver "Motivo desta fase" no roadmap)
e é **obrigatório** na suíte de validação.

---

## Cenário 3 — Conversa pessoal + agenda comercial próxima

**Entrada:** mesmo cenário 2, mas existe um retorno comercial agendado para
hoje às 16h (sinal operacional).

| Área | Resultado esperado |
|---|---|
| AGORA | Momento atual: "Conversa pessoal." Card de intervenção: "Retorno comercial previsto para hoje." A conversa pessoal **não** é transformada em venda — o card é sobre o Decision State (agenda), não sobre a sessão atual (contrato, seção 3.1, item 3). |
| ANÁLISE | Continua preservada, igual ao Cenário 2. |
| CLIENTE | Preservada. |
| MENSAGEM | Silêncio comercial. |

---

## Cenário 4 — Inbound prioritário sem mensagem

**Entrada:** lead inbound novo, nenhum primeiro contato, SLA/timing exige
ação — sem que o lead tenha mandado uma nova mensagem que dispare a análise.

| Área | Resultado esperado |
|---|---|
| AGORA | Card de prioridade proativo: "Lead prioritário sem primeiro contato." Não depende de uma mensagem nova do lead (contrato, seção 4.5 — regra proativa). |
| ANÁLISE | Pode estar incompleta por falta de descoberta — isso é esperado, não um erro. |
| CLIENTE | Mostra apenas fatos realmente conhecidos + a seção "Ainda não sabemos" — nunca inventa dados para preencher a lacuna. |
| MENSAGEM | Fora de escopo nesta fase; Decision State indicaria "primeiro contato" como decisão pendente. |

---

## Cenário 5 — Vendedor saindo do método

**Entrada:** vendedor apresenta produto/preço antes de descobrir o impacto
para o cliente.

| Área | Resultado esperado |
|---|---|
| AGORA | Card de intervenção: "Descoberta incompleta. Retome a descoberta antes de defender preço." |
| ANÁLISE | Erro registrado com evidência, impacto, referência ao método, e orientação de recovery (contrato, seção 6.5). |
| CLIENTE | Mostra explicitamente "Ainda não sabemos o impacto" — não é reformulado como erro do vendedor (isso pertence a ANÁLISE, não a CLIENTE — contrato, seção 7.7). |
| MENSAGEM | Fora de escopo nesta fase. |

---

## Cenário 6 — Suporte/administrativo + oportunidade ativa

**Entrada:** cliente fala sobre contrato, boleto, suporte, documentação ou
problema operacional. Existe oportunidade comercial ativa em paralelo.

| Área | Resultado esperado |
|---|---|
| AGORA | Sessão tratada como não comercial nesta interação; pode mostrar uma ação operacional adequada ao assunto tratado (ex.: "Encaminhar para suporte"), nunca um pitch. |
| ANÁLISE | Venda preservada, sem ser convertida ou contaminada pelo assunto de suporte. |
| CLIENTE | Preservada. |
| MENSAGEM | Não força pitch — silêncio comercial ou, no máximo, resposta operacional (fora de escopo desta fase). |

---

## Cenário 7 — Memória antiga contradita

**Entrada:** memória registrada: "cliente pretende decidir sexta." Nova
evidência explícita na conversa atual: "vou decidir só no mês que vem."

| Área | Resultado esperado |
|---|---|
| AGORA | Current Moment usa a nova evidência ("decisão adiada para o mês que vem"), nunca a memória antiga. |
| ANÁLISE | Timing atualizado; a versão antiga é marcada como superada (`superseded`), não apagada silenciosamente (contrato, seção 11, regras 1-6). |
| CLIENTE | Memória atualizada com proveniência (origem + data) tanto do fato antigo quanto do novo. |
| MENSAGEM | Fora de escopo nesta fase; Decision State não deve usar "sexta" como verdade corrente. |

---

## Cenário 8 — Isolamento A → B

**Entrada:** vendedor sai da conversa do Lead A (que tem objeção, método,
memória e card ativos) e entra na conversa do Lead B.

| Área | Resultado esperado |
|---|---|
| AGORA | Zero dado de A — momento atual, decisão principal e cards são recalculados para B. |
| ANÁLISE | Zero dado de A. |
| CLIENTE | Zero dado de A. |
| MENSAGEM (futuro Communication Context) | Zero dado de A. |

Isolamento por `company_id`/lead é invariante de segurança permanente
(contrato, seção 12, item 4).

---

## Cenário 9 — Grupo

**Entrada:** conversa de grupo do WhatsApp.

| Área | Resultado esperado |
|---|---|
| AGORA | Nunca herda o Commercial Brain de um participante individual do grupo. |
| ANÁLISE | Nunca renderiza a leitura de oportunidade de um indivíduo como se fosse do grupo. |
| CLIENTE | Nunca renderiza CLIENTE individual incorretamente dentro do contexto de grupo. |
| MENSAGEM | Nunca produz Decision State de um lead individual dentro do grupo. |

Preserva todos os gates de identidade N→AM já existentes (contrato, seção
12, item 14).

---

## Cenário 10 — Nada para fazer

**Entrada:** sessão sem relevância comercial imediata, sem SLA, sem Agenda,
sem compromisso, sem risco, sem oportunidade que exija ação.

| Área | Resultado esperado |
|---|---|
| AGORA | Silêncio operacional explícito — estado positivo e esperado, não "carregando" nem "erro" (contrato, seção 4.6). |
| ANÁLISE | Mostra somente o que de fato existir — vazio é aceitável quando não há oportunidade. |
| CLIENTE | Memória existente, se houver; senão, vazio aceitável. |
| MENSAGEM | Nenhuma mensagem — silêncio é saída válida (contrato, seção 8.3). |

Este cenário é **tão importante quanto** os casos com intervenção — ele é a
prova de que silêncio é uma saída representável e não um estado de erro por
omissão (regra 12 da validação determinística).
