# Matriz adversarial — entrega do resultado profundo (deep-result delivery)

## Papel deste documento

Preparado **antes** de `feat/phase12a-deep-result-delivery` existir, por
instrução do Controle Mestre ("não espere o PR ficar pronto para pensar os
cenários"). Define a bateria adversarial que a Frente Paralela 3 vai
executar contra essa arquitetura assim que ela existir — job profundo do
PR #207 → resultado persistido → endpoint seguro → extensão → seller-facing.

Não presume nomes de rota, formato de resposta, ou mecanismo de entrega
(polling vs. push vs. outro) que a Frente 1 ainda não escreveu. Onde a
arquitetura real divergir do que este documento antecipa, os cenários serão
adaptados — a lista de riscos e a disciplina de teste (fail-closed,
isolamento, stale-result) são o que não muda.

## 1. Segurança do resultado profundo — o maior risco novo

O maior risco novo desta arquitetura é **IDOR / cross-tenant result leak**:
qualquer endpoint que aceite um `analysis_job_id` como parâmetro é, por
construção, um vetor de enumeração se não validar posse antes de responder.

### Casos obrigatórios

| # | Caso | Esperado | Classificação se violado |
|---|---|---|---|
| S1 | Usuário autenticado da Empresa A solicita um `analysis_job_id` que pertence, comprovadamente (linha real em `companion_background_analysis_jobs`), à Empresa B. | `403` ou `404` fail-closed. Nunca `200` com qualquer campo do job. | `BLOCKER` |
| S2 | Mesmo caso do S1, mas medindo timing/diferença de resposta entre "job não existe" e "job existe mas é de outra empresa" — a resposta não pode diferenciar os dois casos de forma que permita enumeração (ambos devem parecer idênticos ao chamador: `404` uniforme é preferível a `403` que confirma existência). | Resposta indistinguível entre "não existe" e "existe mas não é seu". | `PASS COM RESSALVA` se distinguível mas ainda fail-closed; `BLOCKER` se vazar confirmação de existência de forma explorável. |
| S3 | Resposta negada (S1) nunca deve conter, em nenhum campo do corpo do erro: `status`, `conversation_key`, `cycle_id`, `watermark`, ou qualquer fragmento do `state`/resultado. | Corpo do erro genérico, sem nenhum dado do job de outra empresa. | `BLOCKER` se qualquer campo vazar. |
| S4 | Mesma `conversation_key` (mesmo número de telefone) existindo em `company A` e `company B` (coincidência de base de clientes) — usuário de A tenta acessar o job de B usando o `analysis_job_id` real de B. | Negado exatamente como S1 — a coincidência de `conversation_key` não pode servir de atalho de autorização. | `BLOCKER` |
| S5 | `company A` / `cycle A` tentando acessar um job cuja `conversation_key` é a mesma, mas que pertence a `cycle B`, dentro da MESMA empresa (troca de ciclo, não de tenant). | Negado — isolamento por `cycle_id` dentro da mesma empresa também é obrigatório, não só por `company_id`. | `BLOCKER` |
| S6 | `service_role` (usado pelo backend do endpoint) — confirmar que a query que busca o job por `analysis_job_id` SEMPRE inclui `company_id` do usuário autenticado como filtro, nunca busca só por `analysis_job_id` e checa `company_id` depois na aplicação (janela de erro humano). | Filtro de `company_id` na própria query, não checagem posterior. | `PASS COM RESSALVA` se checagem posterior mas correta; `BLOCKER` se a checagem posterior for esquecível/opcional. |

### Método de teste (quando o endpoint existir)

Testes de integração reais contra o endpoint (não regex), seguindo o
padrão já estabelecido em `register-conversation-route.test.mjs` (fake
Supabase client ou PGlite): dois tenants sintéticos, dois jobs reais
persistidos, tentativa de acesso cruzado, assert no status code e no corpo
completo da resposta (não só "não é 200" — precisa provar que nada
vazou).

## 2. Matriz de entrega em background (A–P)

Estende a matriz A–N já validada para o **job em si**
(`RACE_CONDITIONS_MATRIX.md`, seção "Matriz A–N") com as duas novas letras
que o mandato acrescentou para a camada de **entrega**:

| # | Cenário | Esperado | Já coberto pela matriz A–N do job? |
|---|---|---|---|
| A | Job criado → queued → running → succeeded | Resultado profundo disponível para entrega | Sim — cenário A da matriz A–N (`PASS COM RESSALVA`, contrato de banco provado, orquestração completa não). |
| B | Job A inicia → usuário abre B → A termina. B permanece B. | Nenhuma contaminação da UI de B pelo resultado de A | Era `N/A` (sem entrega); **agora é o requisito central desta nova arquitetura** — herda diretamente a causa-raiz do BLOCKER A→B do caminho rápido, já corrigido no PR #208. Qualquer endpoint/consumo novo precisa do MESMO padrão de guard (contexto + sequência), não pode reinventar. |
| C | Watermark 1 → nova mensagem → watermark 2 → job 2 termina → job 1 termina depois. Job 1 nunca degrada job 2. | Resultado mais novo prevalece | Sim, ao nível de contrato de dados (cenário C/E da matriz A–N) — falta a camada de entrega respeitar o mesmo watermark ao decidir o que mostrar. |
| D | Dois triggers equivalentes para o mesmo snapshot | Idempotência/coalescing conforme arquitetura real | Sim — provado por SQL real (`phase-12a-background-jobs-database-contract.test.mjs`, teste `(D)`). |
| E | Job antigo demora → job novo termina primeiro. Antigo nunca vence. | Idem | Sim — provado por SQL real (teste `(E/I)`). |
| F | Queue redelivery. Nenhuma intervenção duplicada. | Idem | `PASS COM RESSALVA` — mecanismo existe (idempotencyKey, status terminal), não exercitado com redelivery real. |
| G | Lease concorrente. Um processamento efetivo. | Idem | Sim — provado por SQL real (teste `(G)`, índice único parcial). |
| H | Job falha → retry. Sem duplicar estado válido. | Idem | Parcial — função de decisão de retry testada isoladamente; fluxo completo não. |
| I | Extensão recarrega durante job. Nenhum cross-conversation leak. | Idem | Era `N/A` (sem estado client-side persistido); passa a ser relevante quando a extensão guardar QUALQUER referência a um `analysis_job_id` em `chrome.storage` para retomar polling após reload — se isso existir, precisa reidratar com o MESMO guard de contexto, não confiar cegamente no id salvo. |
| J | A → B → C → A durante job | Só estado de A pode aparecer ao voltar | Provado pelo teste multi-hop desta frente (`content-script-dom-analysis-multihop-guard-adversarial.test.mjs`) para o caminho rápido — precisa de equivalente para o caminho de entrega do resultado profundo quando ele existir. |
| K | Ciclo fecha enquanto job está em voo | Job não deve gravar/expor resultado para um ciclo já fechado sem contexto | Gap conhecido (cenário K da matriz A–N) — worker não consulta `sales_cycles.status`. Camada de entrega precisa decidir explicitamente: mostrar resultado de um ciclo já fechado, ou suprimir? Não presumir — perguntar à Frente 1 se ambíguo. |
| L | Ciclo muda validamente depois do snapshot | Job/entrega não pode misturar dados do ciclo novo com o snapshot antigo | Parcial (FK protege identidade; mudança de dono/status não testada). |
| M | Job superseded | Nunca vira corrente | Sim — ver cenário M da matriz A–N (maior prioridade de investigação: checagem de supersede só acontece uma vez, antes do claim). |
| N | Deep result antigo chega depois de "Analisar agora" mais novo | Resultado mais novo prevalece, qualquer que seja a origem (job profundo ou análise manual) | **Novo** — exige que a camada de entrega do resultado profundo e o caminho `analyzeCurrentConversation` compartilhem o MESMO relógio de "o que é mais recente" (watermark/sequência unificados), não dois sistemas de frescor paralelos e não comparáveis entre si. Gap de design a esclarecer com a Frente 1 antes de implementar. |
| O | "Analisar agora" antigo → automático novo | Mais recente prevalece | **Novo** — o guard do PR #208 (`conversationAnalysisRequestSequence`) já cobre isto DENTRO do caminho de `analyzeCurrentConversation`, porque tanto o disparo manual quanto o automático passam pela mesma função com o mesmo contador. Precisa reconfirmar quando/se o disparo automático mudar de mecanismo (ex.: passar a enfileirar direto no job profundo em vez de chamar `analyzeCurrentConversation`). |
| P | Automático antigo → "Analisar agora" novo | Idem, na ordem inversa | Idem ao item O — mesma proteção, mesma ressalva. |

## 3. Ataque a polling (se a Frente 1 usar polling)

**Não presumir arquitetura.** Os cenários abaixo só se aplicam se/quando a
Frente 1 implementar polling; se a entrega for por outro mecanismo (SSE,
push, refetch condicionado a evento), esta seção será reescrita contra o
mecanismo real.

| # | Cenário | Esperado |
|---|---|---|
| P1 | Dois pollers simultâneos (ex.: duas abas, ou um poller "fantasma" que não foi cancelado corretamente ao trocar de conversa) | Não pode haver dois pollers vivos aplicando resultado ao mesmo `state` — o segundo deve ser cancelado ou seu resultado descartado pelo mesmo guard de contexto. |
| P2 | Poller continua rodando depois de o vendedor trocar de conversa | Poller deve ser cancelado no momento da troca (mesmo padrão de `clearAutomaticAnalysisTimer()`/`clearCompanionClientContextRefreshTimer()` já usado para outros timers), ou seu resultado deve ser descartado pelo guard mesmo que o timer em si não seja cancelado. |
| P3 | Poller continua rodando depois de o job ter sido marcado `superseded` no banco | Poller deve parar de perguntar por um job que não vai mais progredir, e nunca aplicar um resultado `superseded` como se fosse corrente. |
| P4 | Poller continua rodando depois de `succeeded` | Poller deve parar após receber o resultado final — não continuar consultando um job terminal indefinidamente. |
| P5 | Poller continua rodando depois de `failed` | Idem — parar, não tentar reaplicar. |
| P6 | Polling infinito (nunca para, mesmo com job terminal ou conversa trocada) | `FAIL` — desperdício de recursos e risco de aplicar resultado tardio incorretamente. |
| P7 | Polling agressivo (intervalo curto demais, sem backoff) | `PASS COM RESSALVA` ou `FAIL` dependendo do impacto real medido no backend — não definir um número mágico de intervalo aceitável sem dados. |
| P8 | Reload da extensão durante polling ativo inicia um SEGUNDO poller duplicado para o mesmo job (o antigo não foi de fato encerrado, só perdeu a referência em memória) | Não pode haver dois pollers vivos para o mesmo `analysis_job_id` after reload. |
| P9 | Uma resposta de poll antiga (requisição HTTP lenta) chega depois de uma resposta de poll mais nova já aplicada | Resposta antiga não pode vencer — mesmo princípio de sequência do PR #208, aplicado ao nível de requisição de polling, não só de análise. |

## 4. Stale / watermark — mutação de conversa durante o job

Já parcialmente coberto por `ISOLATION_MATRIX.md`/`RACE_CONDITIONS_MATRIX.md`
(cenário C da matriz A–N: watermark é `message_watermark`, capturado no
enqueue). Casos específicos a testar quando a entrega existir:

| # | Mutação durante o job | Esperado |
|---|---|---|
| W1 | Mensagem nova chega enquanto o job está `running` | O job em voo continua vinculado ao `message_watermark` com que foi criado — o resultado profundo, quando entregue, deve ser identificável como "análise da conversa até o ponto X", não confundido com uma análise que já viu a mensagem nova. |
| W2 | Mensagem existente é editada enquanto o job está em voo | Idem — o resultado permanece vinculado ao snapshot antigo; não é obrigatório apagar o job antigo, é obrigatório que ele nunca vire "o estado atual" da conversa se um job mais novo (pós-edição) existir. |
| W3 | Mensagem é excluída enquanto o job está em voo | Idem. |
| W4 | Mensagem excluída é restaurada enquanto o job está em voo | Idem — restaurar não deve "reativar" retroativamente um job antigo como se fosse atual. |
| W5 | Transcrição de áudio é atualizada (chega depois de o job já ter iniciado sem ela) | O resultado do job que rodou sem a transcrição não deve ser apresentado como definitivo se uma transcrição relevante chegou depois — no mínimo, precisa estar marcado como potencialmente incompleto, não indistinguível de uma análise completa. |

Regra geral, já formalizada em `PROGRESSIVE_BACKGROUND_VALIDATION_CONTRACT.md`
("Stale Result Policy"): resultado histórico pode continuar existindo no
banco — o que nunca pode acontecer é um resultado stale virar "o estado
atual" exibido ao vendedor.

## 5. Isolamento — extensão dos casos já cobertos

`ISOLATION_MATRIX.md` já cobre `company_id`/`cycle_id`/`conversation_key`
para a tabela de jobs. Adicionar, quando o endpoint de entrega existir:

- `analysis_job_id` nunca pode servir como bypass de qualquer uma das
  outras dimensões de isolamento (é só uma chave técnica, não uma
  capability token implícita).
- Confirmar que o endpoint de entrega, assim como o worker, sempre filtra
  por `company_id` do usuário autenticado NA QUERY, não como checagem
  posterior — ver caso S6 acima.

## 6. Persistência

Nenhum requisito novo além do que já está validado
(`PROGRESSIVE_BACKGROUND_VALIDATION_CONTRACT.md`, seção de persistência
V3): V2 histórico legível, V3 persistido, CAS funcional, superseded não
vira corrente, `automatic_crm_write`/`automatic_agenda_write` sempre
`false`. Reexecutar os testes já existentes
(`phase-5-stateful-persistence.test.mjs`,
`phase-12a-background-jobs-database-contract.test.mjs`) contra a branch da
Frente 1 quando ela existir é suficiente — não é necessário inventar novos
testes de persistência só porque a camada de entrega mudou, a menos que a
Frente 1 introduza uma tabela/coluna nova para a entrega em si.

## 7. Observabilidade mínima (ajustada por instrução do Controle Mestre)

Correção de escopo em relação a `OBSERVABILITY_CONTRACT.md`: **não exigir
telemetria inexistente por estética.** O mínimo que precisa ser derivável
para auditabilidade real:

- `analysis_job_id`
- job created / started / completed (timestamps)
- `status`
- `attempt_count`
- `failure_code`
- superseded (hoje só como valor de `status`, aceitável)
- `candidate_state_version`
- time-to-deep-analysis (`completed_at - started_at`, já calculável)

**TTFV pode estar em outro canal** — não é requisito desta camada de
entrega do resultado profundo. Campos como `worker_id`, `lease_expires_at`,
`queue_message_id` (já documentados como ausentes em
`OBSERVABILITY_CONTRACT.md`) continuam sendo gaps reais, mas não bloqueiam
a validação da entrega — são úteis para depuração operacional, não para
provar correção/isolamento, que é o que esta frente audita. Não registrar
conteúdo sensível em nenhum campo novo que a camada de entrega introduzir
(mesma regra de sempre).

## Status desta preparação

Este documento é **preparação**, não execução — não existe branch
`feat/phase12a-deep-result-delivery` no momento em que foi escrito. Nenhum
teste executável foi criado ainda para os cenários acima (não há código
real para testar). Quando a branch existir: auditar sem alterar runtime,
converter os casos aplicáveis em testes executáveis (reaproveitando os
harnesses já existentes — `load-content-script.mjs` para a extensão, o
padrão PGlite de `phase-12a-background-jobs-database-contract.test.mjs`
para o banco), e atualizar este documento com os resultados reais.
