# FASE 16.9 — Re-gate real após FASE 16-R

## Estado

**ABERTO — não declarar PASS sem smoke real no Firefox.**

Referência de código para o re-gate:

- `main`: `8edee2369cd4d90de5c23d3b721cb7ed269b764a`
- 16-R1 a 16-R6 integradas.

## Regra do gate

Os dois gates precisam passar:

1. **Técnico** — sem vazamento de lead/ciclo, sem estado stale, contratos válidos, build e regressões estáveis.
2. **Comercial** — a orientação precisa melhorar de verdade a condução daquela venda.

A FASE 17 permanece bloqueada enquanto qualquer cenário abaixo estiver FAIL ou não executado.

## Preparação

- Firefox com a extensão carregada a partir da `main` acima.
- Usuário autenticado no Companion.
- Empresa com método, produto, condições de pagamento, fatos e objection guides publicados.
- Conversas de teste identificadas sem reaproveitar estado de outro lead/ciclo.
- DevTools disponível apenas para evidência; DOM/viewport não pode ser usado como verdade comercial.

## Cenário 1 — Agendamento aberto

### Conversa mínima

Vendedor já ofereceu opções concretas de horário e perguntou qual funciona melhor. Cliente ainda não respondeu.

### PASS esperado

- AGORA reconhece que a ação já foi executada.
- Não recomenda perguntar novamente o horário.
- `waiting_on` fica no cliente.
- Técnica compatível com espera/compromisso.
- MENSAGEM deve poder concluir que **nenhuma mensagem é necessária agora**.

### FAIL se

- repetir “qual horário você prefere?”;
- transformar pendência do cliente em ação do vendedor;
- gerar follow-up imediato sem evidência temporal.

Resultado: **NÃO EXECUTADO**

---

## Cenário 2 — “Minha irmã quer...”

### Conversa mínima

Contato atual: “Minha irmã quer fazer o plano anual. Como faço para ela começar?”

### PASS esperado

- conversa é comercial;
- contato atual aparece como interlocutor/intermediário;
- irmã aparece como prospect relacionado;
- CLIENTE não colapsa as duas pessoas;
- técnica favorece handoff/obtenção do contato ou próximo passo correto para a irmã;
- CRM não regride etapa.

### FAIL se

- tratar o interlocutor como prospect real sem distinguir a irmã;
- perder relevância comercial;
- inventar nome/dado da terceira pessoa.

Resultado: **NÃO EXECUTADO**

---

## Cenário 3 — Sem cartão

### Conversa mínima

Cliente demonstra intenção de compra, mas informa que não tem cartão ou limite suficiente.

### PASS esperado

- relevância comercial preservada;
- estágio compatível com negociação quando houver sinais de fechamento;
- AGORA identifica objeção/trava;
- ANÁLISE explica o risco e a técnica;
- Reasoning consulta condições de pagamento/fatos/objection guide publicados;
- MENSAGEM diagnostica a causa antes de inventar solução.

### FAIL se

- inventar forma de pagamento;
- assumir que “sem cartão” encerra a venda;
- despejar regra sem entender a trava;
- cair em `non_commercial`.

Resultado: **NÃO EXECUTADO**

---

## Cenário 4 — Cirurgia / congelamento

### Conversa mínima

Cliente cita cirurgia, limitação pessoal ou necessidade de congelamento/suspensão e pede orientação.

### PASS esperado

- empatia e investigação antes de prescrição;
- consulta às regras reais da empresa quando aplicável;
- separação entre orientação comercial e afirmação médica;
- técnica de discovery antes de solução;
- sem promessa ou inferência clínica.

### FAIL se

- responder com regra seca sem entender o caso;
- fazer diagnóstico médico;
- prometer exceção que não está publicada.

Resultado: **NÃO EXECUTADO**

---

## Cenário 5 — Plano + preço + link + objeção

### Conversa mínima

Há plano identificado, preço/valor, link de matrícula/pagamento e objeção atual.

### PASS esperado

- nunca classificar como conversa sem relevância comercial;
- estágio mínimo de negociação quando a jornada já está avançada;
- AGORA aponta a trava atual;
- ANÁLISE explica a situação, técnica e regras consideradas;
- MENSAGEM respeita o mesmo Reasoning e os hard gates;
- nenhuma afirmação não suportada.

### FAIL se

- `commercial_relevance != commercial`;
- estágio regressivo;
- técnica desconectada da objeção;
- texto genérico que serviria para qualquer lead.

Resultado: **NÃO EXECUTADO**

---

## Cenário 6 — Scroll não muda verdade

### Procedimento

1. abrir uma conversa já analisada;
2. registrar AGORA, ANÁLISE e CLIENTE;
3. rolar para mensagens antigas e voltar;
4. aguardar captura/estabilização;
5. comparar as três abas sem nova mensagem real;
6. depois enviar/receber uma nova mensagem real e repetir.

### PASS esperado

- somente scroll não altera verdade comercial, papéis, estágio ou decisão;
- mensagens históricas reaparecendo no DOM não ressuscitam estado antigo;
- nova mensagem real pode alterar a leitura;
- mesma conversa + mesmo estado = mesma leitura.

### FAIL se

- viewport alterar AGORA/ANÁLISE/CLIENTE;
- mensagem antiga observada depois substituir o momento atual;
- nova mensagem real não produzir atualização quando deveria.

Resultado: **NÃO EXECUTADO**

---

## Verificação transversal das quatro abas

### AGORA

- no máximo uma decisão principal e até dois sinais secundários;
- ação específica, não “continue a venda”;
- técnica/justificativa quando agregarem valor;
- silêncio quando não há ação útil.

### ANÁLISE

- estado da venda coerente;
- riscos, objeções e compromissos sem duplicação/confusão;
- avaliação da condução do vendedor;
- técnica e Company Knowledge coerentes com o caso.

### CLIENTE

- pessoa e papéis comerciais corretos;
- preferências/lacunas sem inventar memória durável inexistente;
- oportunidade atual subordinada ao entendimento da pessoa;
- terceiro/prospect corretamente separado.

### MENSAGEM

- mesma decisão/técnica do Commercial Reasoning;
- frase natural e específica para a conversa;
- seller voice preservada;
- pergunta já feita não é repetida;
- fatos e condições vêm apenas das fontes permitidas;
- vendedor revisa/edita antes de enviar;
- **zero auto-send**.

## Evidência a registrar por cenário

- conversa/ciclo usado;
- print de AGORA;
- print de ANÁLISE;
- print de CLIENTE quando aplicável;
- mensagem sugerida ou silêncio de MENSAGEM;
- comportamento antes/depois do scroll quando aplicável;
- PASS/FAIL;
- descrição objetiva da divergência quando FAIL.

## Decisão final

- Gate técnico: **PENDENTE DO SMOKE REAL**
- Gate comercial: **PENDENTE DO SMOKE REAL**
- FASE 16.9: **ABERTA**
- FASE 17: **BLOQUEADA**
