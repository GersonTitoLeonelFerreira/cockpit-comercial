# Companion — Sales Expert Wave 4

## Objetivo

Elevar a qualidade comercial seller-facing depois do live test da 1.3.0. Esta onda não cria outro Core e não muda a arquitetura multicanal. Ela fecha quatro lacunas: coerência do coaching, bloqueio real do método, qualidade da mensagem e consolidação da ANÁLISE.

## 1. Coaching sem elogio contraditório

Uma ação que causou quebra de sequência ou avanço prematuro não pode continuar aparecendo como `Principal acerto`, mesmo quando o Commercial Reading referencia outra mensagem ou descreve a mesma ação com linguagem positiva.

O gate agora cruza:
- evidência por message_id;
- tipo de ação do Seller Execution Trace;
- conteúdo semântico do elogio (oferta, preço, plano, apresentação, proposta etc.);
- erro determinístico e sequence break.

## 2. Método: primeiro bloqueio obrigatório comprovado

O método `commercial-method-v2` já diferencia etapas `required`, `conditional` e `optional`; sua ordem é referência de progressão, não checklist rígido.

Quando a execução avança e existe uma etapa anterior obrigatória ainda `partial`, essa etapa passa a ser o bloqueio prioritário. Uma etapa posterior apenas `not_started` não pode esconder um requisito anterior já parcialmente evidenciado.

Exemplo de regressão:
- Descoberta: required + partial;
- Tour: required + not_started;
- Apresentação: active;
- deviation marker aponta para Tour;
- recomendação correta: Descoberta, porque é o primeiro bloqueio obrigatório já comprovadamente incompleto.

## 3. Message Critic de qualidade

Além de tamanho, repetição semântica, pressão e technique mismatch, o critic passa a reprovar:
- `generic_filler`: fechamento vazio como `fico à disposição` ou `posso ajudar com o que for necessário` quando não adiciona ação;
- `weak_microcommitment`: retomada que usa a única pergunta em `tudo bem?` e não transforma o objetivo comercial em uma pergunta clara.

Retomada aprovada deve ter um único microcompromisso claro e natural.

## 4. Naturalidade e identidade

O nome canônico continua vindo do lead. A saudação agora reconhece nome completo para validação, mas em WhatsApp usa primeiro nome por padrão. Nome completo só é aceitável quando o tom da estratégia realmente exigir formalidade.

Relações familiares/terceiros específicos (marido, esposa, irmã, sócio etc.) também passam por grounding. O gerador não pode inventar uma relação que não exista no contexto canônico.

## 5. ANÁLISE com uma autoridade principal

Quando existe Coaching Diagnosis canônico:
- o header legado de oportunidade deixa de competir com o coaching principal;
- o resumo de aderência do método é reescrito quando contradiz a direção de recuperação;
- detalhes do método permanecem em progressive disclosure.

## Aceite

Antes de merge:
- gate `gate:coaching-engine-mvp` integralmente verde;
- E3 cross-channel parity verde;
- `next typegen` e `tsc --noEmit` verdes;
- production build verde ou Vercel verde;
- build identificável `1.4.0` para o próximo live test.