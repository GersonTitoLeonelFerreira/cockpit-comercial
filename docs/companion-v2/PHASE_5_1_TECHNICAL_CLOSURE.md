# Encerramento técnico da Fase 5.1 — Núcleo Stateful

## Estado

Data do fechamento técnico: 2026-08-07.

Branch de desenvolvimento:

```text
feature/companion-v2-phase-5-1-stateful-copilot
```

Commit de referência do orquestrador server-only:

```text
566b0a2c4a2bdaee4f2cef79356420d53cdc1675
```

A Fase 5.1 implementa o núcleo stateful do Motor de Diagnóstico Comercial V2.

O encerramento desta fase não ativa o V2 para vendedores, não substitui o
Companion V1, não conecta o novo orquestrador às rotas operacionais e não
autoriza alterações automáticas no CRM ou na Agenda.

## Entregas concluídas

A Fase 5.1 possui, de forma integrada:

1. contrato do estado comercial acumulado;
2. normalização e validação do estado stateful;
3. redutor versionado do estado comercial;
4. corpus específico de regressão comercial;
5. planejamento determinístico da análise stateful;
6. interpretação contextual estruturada;
7. provider OpenAI server-side;
8. política controlada de tentativas;
9. plano de persistência com trava de versão;
10. persistência stateful no Supabase;
11. leitor e escritor Supabase;
12. serviço integrado de leitura, motor e persistência;
13. composição server-only;
14. gate de ativação por modo e empresa;
15. carregador de contexto real;
16. orquestrador server-only do runtime stateful.

## Estado acumulado

O núcleo implementado preserva contexto comercial entre análises do mesmo ciclo.

A nova mensagem não substitui automaticamente todo o histórico.

O estado pode preservar simultaneamente:

- objetivo atual;
- necessidades;
- informações relevantes;
- perguntas abertas;
- objeções;
- restrições;
- compromissos;
- sinais comerciais;
- momento comercial;
- memória comercial ativa e resolvida;
- evidências;
- incertezas;
- estratégia.

## Carregamento de contexto real

O carregador server-only integra dados reais da empresa, ciclo e conversa.

Ele:

- valida empresa, ciclo e conversa;
- utiliza o ledger canônico;
- identifica as versões atuais das mensagens;
- preserva os IDs históricos conhecidos;
- separa as mensagens atualmente ativas;
- carrega a configuração comercial publicada quando existente;
- classifica o contexto como limitado quando a configuração ainda não está publicada;
- carrega o estado stateful anterior;
- rejeita inconsistências de escopo;
- não fabrica memória quando nenhum estado anterior existe.

O estado lido durante a montagem do contexto é reutilizado pelo serviço integrado.
Isso evita uma segunda leitura desnecessária do mesmo estado durante a execução.

## Persistência stateful

A memória comercial possui persistência versionada no Supabase.

A gravação:

- exige o escopo correto de empresa, ciclo e conversa;
- utiliza trava otimista de versão;
- mantém auditoria;
- possui idempotência;
- rejeita estado candidato incompatível;
- propaga conflitos sem sobrescrever silenciosamente outro estado;
- não autoriza escrita automática no CRM;
- não autoriza escrita automática na Agenda.

Quando ocorre conflito de versão, o runtime preserva o resultado operacional do V1.

## Gate de ativação

O rollout stateful possui três modos:

```text
disabled
shadow
active
```

### disabled

- não executa o runtime stateful;
- não cria o runtime server-only;
- preserva integralmente o Companion V1.

### shadow

- executa o núcleo stateful;
- permite persistir o novo estado;
- não substitui a resposta entregue pelo V1;
- permite comparação segura antes de qualquer ativação.

### active

- exige explicitamente `COMPANION_ENGINE_VERSION=v2`;
- exige empresa autorizada na allowlist;
- somente expõe o resultado V2 depois de persistência confirmada;
- conflito, bloqueio ou falha preservam o resultado V1.

O curinga global de empresas é proibido pelo gate.

## Orquestrador server-only

O orquestrador final da Fase 5.1 reúne:

