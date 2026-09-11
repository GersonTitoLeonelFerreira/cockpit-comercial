# FASE 16-R6 — Seller-facing sobre o Commercial Reasoning

## Comportamento de produto que muda

AGORA, ANÁLISE, CLIENTE e MENSAGEM deixam de trabalhar como consumidores independentes de sinais comerciais e passam a compartilhar o mesmo Commercial Reasoning construído sobre a fotografia canônica da conversa.

## Antes → depois

### AGORA

**Antes:** Decision State dizia o que fazer, mas a UI não recebia a técnica, os limites e a justificativa do Commercial Brain.

**Depois:** a prioridade e a ação continuam vindo do Decision State canônico; o Reasoning acrescenta situação atual, técnica aplicável, `por que agora` e o que evitar. Nenhuma prioridade é recalculada no browser.

### ANÁLISE

**Antes:** mostrava estado da venda, riscos, objeções, compromissos e coaching, mas o repertório comercial da R3/R4 ainda não chegava ao vendedor.

**Depois:** preserva essas fontes canônicas e adiciona técnica, justificativa, limites e conhecimento publicado da empresa usado pelo Reasoning.

### CLIENTE

**Antes:** mostrava preferências, lacunas e contexto da oportunidade, mas não conseguia distinguir estruturalmente interlocutor, prospect, decisor, influenciador e beneficiário.

**Depois:** expõe os papéis persistidos pela R2. O caso “minha irmã quer...” pode mostrar o contato atual como intermediário e a irmã como prospect relacionado, sem colapsar as duas pessoas.

### MENSAGEM

**Antes:** o Message Intelligence Engine possuía sua própria estratégia/técnica antes de gerar a frase.

**Depois:** no runtime real, Commercial Reading + estado + Company Knowledge produzem o mesmo Commercial Reasoning usado pelas demais abas. Um adaptador alinha o `commercial_move` e a técnica do MIE ao Reasoning antes do Message Planner. Knowledge Resolver, hard gates, critic, factualidade, seller voice, allowlist e proibição de auto-send permanecem ativos.

## Regras preservadas

- viewport/DOM não é fonte de verdade;
- nenhuma escrita automática em CRM ou agenda;
- nenhuma mensagem é enviada automaticamente;
- MIE ativo continua controlado por allowlist e reversível;
- Company Knowledge continua vindo da configuração publicada;
- sessões comerciais silenciosas não recebem movimento artificial;
- presenters não criam uma segunda priorização;
- resposta pronta continua editável pelo vendedor no fluxo do WhatsApp antes do envio.

## Hierarquia seller-facing

A densidade continua limitada: decisão principal → explicação/técnica → detalhes secundários. O objetivo não é despejar o objeto de Reasoning na UI, mas traduzir apenas o que ajuda o vendedor a decidir e conduzir.

## Gate de saída da R6

A R6 pode ser integrada quando:

1. AGORA recebe Reasoning sem substituir sua priorização canônica;
2. ANÁLISE recebe técnica/justificativa/conhecimento sem duplicar riscos e coaching;
3. CLIENTE recebe papéis comerciais estruturados;
4. MENSAGEM alinha estratégia/técnica ao Reasoning antes de gerar;
5. silêncio comercial continua silêncio;
6. testes de renderização e estratégia passam;
7. build Vercel passa.

Depois do merge, o próximo passo obrigatório é **repetir o gate 16.9 em Firefox real**. A FASE 17 permanece bloqueada até esse smoke real passar.