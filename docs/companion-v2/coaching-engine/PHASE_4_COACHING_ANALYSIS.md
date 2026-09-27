# YOLEN — Motor de Coaching Comercial

## FASE 4 — Coaching Engine + ANÁLISE

Base: `main@2367cb2f3105bd6867b443b4f164bc700fb666a0`.

Branch: `chatgpt/coaching-engine-phase-4-analysis`.

## 1. Missão

Transformar Seller Execution Trace + sequência/método + técnicas aplicáveis em um diagnóstico estruturado de coaching para a aba ANÁLISE.

A Fase 4 não gera mensagem de venda.

ANÁLISE continua informativa.

## 2. Contrato de diagnóstico

Novo contrato:

`commercial-coaching-diagnosis-v1`

Ele expõe:

- confiança de contexto do cliente;
- confiança sobre execução observável do vendedor;
- objetivo comercial atual;
- intenção atual do cliente;
- último movimento válido do vendedor;
- principal acerto;
- principal ajuste;
- quebra de sequência;
- estado do método;
- técnica selecionada;
- próximo objetivo;
- restrições;
- proveniência por message IDs e memory IDs.

## 3. Regra central

> Pouca fala do cliente não pode significar pouca análise do vendedor.

O diagnóstico separa:

- `client_context_confidence`;
- `seller_execution_confidence`.

Assim, uma conversa com poucas palavras do cliente pode continuar produzindo coaching forte quando existe evidência suficiente das ações do vendedor.

## 4. Hierarquia de evidência

### Principal acerto

Prioridade:

1. `CommercialReading.seller_strengths` já validado;
2. fallback determinístico do Seller Execution Trace para ações observáveis como descoberta, probe de objeção e avanço de agenda.

Nunca existe elogio genérico sem ação outgoing comprovada.

### Principal ajuste

Prioridade:

1. quebra estrutural comprovada no trace;
2. avanço/prescrição prematura;
3. descoberta tardia depois de intenção de fechamento;
4. repetição sem fato novo;
5. `CommercialReading.improvement_points` quando não conflita com responsabilidade atual.

## 5. Sequência

Quando existe quebra, o diagnóstico registra:

- que houve quebra;
- o que mudou;
- por que isso prejudica;
- evidência.

Exemplo transversal:

cliente quer agendar demonstração → vendedor pergunta quando → cliente não responde → vendedor muda para apresentação de pacotes.

O motor não precisa saber se isso é academia, software, consultoria ou serviço técnico.

## 6. Mesmo snapshot, mesma autoridade

`canonical-seller-reasoning-source.ts` agora expõe um bundle:

- Commercial Reasoning reconciliado;
- `diagnostic_input` usado para construí-lo.

A API antiga `loadCanonicalSellerReasoning()` continua existindo e retorna somente `bundle.reasoning`.

ANÁLISE usa o bundle para construir coaching sem recarregar uma segunda fotografia e sem criar outro cérebro comercial.

## 7. Seller-facing ANÁLISE

A aba ganha um resumo `Leitura da condução` antes dos detalhes existentes.

Ela mostra, quando sustentado:

- objetivo comercial agora;
- principal acerto;
- principal ajuste;
- próximo objetivo.

Em disclosure secundário:

- intenção atual do cliente;
- último movimento válido do vendedor;
- técnica selecionada;
- quebra de sequência;
- confiança separada cliente/vendedor;
- restrições.

As seções antigas de Acertos, Pontos de melhoria, Método, riscos e histórico continuam existindo como detalhe.

## 8. Neutralidade vertical

O gate da Fase 4 usa cenários de:

- agendamento de demonstração;
- venda consultiva genérica;
- software B2B;
- visita de serviço.

Conhecimento específico do setor continua entrando somente por contexto configurado.

## 9. Ownership

ANÁLISE não:

- insere mensagem;
- copia mensagem;
- envia mensagem;
- altera CRM;
- altera Agenda;
- inventa disponibilidade;
- reclassifica identidade;
- lê DOM como fonte comercial.

MENSAGEM continuará dona de geração/cópia/inserção na Fase 5.

## 10. Gate de saída

A Fase 4 está pronta quando:

1. Fases 0–3 permanecem verdes;
2. coaching diagnosis separa confiança cliente/vendedor;
3. C01 mostra acerto + quebra + correção com evidência;
4. fato novo remove coaching congelado;
5. business-agnostic continua verde;
6. ANÁLISE recebe o mesmo snapshot do reasoning;
7. resumo aparece antes do detalhamento;
8. nenhum comportamento de envio é introduzido na ANÁLISE.

Próxima fase: Fase 5 — Message Strategy + MENSAGEM.
