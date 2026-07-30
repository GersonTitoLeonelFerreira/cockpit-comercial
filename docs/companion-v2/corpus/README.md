# Corpus de regressão do Yolen Companion V2

## Objetivo

Este diretório transforma o contrato funcional da Fase 1 em conversas sintéticas
e verificáveis. O corpus define o diagnóstico esperado antes da criação do motor
V2.

O corpus:

- não chama IA;
- não grava no Supabase;
- não altera o Companion V1;
- não executa mudança no CRM;
- não usa conversas reais.

O contrato completo está em
`docs/companion-v2/PHASE_1_FUNCTIONAL_CONTRACT.md`.

## Arquivo canônico

`cases.json` é o oráculo funcional. A versão 2 contém:

| Item | Quantidade |
|---|---:|
| Conversas totais | 30 |
| Casos anteriores preservados | 14 |
| Casos novos | 16 |
| Coberturas obrigatórias | 28 |

Cada caso registra:

- contexto sintético de método e produto;
- etapa inicial do CRM;
- mensagens com identidade, versão, sequência, direção e estado;
- distinção entre mensagem atual e contexto histórico;
- estado e limitações da análise;
- relevância e confiança;
- intenção, necessidades e informações ausentes;
- perguntas ignoradas e objeções ativas;
- avaliação do vendedor;
- avanço no método comercial;
- adequação da solução;
- orientação e eventual pergunta ou mensagem;
- sugestão de CRM com confirmação humana;
- evidências que sustentam as conclusões.

## Cobertura comercial

O corpus cobre, entre outros:

- ganho e perda explícitos;
- agenda aceita pelo cliente;
- negociação e ausência de resposta;
- edição e exclusão;
- áudio transcrito e sem transcrição;
- conversa pessoal e conversa sobre pizza;
- pergunta de preço sem diagnóstico;
- horário de funcionamento respondido;
- pergunta ignorada;
- pergunta respondida e repetida;
- apresentação prematura;
- bom diagnóstico;
- objeção de contrato;
- comparação com concorrente;
- “vou pensar”;
- “eu retorno” sem data;
- proposta enviada;
- falta de interesse;
- histórico antigo carregado;
- várias mensagens no mesmo minuto;
- contexto comercial insuficiente.

## Significado do oráculo

Os principais blocos são:

| Bloco | Significado |
|---|---|
| `analysis_status` | Análise completa, limitada ou bloqueada |
| `analysis_limitations` | Limitações declaradas, nunca escondidas |
| `commercial_relevance` | Comercial, não comercial ou incerta |
| `customer_intent` | Intenção comprovada do cliente ou `null` |
| `needs` | Necessidades sustentadas por evidência |
| `missing_information` | O que ainda precisa ser descoberto |
| `unanswered_questions` | Perguntas do cliente que continuam abertas |
| `active_objections` | Objeções ainda ativas no desfecho |
| `seller_assessment` | Acertos e riscos comprovados do vendedor |
| `sales_method` | Etapa, avanços e saltos do método configurado |
| `solution_fit` | Adequação comprovada, parcial, incompatível ou desconhecida |
| `guidance` | Necessidade de intervenção e próximo movimento |
| `crm_suggestion` | Recomendação explicável, sempre sujeita a confirmação |
| `evidence_message_ids` | Mensagens atuais que sustentam a conclusão |

## Regra de segurança do CRM

O campo antigo `apply_crm_change` foi removido.

O contrato usa:

```text
crm_suggestion.should_change_crm_stage
```

Esse campo apenas informa se existe evidência para recomendar mudança. Todo caso
possui:

```text
crm_suggestion.requires_human_confirmation = true
```

Nenhum campo do corpus aplica etapa, agenda, ganho ou perda.

## Regras de anonimização

- todo conteúdo é sintético;
- nomes, telefones, e-mails, CPF/CNPJ e endereços reais são proibidos;
- participantes são identificados somente pela direção da mensagem;
- datas e horários existem apenas para testar ordem e lógica temporal;
- transcrições de áudio são sintéticas.

## Validação

Execute:

```bash
npm run test:companion
```

O teste bloqueia a fase se houver:

- cobertura obrigatória ausente;
- caso, mensagem, versão ou sequência duplicada;
- fotografia atual divergente;
- evidência em mensagem apagada ou superada;
- bloco funcional ausente;
- limitação escondida;
- conversa pessoal com orientação ou CRM;
- análise bloqueada com conclusão inventada;
- objeção ativa incoerente;
- ganho ou perda sem evidência explícita;
- Agenda sem aceite, data futura ou confirmação;
- pergunta ignorada confundida com pergunta repetida;
- crítica inventada em um bom diagnóstico;
- apresentação prematura sem etapa pulada;
- `apply_crm_change`;
- ausência de confirmação humana;
- dado pessoal em formato reconhecível.

## Gate da Fase 1

A Fase 1 é encerrada somente com:

1. contrato funcional integrado;
2. 30 conversas validadas;
3. testes aprovados;
4. aprovação funcional registrada;
5. diff sem runtime, extensão, prompt, banco ou migration.
