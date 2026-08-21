# Contrato de Produto — Yolen Companion para o Vendedor

**Status:** fonte única de verdade do produto.
**Dono:** Controle Mestre (decide o que entra/sai; qualquer alteração de
escopo passa por este documento).
**Não é:** material de marketing, brainstorm de funcionalidades, ou lista de
tarefas técnicas. É a especificação de comportamento observável que qualquer
frente de desenvolvimento — humana ou IA — deve satisfazer para que uma
capacidade seja considerada parte do produto.

**Como usar este documento:** cada capacidade descrita aqui é avaliada contra
o código real da branch `main` em
[`companion-seller-gap-matrix.md`](./companion-seller-gap-matrix.md). Este
documento diz **o que deve existir**; a matriz diz **o que existe de fato,
com evidência**. Nenhuma capacidade deste contrato deve ser tratada como
concluída só porque está descrita aqui — só a matriz, com evidência de
código e teste, decide isso.

---

## 1. Princípio central

> "Hoje as pessoas abrem um CRM para trabalhar. No futuro, a Yolen deve
> trabalhar ao lado delas o dia inteiro, aparecendo apenas quando realmente
> puder ajudá-las a tomar uma decisão melhor."

Consequências diretas deste princípio, testáveis em qualquer capacidade nova:

1. **A Yolen não é um formulário.** Ela não existe para o vendedor preencher
   campos de CRM manualmente enquanto ela observa. Ela lê a conversa e
   participa da decisão.
2. **A Yolen não é um gerador de mensagens.** Escrever uma mensagem sugerida
   é a *última* coisa que ela faz, não a primeira. Antes disso, ela precisa
   entender a venda.
3. **A Yolen sabe ficar quieta.** Silêncio é um resultado válido e frequente,
   não uma falha. Uma conversa sem relevância comercial deve produzir uma
   resposta explícita de "nada a fazer aqui", nunca uma tentativa forçada de
   gerar valor.
4. **O objetivo final é vender melhor, não movimentar registros.** CRM e
   Agenda são consequências administrativas de uma leitura comercial
   correta — nunca o objetivo em si. Uma capacidade que move o CRM
   corretamente mas não ajuda o vendedor a entender a venda não cumpre o
   princípio central, mesmo que os campos estejam certos.

Qualquer capacidade avaliada na matriz de completude que viole um destes
quatro pontos deve ser sinalizada como desvio do princípio central, mesmo
que tecnicamente funcione.

---

## 2. As perguntas que o vendedor precisa conseguir responder

Ao abrir uma conversa no WhatsApp, a Yolen precisa ser capaz de ajudar o
vendedor a responder às perguntas abaixo. Elas estão agrupadas por tema; cada
grupo corresponde a um dos contratos das seções 5–11.

### 2.1 O que está acontecendo (leitura da conversa)
- O que está acontecendo nesta venda?
- O cliente realmente está falando de uma venda agora, ou é uma conversa
  pessoal/administrativa sem relevância comercial?
- O que ele quer? Qual problema ele possui?
- O que ainda não descobri sobre ele?
- O que ele valoriza? O que influencia a decisão dele?
- Quais objeções estão abertas? O que já foi resolvido?
- Em que ponto da venda estamos?

### 2.2 Método e condução
- Em que ponto do método comercial estamos?
- Eu estou conduzindo conforme o método? Eu saí do método? Onde saí? Como
  volto?
- O que fiz corretamente? Onde errei? Por que isso foi um erro? Como
  corrijo?

### 2.3 Tempo e risco
- O cliente está esperando por mim? Há quanto tempo?
- Estou demorando demais?
- Essa oportunidade está parada?

### 2.4 Histórico e relação
- O que já aconteceu com esse cliente?
- Há quanto tempo estamos conversando?
- Como esse cliente costuma se comunicar?

### 2.5 Decisão de ação
- Qual deve ser minha melhor condução agora?
- Eu realmente preciso responder? O que eu poderia responder?
- CRM precisa mudar? Agenda precisa mudar? Ou a Yolen deve simplesmente
  ficar quieta?