```text
gate
↓
carregador de contexto real
↓
estado anterior
↓
motor stateful
↓
validação
↓
plano de persistência
↓
persistência
↓
decisão de exposição V1 ou V2
```

O runtime é criado de forma lazy.

Quando o gate não permite execução, o Supabase administrativo e o provider
do modelo não precisam ser inicializados pelo orquestrador.

## Comportamento de segurança validado

Foram validados os seguintes cenários do orquestrador:

- `disabled` preserva V1 sem criar runtime stateful;
- empresa fora da allowlist preserva V1;
- `active` com engine V1 falha fechado;
- `shadow` executa stateful e preserva a resposta V1;
- `active` com V2 expõe o resultado stateful somente após persistência;
- resultado bloqueado preserva V1;
- conflito de persistência preserva V1;
- falha do runtime preserva V1;
- detalhes internos de infraestrutura não são expostos;
- runtime server-only pode ser reutilizado entre execuções;
- nenhuma escrita automática em CRM é autorizada;
- nenhuma escrita automática em Agenda é autorizada.

## Validação de fechamento

Durante a auditoria final foi identificado que o comando geral:

```text
npm run test:companion
```

executava testes server-only sem a condição React Server.

Os testes específicos já utilizavam:

```text
--conditions=react-server
```

O comando geral foi corrigido para utilizar a mesma condição.

Após a correção, a bateria geral terminou com:

```text
Companion geral: 404/404
Contexto real stateful: 6/6
Orquestrador server-only: 9/9
TypeScript: aprovado
Next.js build: aprovado
Páginas geradas no build: 111/111
```

Na auditoria também foram aprovados:

```text
configuração comercial: 1/1
operações administrativas: 1/1
message ledger: 1/1
capture state: 1/1
RPC de ingestão: 1/1
versão causal: 1/1
schema baseline: 1/1
persistência stateful: 1/1
```

O ESLint não apresentou erros.

Permaneceu um warning de variável não utilizada em um teste do normalizador:

```text
app/lib/companion/stateful-copilot-normalizer.test.mjs
```

Esse warning não altera o runtime e não impediu a validação técnica.

## Guardrails preservados

O arquivo de exemplo de ambiente permanece com:

```text
COMPANION_ENGINE_VERSION="v1"
COMPANION_STATEFUL_MODE="disabled"
COMPANION_STATEFUL_COMPANY_IDS=""
```

Portanto, o estado padrão continua fail-closed.

## O que continua propositalmente desligado

O fechamento da Fase 5.1 não autoriza:

- mudar `COMPANION_ENGINE_VERSION` para `v2`;
- mudar o gate para `shadow` ou `active` em produção;
- incluir empresas reais na allowlist;
- conectar o orquestrador à rota operacional do Companion;
- substituir a resposta do V1;
- atualizar etapa do CRM automaticamente;
- criar compromisso de Agenda automaticamente;
- marcar ganho ou perda automaticamente;
- fazer rollout para empresa piloto;
- remover a confirmação humana.

## Limite da conclusão

A conclusão da Fase 5.1 significa:

> O núcleo stateful possui arquitetura, contratos, persistência, contexto real,
> gate, orquestração server-only e testes suficientes para ser considerado
> tecnicamente implementado.

Ela não significa:

> O novo Companion V2 está ativo para vendedores.

A ativação e a experiência operacional pertencem aos próximos gates do projeto.

## Gate seguinte

Depois da publicação deste encerramento, qualquer integração do núcleo stateful
com uma rota real deverá ser tratada como uma nova etapa explícita.

Essa etapa deverá definir antes da implementação:

1. qual rota utilizará o orquestrador;
2. qual resposta continuará sendo canônica;
3. como o modo `shadow` será observado;
4. qual empresa poderá participar do primeiro rollout;
5. quais métricas serão comparadas entre V1 e V2;
6. quais condições interrompem imediatamente o rollout;
7. como será realizado o rollback.

Nenhum desses itens é autorizado automaticamente pelo fechamento da Fase 5.1.
