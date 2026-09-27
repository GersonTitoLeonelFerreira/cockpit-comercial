# YOLEN — Motor de Coaching Comercial

## FASE 6 — Integração, Evals e Homologação do MVP

Base: `main@b1b61c4d2fed72565b7313c2412e16790cdebd9d`.

Branch: `chatgpt/coaching-engine-phase-6-mvp-homologation`.

## 1. Objetivo

Fechar o Coaching Engine como um produto integrado, sem acrescentar uma nova autoridade comercial.

A Fase 6 é majoritariamente uma fase de prova:

- integração das Fases 0–5;
- regressões;
- neutralidade vertical;
- grounding;
- coerência entre AGORA, ANÁLISE e MENSAGEM;
- paridade WhatsApp/ManyChat;
- build/typecheck;
- critérios objetivos de homologação.

## 2. Pipeline homologado

`CompanionDiagnosticInput`

→ Seller Execution Trace

→ Sequence + Method Assessment

→ Commercial Techniques Engine

→ Commercial Reasoning

→ Coaching Diagnosis

→ Commercial Message Strategy

→ Message Generation + deterministic critic

→ customer-facing review.

Nenhuma etapa posterior pode redecidir situação, técnica ou conhecimento da empresa.

## 3. Matriz H01–H09

Arquivo canônico:

`docs/companion-v2/corpus/coaching-engine-phase6-homologation.json`.

Cobertura:

- software B2B;
- serviço de campo;
- consultoria;
- serviços genéricos;
- agendamento genérico;
- oportunidade de terceiro;
- sessão não comercial.

Não existe fixture de academia nesta matriz justamente para provar que o core não depende do primeiro vertical usado no piloto.

## 4. Gates comportamentais

### H01 — quebra de sequência + transplant test

Prova que uma intenção específica de demonstração sobrevive até o Message Strategy e que mensagem intercambiável é bloqueada.

### H02 — guided choice grounded

Prova que escolha guiada só é selecionada quando existem opções oficiais atuais.

### H03 — cliente fala pouco

Prova a separação entre:

- baixa confiança de contexto do cliente;
- alta confiança sobre execução observável do vendedor.

### H04 — intenção de fechamento

Prova que cliente pronto para contratar não é empurrado de volta para descoberta genérica e que o strategy permanece vertical-neutral.

### H05 — boa objeção

Prova que uma ação correta do vendedor gera elogio específico, não inventa ponto de melhoria e não seleciona novamente o mesmo diagnóstico de objeção enquanto a próxima resposta depende do cliente.

### H06 — espera disciplinada

Prova que uma escolha guiada já executada não é repetida enquanto a próxima ação está com o cliente.

### H07 — terceiro

Prova que interlocutor e prospect continuam distintos e que o handoff é selecionado.

### H08 — não comercial

Prova que reasoning silencioso continua sem objetivo comercial no Message Strategy.

### H09 — fato novo

Prova que a chegada de uma resposta do cliente invalida wait congelado e coaching stale.

## 5. Gate executável

Novo script:

`npm run gate:coaching-engine-mvp`.

Ele executa:

1. baseline/evals da Fase 0;
2. neutralidade vertical;
3. Seller Execution Trace;
4. Sequence/Method;
5. Techniques Engine;
6. Commercial Reasoning;
7. Coaching Diagnosis;
8. ANÁLISE;
9. Message Strategy;
10. MENSAGEM e single seller-facing authority;
11. homologação H01–H09;
12. renderer seller-facing;
13. paridade cross-channel WhatsApp/ManyChat;
14. `rm -rf .next/dev/types && next typegen && tsc --noEmit`.

A suíte E3 de paridade usa `--test-force-exit` porque o próprio harness carrega o `content-script.js` real, que mantém timers recorrentes intencionais de uma aba de navegador. A flag só é aplicada a essa suíte, depois que o test runner reporta os resultados.

Antes do `tsc --noEmit`, o gate remove apenas `.next/dev/types`, que é saída gerada de sessões anteriores de `next dev`, e então executa `next typegen` para regenerar os tipos de rota a partir da árvore atual do App Router. Isso impede que validators obsoletos continuem referenciando handlers que já não existem no código-fonte. Nenhum arquivo de source, configuração ou estado do Companion é removido.

O build Next.js continua sendo gate adicional de release:

`npm run build`.

## 6. Critérios de aprovação do MVP

O MVP só é homologado se:

- todos os gates acima passarem;
- build de produção passar;
- Vercel ficar verde;
- nenhum blocking violation da rubrica aparecer;
- nenhum fato protegido for inventado;
- nenhuma disponibilidade for fabricada;
- nenhuma mensagem contextual obrigatória passar pelo transplant test como genérica;
- não houver repetição imediata da ação do vendedor sem fato novo;
- não existir segundo motor seller-facing ativo;
- WhatsApp e ManyChat continuarem com o mesmo Core;
- ManyChat normal/prod continuar sem ativação de capture fora da autorização existente.

## 7. O que a Fase 6 não faz

Não adiciona:

- fine-tuning;
- aprendizado automático em produção;
- auto-send;
- regras específicas de academia;
- novo motor de reasoning;
- lógica comercial em adapters;
- mudança de CRM/Agenda.

Fine-tuning permanece opcional e só deve ser reavaliado depois dos resultados de homologação real.

## 8. Saída esperada

Ao final, o Coaching Engine deixa de ser apenas uma sequência de componentes implementados e passa a ter um gate único, repetível e multissetorial de MVP.