Uma capacidade que não ajuda a responder a nenhuma destas perguntas não
pertence a este contrato de produto — deve ser avaliada como pertencente a
outro produto (ex.: inteligência gerencial, ver seção 15).

---

## 3. Regra de interpretação — a ordem importa

O produto precisa **entender a conversa antes de administrar a venda**. A
ordem abaixo é normativa: uma implementação que pula etapas (por exemplo,
que decide mudar o CRM antes de confirmar relevância comercial) está fora
do contrato, mesmo que o resultado final pareça correto por coincidência.

```
CONVERSA
  ↓
COMPREENSÃO DO QUE ESTÁ ACONTECENDO
  ↓
RELEVÂNCIA COMERCIAL
  ↓
  ├─ SE NÃO COMERCIAL → SILÊNCIO OPERACIONAL
  │                       (ver seção 5.2)
  │
  └─ SE COMERCIAL → LEITURA DA VENDA
                       ↓
                     COACHING
                       ↓
                     MÉTODO
                       ↓
                     RISCO
                       ↓
                     MELHOR CONDUÇÃO
                       ↓
                     SOMENTE NO FINAL:
                     CRM / AGENDA / MENSAGEM
```

### 3.1 Regras de não-inferência (o que NÃO conta como venda)

- **Compromisso não significa compromisso comercial.** Um "combinado" pode
  ser social, familiar, ou logístico.
- **Data não significa Agenda comercial.** Uma data mencionada pode ser
  aniversário, feriado, ou qualquer evento não relacionado à venda.
- **Horário não significa Agenda comercial**, pelo mesmo motivo.
- **A existência da pessoa no CRM não torna toda conversa dela comercial.**
  Um contato cadastrado pode mandar uma mensagem pessoal a qualquer momento;
  isso não reabre ou avança a oportunidade automaticamente.

Qualquer capacidade que gere sugestão de CRM/Agenda a partir de um desses
sinais isolados, sem relevância comercial confirmada, viola este contrato.

---

## 4. Vocabulário canônico — como isto se traduz em contratos de dados

Este documento é escrito em linguagem de produto. A matriz de completude
mapeia cada conceito abaixo para o tipo TypeScript real que deveria
implementá-lo. Referência rápida (nomes completos de arquivo em
`app/lib/companion/`, salvo indicação contrária):

| Conceito de produto | Tipo/contrato candidato no código |
|---|---|
| Relevância comercial | `CompanionDiagnostic.commercial_relevance` (`diagnostic-contract.ts`) |
| Leitura da venda | `CommercialReading` (`commercial-reading-contract.ts`) |
| Memória persistente entre ciclos | `StatefulCommercialState` (`stateful-commercial-state.ts`) |
| Método comercial e aderência | `CommercialReadingMethod` / `CommercialReadingMethodStage` |
| Inteligência do cliente | `CommercialReadingCustomer` |
| Coaching do vendedor | `CommercialReadingSellerStrength[]` / `CommercialReadingImprovementPoint[]` (V2) e `AICoaching` (V1, `app/types/ai-coaching.ts`) |
| Melhor condução | `CommercialReadingBestApproach` |
| Mensagem sugerida | `CommercialReadingCommunication.recommended_message` (V2) / `AICoaching.suggested_message` (V1) |
| Sugestão de CRM | `CommercialReadingCrmSuggestion` |
| Sugestão de Agenda | `CommercialReadingAgendaSuggestion` |
| Telemetria de ação do vendedor | `CompanionActionType` (`action-events-contract.ts`) |

Nenhum destes tipos, por si só, prova que a capacidade chega ao vendedor —
isso depende de estar realmente ligado ao runtime ativo e de a extensão
renderizar o campo. Ver matriz de completude para o veredito por capacidade.

---

## 5. Contrato do Painel Principal

O painel principal é o que aparece por padrão ao lado da conversa do
WhatsApp, sem o vendedor precisar abrir nada. Ele deve ser capaz de
apresentar, quando aplicável:

