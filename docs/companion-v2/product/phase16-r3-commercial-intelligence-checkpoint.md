# FASE 16-R3 — Checkpoint de produto

## Mudança de comportamento

A Yolen passa a ter um repertório comercial estruturado e consultável. O repertório descreve **como pensar uma situação**, quando uma técnica ajuda, quando atrapalha, quais riscos existem e quais regras oficiais da empresa precisam prevalecer. Ele não fornece respostas fixas para copiar.

## Exemplo 1 — objeção "sem cartão"

**Situação:** cliente demonstra objeção de pagamento.

**Biblioteca geral relevante:** `technique.objection_diagnosis`.

**Conhecimento da empresa relevante:** objection guide publicado, fatos oficiais vigentes e `payment_conditions` do produto realmente discutido.

**Expected:** reasoning futuro deve primeiro entender qual é o bloqueio real e só depois usar uma alternativa autorizada. A técnica geral não pode inventar Pix, cartão pré-pago, desconto ou qualquer outra condição que a empresa não tenha publicado.

## Exemplo 2 — vendedor já perguntou o horário

**Situação:** vendedor já fez a pergunta necessária e agora a resposta está com o cliente.

**Biblioteca geral relevante:** `technique.commitment_wait` e `anti_pattern.repeat_completed_action`.

**Expected:** a Yolen reconhece que a pendência da venda não significa pendência de ação do vendedor. Evita repetir a mesma pergunta e só volta a intervir por fato novo ou vencimento da condição de espera.

## Exemplo 3 — indicação da irmã

**Situação:** interlocutor fala por um prospect real diferente.

**Biblioteca geral relevante:** `technique.third_party_handoff`.

**Expected:** preservar o interlocutor como intermediário, obter/organizar a passagem para o prospect correto e impedir que objetivos, objeções ou compromissos sejam atribuídos à pessoa errada.

## Escopo e isolamento

- itens `general` não carregam `company_id` nem `product_id`;
- itens `company` só são visíveis para a empresa que publicou o conhecimento;
- itens `product` exigem `company_id` + `product_id` e só entram no ranking quando o produto está no contexto da consulta;
- fatos expirados não entram na biblioteca ativa;
- conhecimento específico recebe vantagem de ranking apenas depois de passar o filtro de identidade.

## Anti-FAQ

O contrato deliberadamente não possui `suggested_message`, `script`, `answer` ou resposta pronta como campo principal. Cada entrada contém objetivo, situações, sinais, `when_to_use`, `when_not_to_use`, riscos e exemplos de **aplicação do princípio**. A formulação seller-facing continua sendo responsabilidade das fases seguintes de reasoning e mensagem.
