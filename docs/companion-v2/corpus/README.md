# Corpus de regressão do Yolen Companion V2

## Objetivo

Este diretório contém conversas sintéticas e anonimizadas que funcionam como
oráculo comercial do Companion V2. O corpus define o que deve ser entendido em
cada conversa antes que qualquer motor novo possa alterar estágio ou próxima
ação no CRM.

O corpus não chama IA, não grava no Supabase e não altera o Companion V1.

## Arquivo canônico

`cases.json` é a fonte oficial da Fase 1. Cada caso registra:

- estado inicial do ciclo;
- mensagens com identidade e versão;
- direção, horário, tipo e estado de exclusão;
- fatos comerciais esperados;
- decisão operacional esperada;
- mensagens que sustentam a decisão;
- alterações que o motor não pode aplicar.

## Regras de anonimização

- todo conteúdo é sintético;
- nomes, telefones, e-mails, CPF/CNPJ e endereços reais são proibidos;
- os participantes são identificados somente pela direção da mensagem;
- datas e horários existem apenas para testar lógica temporal;
- transcrições de áudio são sintéticas.

## Cobertura obrigatória

| Cobertura | Caso de referência |
|---|---|
| Ganho explícito | `won-explicit-payment` |
| Perda explícita | `lost-explicit-competitor` |
| Agenda válida | `appointment-client-confirmed` |
| Negociação | `negotiation-price-objection` |
| Ausência de resposta | `no-response-after-read` |
| Mensagem editada | `edited-win-becomes-negotiation` |
| Mensagem apagada | `deleted-win-falls-back-to-negotiation` |
| Áudio transcrito | `audio-transcribed-appointment` |
| Áudio sem transcrição | `audio-without-transcription-blocks-apply` |
| Falso positivo conhecido | `false-positive-personal-time` |

O corpus também cobre:

- convite feito apenas pelo vendedor sem aceite do cliente;
- negociação intermediária superada por agendamento final;
- encerramento negativo após negociação;
- preservação da versão atual de uma mensagem.

## Significado do oráculo

- `facts` representa somente fatos comprovados pela fotografia atual da
  conversa;
- `decision.recommended_status` representa a decisão esperada do futuro motor;
- `apply_crm_change=false` significa que o CRM deve permanecer como está;
- `application_blocked=true` impede qualquer aplicação enquanto faltar
  informação obrigatória, como transcrição de áudio;
- `prohibited_statuses` registra classificações que caracterizam falso
  positivo naquele caso;
- `evidence_message_ids` só pode apontar para mensagens ativas na versão mais
  recente.

## Validação

Execute:

```bash
npm run test:companion
```

O teste bloqueia a fase se houver:

- cobertura obrigatória ausente;
- caso, mensagem ou versão duplicada;
- versões fora de sequência;
- mensagem excluída usada como evidência;
- contradição entre fatos e decisão;
- áudio sem transcrição liberado para aplicação;
- dado pessoal em formato reconhecível;
- divergência entre a fotografia atual e `current_message_ids`.

## Gate para a Fase 2

A Fase 1 só pode ser encerrada quando:

1. todos os casos forem validados automaticamente;
2. o corpus for revisado comercialmente;
3. a cobertura e a aprovação forem registradas em `PHASE_PROGRESS.md`;
4. nenhum arquivo de runtime, extensão, prompt ou banco fizer parte do diff.