| Campo | Comportamento observável exigido |
|---|---|
| **Momento atual** | Uma frase curta e semanticamente correta do que está acontecendo agora na conversa (não um resumo de todo o histórico). |
| **Método** | O nome da etapa atual do método comercial configurado para a empresa, quando um método está configurado. |
| **Aderência** | Um indicador binário/qualitativo de se a conversa continua dentro do método configurado. |
| **Atenção / risco** | Aparece **somente** quando há algo realmente relevante (objeção não tratada, cliente aguardando, saída de método). Ausência de risco = ausência do campo, não um campo vazio genérico. |
| **Próximo passo** | A melhor condução recomendada, apresentada apenas quando existe uma condução concreta a sugerir. |
| **Mensagem sugerida** | Aparece somente quando agrega valor real — nunca uma mensagem genérica preenchendo espaço. |

### 5.1 Estado de silêncio operacional

Quando a conversa não tem relevância comercial (ver seção 3), o painel deve
ser capaz de mostrar um estado equivalente a:

> "Conversa sem evidência comercial relevante."
> "Nenhuma ação comercial necessária."

Neste estado:
- Nenhuma mensagem de venda é sugerida.
- Nenhum avanço de CRM/Agenda é proposto.
- O estado é visualmente distinto de "carregando" ou "erro" — é um resultado
  positivo e esperado, não uma ausência de dados.

---

## 6. Contrato da Análise Completa (visão detalhada)

Quando o vendedor abre a visão detalhada, o produto deve ser capaz de
mostrar, **quando houver evidência real na conversa** (nunca inventado):

### 6.1 Sobre a conversa
- Resumo da conversa.
- Contexto inicial (como a conversa começou).
- Evolução (o que mudou desde o início).
- Momento atual.
- Último pedido ou decisão do cliente.

### 6.2 Sobre o cliente
- Necessidades.
- Interesses.
- Problemas.
- Impactos (consequência dos problemas para o cliente).
- Critérios de decisão.
- Preferências.
- Perguntas em aberto.
- Objeções.
- Incertezas.
- Sinais (comerciais, não classificados em outra categoria).
- Concorrentes mencionados.
- Produto/serviço de interesse.
- Compromissos (assumidos por qualquer uma das partes).

### 6.3 Sobre o vendedor
- Acertos (concretos, com evidência — nunca elogio genérico).
- Erros (concretos, com evidência).
- Pontos de melhoria.
- Impacto de cada erro.
- Como corrigir cada erro.
- Perguntas do cliente que foram ignoradas.
- Descoberta insuficiente (avançou sem entender o suficiente).
- Pressão excessiva sobre o cliente.
- Repetição (perguntar de novo algo já respondido).
- Promessa arriscada (compromisso que pode não se sustentar).
- Informação incorreta transmitida ao cliente.
- Apresentação prematura (antes de entender a necessidade).
- Preço prematuro (antes de estabelecer valor).

### 6.4 Regra de qualidade da avaliação

**Nunca aceitar elogio genérico como "bom atendimento" sem evidência
concreta.** Toda afirmação sobre o vendedor (seção 6.3) e sobre o cliente
(seção 6.2) precisa apontar para uma ação, frase, ou evento específico da
conversa — não uma impressão geral.

Este requisito já existe como invariante de código no contrato V2
(`normalizeSellerStrengths` em `commercial-reading-contract.ts` rejeita
explicitamente variações de "bom atendimento"/"ótimo atendimento" sem
evidência) — a matriz de completude verifica se essa mesma disciplina se
aplica em todos os caminhos que geram avaliação do vendedor, não só no V2.

---

## 7. Contrato do Método Comercial

O Companion deve conseguir representar:

- Se um método está configurado para a empresa.
- As etapas do método, em ordem.
- Qual etapa está: concluída, em andamento (parcial), não iniciada, ou não
  aplicável a esta conversa.

### 7.1 Aderência ao método

Não basta dizer "etapa atual: Diagnóstico". A Yolen precisa ajudar a
**conduzir corretamente**. Isso significa que o produto deve ser capaz de
declarar um dos dois estados:

- **"Dentro do método."**
- **"A conversa saiu do método."** — e, quando este for o caso, explicar:
  - onde saiu (qual etapa foi pulada ou mal executada);
  - o que aconteceu (evidência concreta);
  - o que faltou;
  - qual o impacto disso na venda;
  - como voltar corretamente ao método a partir daqui.

