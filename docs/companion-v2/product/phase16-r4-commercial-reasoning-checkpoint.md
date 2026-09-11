# FASE 16-R4 — Checkpoint de produto

## Mudança de comportamento

A Yolen deixa de ter apenas leitura + orientação isolada e passa a montar um **Commercial Reasoning estruturado**: decisão atual, objetivo, técnicas relevantes, conhecimento real da empresa, limites, avaliação já evidenciada da conduta do vendedor e comparação objetiva entre a situação atual e o repertório disponível.

O contrato não expõe cadeia interna de pensamento. Ele registra apenas fatores consumíveis pelo produto: decisão, justificativa, técnica aplicável, riscos, conhecimento usado, evidências e limitações.

## Caso 1 — objeção de pagamento

**Entrada canônica:** Commercial Reading identifica objeção ligada a pagamento; Cycle State preserva memória; Commercial Config contém produto, regra/fato vigente e objection guide.

**Saída esperada:**

- decisão continua coerente com `best_approach` da leitura;
- `technique.objection_diagnosis` aparece como técnica aplicável;
- regras/fatos/produto/objection guide da empresa podem ser selecionados como conhecimento relevante;
- limites publicados aparecem em `do_not_do`/diferenças;
- a Yolen não inventa forma de pagamento.

## Caso 2 — indicação da irmã

**Entrada canônica:** fatos `commercial_party.current_contact.intermediary` + `commercial_party.related.prospect`.

**Saída esperada:** `technique.third_party_handoff` ganha relevância. A decisão pode pedir clarificação/passagem para o prospect real sem atribuir objetivos, objeções ou compromissos à pessoa errada.

## Caso 3 — cliente disse que vai verificar o cartão

**Entrada canônica:** compromisso/espera comprovados e `best_approach=wait`.

**Saída esperada:** `technique.commitment_wait` + anti-padrão `repeat_completed_action`. A camada estruturada explicita que não se deve repetir ação já feita apenas para gerar movimento artificial.

## Caso 4 — sessão não comercial

**Saída esperada:** `status=silent`, `decision=no_intervention`, nenhuma técnica de avanço nem conhecimento comercial selecionado. O contexto permanece preservado, mas a camada não força venda.

## Fronteiras arquiteturais

- Commercial Reading continua sendo a fonte da leitura atual, coaching e `best_approach`.
- Cycle State continua sendo a memória do ciclo.
- Commercial Intelligence Library fornece repertório e conhecimento publicado.
- Commercial Reasoning apenas combina essas fontes; não cria segunda verdade comercial.
- Presenters seller-facing não devem reconstruir ranking nem escolher técnicas localmente.
- A formulação da mensagem continua fora deste contrato.
