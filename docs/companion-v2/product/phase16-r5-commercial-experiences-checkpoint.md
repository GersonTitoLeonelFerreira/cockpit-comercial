# FASE 16-R5 — Checkpoint de produto

## Objetivo

Transformar as falhas materiais observadas no smoke real da FASE 16.9 em experiências comerciais completas e avaliáveis. O gate deixa de perguntar apenas se o schema passou e passa a verificar se a orientação comercial está correta para aquela venda.

## Casos convertidos em experiências

| Caso | Antes / falha observada | Comportamento esperado pela R5 |
| --- | --- | --- |
| Agendamento aberto | O sistema podia tratar “falta horário” como pendência do vendedor mesmo depois de ele já ter oferecido opções. | Reconhecer que a pergunta já foi feita, manter a pendência e esperar o cliente sem repetir a ação. |
| Indicação da irmã | Interlocutor e prospect podiam ser colapsados na mesma pessoa. | Manter o contato atual como intermediário e a irmã como prospect relacionada; conduzir o handoff. |
| Sem cartão | A objeção podia receber solução genérica ou inventada. | Diagnosticar o bloqueio e consultar payment conditions, fatos oficiais e objection guide publicados. |
| Cirurgia / congelamento | Risco de despejar regra ou produzir resposta técnica superficial. | Investigar o caso antes de prescrever, respeitar limites da empresa e não fazer inferência médica. |
| Plano + link + objeção | Conversa com sinais fortes de compra podia cair em `non_commercial`. | Manter relevância comercial, estágio mínimo de negociação, tratar objeção e usar conhecimento real da empresa. |
| Scroll | A leitura podia mudar sem fato novo por causa do viewport. | Mesma conversa + mesmo estado = mesma verdade comercial; viewport não é fonte de verdade. |

## Dimensões avaliadas

Cada experiência declara explicitamente:

- relevância comercial;
- lado comprador;
- presença de prospect de terceiro;
- estágio mínimo;
- quem precisa agir agora;
- decisão comercial esperada;
- técnicas obrigatórias;
- fontes de conhecimento da empresa obrigatórias;
- comportamentos proibidos na orientação.

O scorer reprova o caso se qualquer dimensão obrigatória falhar. Um JSON válido, sozinho, não é PASS comercial.

## Critério de saída da R5

A R5 está pronta para merge quando:

1. os seis casos do smoke estão representados como experiências completas;
2. as técnicas esperadas existem na Commercial Intelligence Library;
3. o scorer reprova técnica errada, ausência de conhecimento obrigatório e orientação que repete comportamento proibido;
4. o build do branch passa;
5. a PR não adiciona scripts fixos como resposta principal nem uma segunda fonte de verdade comercial.

A R5 não redesenha ainda AGORA/ANÁLISE/CLIENTE/MENSAGEM. Esse consumo seller-facing pertence à R6.