Uma implementação que apenas relata a etapa atual sem avaliar aderência não
satisfaz este contrato.

---

## 8. Contrato da Inteligência do Cliente

O produto precisa de uma experiência consolidada — conceitualmente um
"botão CLIENTE" — que reúna, em um único lugar, tudo que se sabe sobre o
cliente daquela oportunidade. O nome da interface pode mudar; a capacidade é
obrigatória. Ela reúne:

- Objetivo do cliente.
- Necessidades, problemas, impactos.
- Interesses, critérios de decisão, preferências.
- Objeções e dúvidas.
- Produtos discutidos e concorrentes mencionados.
- Compromissos.
- Histórico comercial relevante (ver seção 9).

### 8.1 Comunicação observada

A Yolen pode registrar **padrões de comunicação observados diretamente na
conversa**, com exemplos aceitáveis como:

- "Responde de forma objetiva."
- "Costuma fazer perguntas diretas."
- "Prefere dados concretos."
- "Responde melhor a mensagens curtas."
- "Não respondeu bem a pressão."

### 8.2 Limite explícito — o que NÃO fazer

Proibido, sem exceção:
- Diagnóstico psicológico do cliente.
- Perfil de personalidade inventado (ex.: categorização tipo DISC sem base
  textual).
- Qualquer característica não sustentada diretamente pelas conversas
  registradas.

Toda afirmação em "comunicação observada" precisa ser rastreável a uma
evidência concreta da conversa, exatamente como as afirmações da seção 6.

---

## 9. Histórico da Relação

O vendedor deve conseguir saber, quando a informação existir:

- Primeiro contato conhecido.
- Há quanto tempo a oportunidade existe.
- Tempo total em conversa.
- Última mensagem do cliente.
- Última mensagem do vendedor.
- Quantidade de interações, quando mensurável.
- Eventos comerciais importantes.

### 9.1 Linha do tempo desejada

```
primeiro contato
  ↓
necessidade descoberta
  ↓
apresentação
  ↓
preço
  ↓
objeção
  ↓
follow-up
  ↓
compromisso
  ↓ (etc., conforme a conversa real)
```

Esta linha do tempo é ilustrativa da granularidade esperada — a
implementação real reflete os eventos que de fato ocorreram na conversa, não
um checklist fixo que todo cliente precisa cumprir.

### 9.2 Ações da própria Yolen

Quando a telemetria permitir, o histórico também deve poder mostrar as ações
que a própria Yolen tomou e como o vendedor reagiu a elas:

- Sugestão mostrada.
- Sugestão copiada.
- Sugestão inserida no campo de mensagem.
- Sugestão ignorada.
- Sugestão editada antes de enviar.
- Sugestão enviada como está.
- CRM aceito / CRM rejeitado.
- Agenda aceita / Agenda rejeitada.

---

## 10. Tempo, SLA e Risco

O Companion deve conseguir distinguir três situações diferentes:

1. **Cliente aguardando o vendedor** — o cliente enviou a última mensagem e
   ainda não houve resposta.
2. **Vendedor aguardando o cliente** — o vendedor respondeu e aguarda
   retorno.
3. **Oportunidade parada** — nenhuma das partes está agindo há tempo
   suficiente para configurar risco de abandono.

Exemplo de comportamento observável esperado:

> "Cliente aguarda resposta há 2h47."

Quando existir uma regra de SLA configurada para a empresa:

> "Tempo esperado: 1h."
> "Atraso: 1h47."
> "Risco por demora: alto."

### 10.1 Regra de honestidade estatística

**Proibido inventar percentual de risco** (ex.: "72% de chance de perder")
sem base estatística real calibrada com dados da própria operação.
Probabilidade futura só pode ser apresentada quando existirem dados
suficientes para calibração — caso contrário, o produto deve usar
classificações qualitativas (baixo/médio/alto), nunca um número que sugere
precisão que não existe.

---

## 11. Alertas

Alertas devem existir **somente quando úteis**. Exemplos de gatilhos
válidos:

- Cliente aguardando.
- SLA estourando.
- Oportunidade parada.
- Pergunta do cliente ignorada.
- Objeção ainda não tratada.
- Vendedor saiu do método.
- Pressão excessiva.
- Repetição.
- Promessa não sustentada.
- Informação contraditória.
- Compromisso vencendo.
- Próximo passo relevante disponível.

**Regra central: evitar excesso de alertas. Silêncio é comportamento
válido.** Um painel que gera alerta a cada análise, independentemente de
haver algo relevante, viola este contrato tão gravemente quanto um painel
que nunca alerta.

---

## 12. Segurança — invariantes permanentes

As invariantes abaixo não são negociáveis e não podem ser revertidas por
nenhuma capacidade nova, por mais valiosa que pareça:

1. CRM nunca é alterado automaticamente — sempre requer confirmação humana
   explícita.
2. Agenda nunca é alterada automaticamente — sempre requer confirmação
   humana explícita.
3. Toda sugestão operacional (CRM/Agenda) exige confirmação humana antes de
   se tornar realidade no sistema.
4. Isolamento por `company_id` em toda leitura e escrita — nenhum dado
   cruza empresas.
5. Toda afirmação sobre a conversa precisa de evidência (mensagem ou memória
   persistida referenciável) — nunca invenção.
6. Estado stateful (V2) só é exposto ao vendedor depois de confirmada a
   persistência — nunca antes.
7. Existe fallback seguro (V1) para quando o motor mais avançado falha,
   trava, ou estoura o orçamento de tempo do ciclo (ver
   `docs/companion-v2/PHASE_5_1_STATEFUL_COPILOT.md` e o deadline de ciclo
   descrito em `stateful-copilot-cycle-deadline.ts`).
8. Proibido inventar preço.
9. Proibido inventar desconto.
10. Proibido inventar promessa que o vendedor/empresa não fez.
11. Proibido inventar produto que não foi discutido.
12. Proibido inverter o papel comercial — nunca tratar o cliente comprador
    como se fosse fornecedor, ou vice-versa, sem evidência clara do papel
    real na conversa.

---

## 13. Fora de escopo deste contrato

- **Inteligência Gerencial** (`app/lib/companion/managerial-intelligence-contract.ts`
  e arquivos `managerial-*`): é uma camada de agregação sobre múltiplos
  vendedores/ciclos, destinada a um gestor, com escopo definido por
  `company_id` + período + time/vendedor. Consome sinais que se originam do
  Companion (ex.: eventos de ação, leitura comercial), mas seu contrato de
  produto é separado — não faz parte da experiência de UM vendedor dentro de
  UMA conversa. Uma futura auditoria de "Yolen para Gestores" deve tratar
  isso à parte.
- **P1-03 (`INVALID_COMMUNICATION_OUTPUT`)** e **P1-04 (relevância
  comercial na produção)**: são bugs/lacunas conhecidos, tratados em ondas
  próprias pela Frente 1. Este contrato descreve o comportamento correto
  (seção 3, "relevância comercial" antes de qualquer ação); a matriz de
  completude registra o estado real desses itens sem alterá-los.
- Extensão de captura (mecanismos de leitura do WhatsApp Web, resiliência de
  captura, transcrição de áudio): são infraestrutura que alimenta este
  contrato, não capacidades de produto descritas aqui — auditados na matriz apenas
  como evidência de que os dados chegam à análise.

---

## 14. Critério de "pronto"

O Yolen Companion só pode ser chamado de pronto para uma capacidade quando,
simultaneamente:

1. Existe um contrato de dados validado (tipo TypeScript com normalização e
   invariantes).
2. Existe um runtime que produz esse dado a partir de conversas reais.
3. O runtime está de fato ligado ao caminho de produção usado pela maioria
   das empresas (não apenas um piloto de uma empresa, nem um endpoint de
   preview).
4. A extensão renderiza esse dado para o vendedor de forma que ele consiga
   agir sobre ele.
5. Existe teste determinístico cobrindo o comportamento (incluindo os casos
   de ausência/silêncio, não só o caminho feliz).
6. As invariantes de segurança da seção 12 estão verificadas para essa
   capacidade especificamente.

A falta de qualquer um destes seis pontos classifica a capacidade como não
concluída na matriz de completude, mesmo que os outros cinco estejam
satisfeitos.
