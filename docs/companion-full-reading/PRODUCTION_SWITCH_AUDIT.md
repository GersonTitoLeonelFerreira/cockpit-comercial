# Leitura completa — auditoria para o botão de produção por vendedor

Rodada 14 (só auditoria). Nenhum código de produto foi alterado. Este documento
mapeia, com evidência de código, o que o ramo `claude/companion-full-reading`
muda em relação à `main` e como cada mudança é ligada hoje. Ele não propõe
arquitetura e não escolhe entre opções: onde há ambiguidade, a seção 9 registra
uma DÚVIDA.

Sem dados de cliente: nenhum nome, telefone, texto de conversa ou ID de ciclo
aparece aqui.

## 0. Base

| Item | Valor |
|---|---|
| Ramo | `claude/companion-full-reading` |
| HEAD auditado | `07f08e58da562c5fdd8f20d165ec58dd4e5a3716` |
| `main` comparada | `91c967753cfad6cbd0bfa9e26be6175fdd2b4528` |
| merge-base | `91c96775…` (o ramo começa na própria `main`) |
| Commits no ramo | 41 |
| `git diff --stat main...HEAD` | 267 arquivos, +86.515 / −1.821 |
| Arquivos fora de teste | 154 (inclui 6 migrações, docs, package.json/lock) |

O ramo tem duas partes, em sequência:

- **PR #356** (`claude/companion-sales-expert-recovery`, aberto, não mergeado):
  18 commits, de `516c5735` a `46189263`. Motor comercial (tempo como
  evidência, coerência do coaching, MENSAGEM, proveniência de fatos),
  pipeline da análise antiga (retry, órfãos), isolamento produção/homolog
  (`execution_scope`), canal HML da extensão e identidade de build.
- **Leitura completa**: 23 commits, de `1f16e2d1` a `07f08e58`. Leitura do
  Claude no painel, MENSAGEM pela leitura, anexos, áudio, ciclo encerrado,
  Nova oportunidade, ManyChat, `COMPANION_AI_PROVIDER`, Yolen web.

Mergear este ramo na `main` leva também todo o PR #356.

### Migrações no ramo

| Arquivo | Status declarado (evidência) |
|---|---|
| `20260930020000_create_companion_homolog_derived_storage.sql` | Do PR #356; declarada aplicada no banco compartilhado pela descrição do PR #356. |
| `20260930060000_create_companion_full_reading_runs.sql` | Sem marca no arquivo. O HML grava e lê `companion_full_reading_runs`: evidência indireta de que existe. |
| `20261001090000_allow_panel_full_reading_trigger.sql` | Cabeçalho: "NÃO APLICADA" (linha 4). O código grava `trigger_source = 'analysis_job'` até ela existir (`full-reading-panel.ts:130-135`). |
| `20261001150000_create_companion_successor_cycle.sql` | Cabeçalho: "NÃO APLICADA" (linhas 4-8). Sem ela, `POST /api/companion/successor-opportunity` responde `SUCCESSOR_RPC_UNAVAILABLE` (503). |
| `20261003090000_allow_closed_cycle_companion_capture.sql` | Cabeçalho: "NÃO APLICADA por quem escreveu". O dono informou na Rodada 12 que aplicou; o comentário em `resolve-lead/route.ts:491-494` diz "já aplicada". |
| `20261003100000_create_companion_conversation_attachments.sql` | Mesma situação da anterior (aplicada pelo dono, segundo a Rodada 12). |

Esta auditoria não consultou o banco. O status real fica na DÚVIDA D11.

### Testes rodados (só baseline, opcional)

| Suíte | Resultado |
|---|---|
| `app/api/companion/legacy-ai-guard.test.mjs` (as travas 409 e o ack das filas) | 5/5 |
| `npm run test:companion-authorization` | 312/312 |

Nenhum arquivo foi alterado para rodar os testes.

### Legenda das classes (itens 2 e 3)

- **(a)** Só acontece quando o servidor diz que a leitura completa está ligada.
- **(b)** Acontece para todos (correção ou melhoria). O texto diz o efeito para
  quem usa a análise antiga e se gera custo.
- **(c)** Acontece para todos e, pelas decisões do dono ("com o botão
  desligado, nada pode mudar para ninguém: nem tela, nem custo novo, nem
  chamada nova a modelo"), deveria depender do botão.

---

## 1. Pontos de liga/desliga

### 1.1 A flag hoje

`app/lib/server/full-reading-flag.ts`

| Linha | Função | Regra |
|---|---|---|
| 9-16 | `isFullReadingPanelEnabled(env)` | `env.COMPANION_FULL_READING_PANEL === 'on' && env.VERCEL_ENV === 'preview'` |
| 32-36 | `isLegacyCompanionAiDisabled(env)` | Igual a `isFullReadingPanelEnabled` (mesma flag, nome do lado antigo). |
| 48-58 | `legacyAiDisabledBody()` | Corpo do 409: `{ ok: false, code: 'LEGACY_AI_DISABLED', error }`. |

Fatos que importam para o botão:

- A regra só olha o ambiente do deployment. Ela não recebe vendedor nem
  empresa. Hoje é tudo ou nada por deployment.
- `VERCEL_ENV === 'preview'` é obrigatório. Em produção
  (`VERCEL_ENV=production`) a flag é sempre falsa, qualquer que seja
  `COMPANION_FULL_READING_PANEL`.
- A extensão não tem flag própria. Ela descobre o modo pela capability
  `full_reading_panel: true` que o servidor manda no `resolve-lead`
  (seção 1.5).

### 1.2 Servidor — rotas chamadas pela extensão (token do Companion)

O token do Companion carrega `sub` (vendedor) e `company_id` (empresa). Nas
linhas abaixo, "token na linha N" é onde o token já está verificado.

| Arquivo:linha | O que liga ou desliga | Vendedor e empresa nesse ponto |
|---|---|---|
| `app/api/companion/resolve-lead/route.ts:476-482` | Capability `can_note_successor_opportunity` (campo "O que é esta oportunidade?"). | Sim: `tokenPayload.sub`, `tokenPayload.company_id` (membership lida em 594-596; `isOwnedByMe` em 384). |
| `app/api/companion/resolve-lead/route.ts:486-490` | Capability `full_reading_panel: true`: a extensão passa ao modo da leitura completa. | Sim (idem). |
| `app/api/companion/resolve-lead/route.ts:497-504` | Capability `can_read_closed_cycle` (captura e leitura de ciclo encerrado). Exige também dono do ciclo, gestor ou admin. | Sim (idem). |
| `app/api/companion/decision-state/route.ts:221-241` → `full-reading-panel.ts:2652` | `loadFullReadingPanelForRequest` devolve `null` com a flag desligada. Ligada, planeja e agenda a leitura (via `after()`) e anexa a leitura à AGORA. | Empresa: passa `token.company_id`. Vendedor: `token.sub` existe na rota mas não é passado ao planejador. |
| `app/api/companion/analysis-view-model/route.ts:224` → `full-reading-panel.ts:2652` | Mesmo para a ANÁLISE. | Idem. |
| `app/lib/server/companion-client-context-loader.ts:1033-1053` (uso em 680) | Relacionamento: só mensagens reais, sem eventos do ManyChat, e cadeia de ciclos de origem quando é Nova oportunidade. | Sim: `userId = token.sub` (982-985), `companyId = token.company_id` (978). |
| `app/api/companion/capture/messages/route.ts` → `full-reading-closed-cycle.ts:113` | `readClosedCycleCaptureTarget`: com a flag desligada devolve `null` antes de qualquer consulta; ligada, manda `p_allow_closed_cycle: true` para a RPC quando o ciclo está encerrado. | Sim: `tokenPayload.company_id`; o vendedor é o do token da captura. |
| `app/api/companion/full-reading/message/route.ts:100` (OPTIONS) e `:113` (POST) | 404 com a flag desligada. Ligada, gera a MENSAGEM pelo Claude. | A flag é checada antes do token (token verificado logo depois, ~126). Depois disso, sim (`resolveCompanionLeadIdentity`). |
| `app/api/companion/full-reading/attachments/route.ts:106` (OPTIONS) e `:119` (POST) | 404 com a flag desligada. Ligada, "Incluir na leitura" (resumo do arquivo pelo Claude). | Flag antes do token (token em 132-136). Depois, sim; o arquivo grava `included_by`. |
| `app/api/companion/successor-opportunity/route.ts:261` | Só o campo `p_note` depende da flag. A rota em si não (ver risco R1). | Sim (token). |
| `app/api/companion/analyze-conversation/route.ts:493` | 409 `LEGACY_AI_DISABLED` (análise antiga). | Sim: token verificado em 476. |
| `app/api/companion/analysis-job-retry/route.ts:137` | 409 (retry da análise antiga). | Sim: token em 113. |
| `app/api/companion/lead-summary/route.ts:588` | 409 (resumo do lead pela IA). | Sim: token em 570. |
| `app/api/companion/method-guidance/route.ts:442` | 409 (orientação do método e o Message Intelligence que ela enfileira). | Sim: token em 424. |
| `app/api/companion/register-conversation/preview/route.ts:97` | 409 (prévia de "Registrar conversa"). | Sim: token em 79. |
| `app/api/companion/v2/diagnostic-preview/route.ts:184` | 409 (prévia do diagnóstico V2). | Sim: token em 159. |

### 1.3 Servidor — pontos sem vendedor (filas, jobs, segundo plano)

| Arquivo:linha | O que liga ou desliga | De onde o vendedor poderia vir (evidência) |
|---|---|---|
| `app/api/queues/companion-deep-analysis-v3/route.ts:30` | Com a flag, a mensagem da fila é reconhecida sem rodar a análise stateful. | A mensagem traz `company_id`, `cycle_id`, `conversation_key`, `analysis_job_id`, `execution_scope`, `device_key` e não traz quem pediu. A tabela `companion_background_analysis_jobs` (migração `20260823015639`) não tem coluna de solicitante. Fonte possível: `sales_cycles.owner_user_id` pelo `cycle_id`. O job só nasce em `analyze-conversation` e `analysis-job-retry`, que já têm o token (1.2). A consulta de status só marca órfão (`companion-analysis-job-reader.ts:914`) e não republica; quem republica é `companion-analysis-job-retry.ts` (rota com trava). |
| `app/api/queues/message-intelligence-shadow-v1/route.ts:27` | Com a flag, nenhuma rodada do Message Intelligence. | O job tem `seller_user_id` e `company_id` (`message-intelligence-shadow-worker.ts:557-560`), mas só depois de ler o job: a trava fica antes disso. |
| `after()` agendado em `decision-state/route.ts:240` e `analysis-view-model/route.ts` | O runner da leitura roda em segundo plano, com escopo `{company_id, cycle_id, conversation_key}` (`full-reading-panel.ts`, `FullReadingPanelScope`). | O planejamento acontece na requisição, com o token. A tabela `companion_full_reading_runs` (migração `20260930060000`) não tem coluna de vendedor. Fonte possível: o token no momento do pedido, ou `sales_cycles.owner_user_id`. |
| `app/api/companion/full-reading/run/route.ts:100-129` | Rota manual de teste: só fora de produção (`VERCEL_ENV !== 'production'` e `preview` ou `NODE_ENV=development`) e com `COMPANION_FULL_READING_RUN_TOKEN` na query. Recebe `company_id` na query. | Sem vendedor: é uma rota operacional, sem sessão. |

### 1.4 Yolen web (sessão por cookie)

Nas páginas da Yolen, o usuário vem da sessão do Supabase (`auth.user.id`) e a
empresa do cookie `cockpit_active_company_id`.

| Arquivo:linha | O que liga ou desliga | Vendedor e empresa |
|---|---|---|
| `app/leads/[id]/page.tsx:411-427` | Quadro "Resumo salvo na Yolen" com a última leitura do Companion (`loadLatestLeadCompanionReading`). | Sim: `auth.user.id`, `activeCompanyId`. É quem está vendo a página, não necessariamente o dono do ciclo. |
| `app/leads/[id]/page.tsx:1006-1010` | `companionReadingHref` no `CopilotTogglePanel`: com a flag, o Copiloto vira um atalho para a leitura, sem "Orientações da IA" e sem análise paga (`CopilotTogglePanel.tsx:19-29, 107`). | Idem. |
| `app/leads/[id]/page.tsx:1014-1016` | Seção "Leitura do Companion" (`CompanionReadingsSection`). | Idem. |
| `app/api/sales-cycles/companion-readings/route.ts:35` | 404 com a flag desligada (a seção acima busca aqui, `CompanionReadingsSection.tsx:228, 256`). | Sim: `getAuthedSupabase()` logo depois. |
| `app/lib/server/full-reading-cycle-readings.ts:350, 485` | Mesma flag dentro do loader (defesa). | Recebe `access.userId` e `activeCompanyId`. |
| `app/api/ai/analyze-conversation/route.ts:49` | 409 (análise do Copiloto da Yolen). | A trava fica antes da autenticação; o usuário só existe depois (`getAuthedSupabase` em 75). |

### 1.5 Extensão

A extensão não lê nenhuma variável do servidor. Ela decide pelo que o servidor
devolve:

| Arquivo:linha | O que decide |
|---|---|
| `src/companion-lead-resolution-controller.js:258-297` | Copia só as capabilities conhecidas: `can_create_successor_opportunity`, `can_note_successor_opportunity`, `full_reading_panel`, `can_read_closed_cycle`. |
| `src/companion-background-privacy.js:142-145` | Mesma lista permitida no background. |
| `src/companion-core.js:8350-8362` `isFullReadingPanelMode()` | Verdadeiro se a resolução atual trouxe `full_reading_panel: true` ou se há leitura na tela. Ao ver a capability uma vez, `fullReadingPanelModeSeen` (linha 254) fica verdadeiro até a página recarregar. |
| `src/companion-core.js:8365` `isLegacyAiDisabled()` | Igual a `isFullReadingPanelMode()`. Passada aos controllers (linhas 120, 264, 446, 534). |

Usos de `isFullReadingPanelMode()` / `isLegacyAiDisabled()` no Core e nos
controllers:

| Arquivo:linha | Efeito com o modo ligado |
|---|---|
| `companion-core.js:829` | "Atualizar análise" não dispara a análise antiga. |
| `companion-core.js:1716` | `includeMediaBubbles`: áudio, imagem e arquivo sem texto entram na captura (WhatsApp e ManyChat). |
| `companion-core.js:2490-2497` | Abas do ciclo encerrado (também exige `can_read_closed_cycle`). |
| `companion-core.js:3775-3786` | Transcrição automática. |
| `companion-core.js:3932` | Aviso da transcrição automática. |
| `companion-core.js:7544` | ANÁLISE só da leitura. |
| `companion-core.js:7795` | CLIENTE só da leitura. |
| `companion-core.js:8178-8190` | "Incluir na leitura". |
| `companion-core.js:8441, 8453` | Card do resumo antigo some; pedido de releitura. |
| `companion-core.js:8866, 8903, 8919` | AGORA só da leitura (ou o aviso dela). |
| `companion-core.js:9041, 9085` | MENSAGEM só da leitura. |
| `companion-core.js:9851` | Ícone minimizado pela leitura. |
| `companion-analysis-controller.js:202-203` | Análise antiga não roda. |
| `companion-lead-summary-controller.js:202-203` | Resumo antigo não é pedido. |
| `companion-conversation-registration-controller.js:28-29` | "Registrar conversa" (IA) sai. |
| `companion-message-controller.js:1265` | Mensagem antiga não é gerada. |
| `capture-batch.js:170-185` | Captura do ciclo encerrado só com `can_read_closed_cycle`. |

Checagens por canal do pacote (não pelo servidor):

| Arquivo:linha | Regra |
|---|---|
| `companion-core.js:7411` | Diagnóstico da fila/job só com `channel === 'homolog'`. |
| `companion-message-controller.js:502-506` | Trace factual só com `channel === 'homolog'`. |
| `companion-core.js:9461, 9656` | Cabeçalho HML e conferência de commit do backend só com `backend_match_required` (canal homolog). |
| `yolen-api.js:29-60` | Escopo esperado do job: `prod → production`, `homolog → homolog`; `dev` e `e2e` não conferem. |
| `manychat-content-script.js:14` | ManyChat só roda com `MANYCHAT_CAPTURE_ENABLED === true` (flag de build). |

### 1.6 Outras checagens de preview no servidor

| Arquivo:linha | O que faz | Usada pela leitura completa? |
|---|---|---|
| `app/lib/companion/companion-execution-scope.ts:44-66` | `VERCEL_ENV=production` → `production`; `preview` → `homolog`; fora da Vercel: `COMPANION_EXECUTION_SCOPE` ou `NODE_ENV`. Escolhe as tabelas derivadas da análise antiga. | Não. Só a análise antiga (PR #356). As tabelas da leitura completa não têm escopo (risco R5). |
| `app/api/companion/method-guidance/route.ts:135-148` | Trace factual na resposta só em `preview`. | Não (PR #356). |
| `app/companion/connect/page.tsx:95-110` | Em `preview`, aceita a origem exata do deploy para a sessão do pacote HML. | Não (canal HML, PR #356). |
| `app/api/companion/build-identity/route.ts:20-30` | `GET` público devolve `environment`, `commit`, `commit_short`. | Não (cabeçalho HML). Existe em produção também. |
| `app/api/companion/full-reading/run/route.ts:100-109` | `isPreviewRuntime()`. | Sim (rota manual de teste). |
| `stateful-copilot-composition.ts:318`, `stateful-copilot-runtime-orchestrator.ts:931` | Já existiam na `main` (linhas 280 e 881 lá). | Não. |

---

## 2. Extensão (Core, WhatsApp, ManyChat) contra a `main`

Versão do manifesto: `1.4.2` → `1.5.2`. Diferença em `src/`: 34 arquivos,
+11.584 / −464.

### 2.1 Itens pedidos no contrato

| Mudança | Classe | Evidência | Efeito para quem usa a análise antiga; custo |
|---|---|---|---|
| Captura de áudio do WhatsApp (áudio sem texto vira mensagem com `[duração m:ss]`) | (a) | `companion-core.js:1716` → `whatsapp-adapter.js:1826, 1880, 1917`; com `includeMediaBubbles=false` vale `buildAttachmentOnlyMessageFromBubble`, igual à `main`. | Nenhum. |
| Detecção de áudio com o player tocando (ícones de pausa) | (b) | `whatsapp-adapter.js:1600-1602` (`audio-pause`, `ptt-pause`). | Um áudio sendo tocado continua reconhecido como áudio (`hasAudio`). Sem custo. |
| Transcrição automática | (a) | `companion-core.js:3775-3786` exige `isFullReadingPanelMode()`. | Nenhum. Custo só no modo ligado (seção 5). |
| Duração congelada do áudio | (a) e uma parte (b) | (a): `readStableAudioDurationText` só com `includeMedia` (`whatsapp-adapter.js:1746-1757`). (b): ao casar o arquivo da transcrição manual, a duração congela (`whatsapp-adapter.js:3106-3107`) e passa a valer na escolha do alvo (`2804-2814`). | Na transcrição manual, a escolha do áudio usa a duração congelada. Sem custo. |
| Marca `[Arquivo ...]` no texto | (a) para a marca nova; a antiga já existia | A `main` já grava `[Arquivo: nome]` para todos (Q6/FASE 5). A marca nova (tipo, tamanho, páginas; imagem como `[Arquivo \| tipo: imagem]`) só com `includeMedia` (`whatsapp-adapter.js:1746-1773`; `message-mutations.js:1171-1300`). | Nenhum. |
| "Incluir na leitura" | (a) | Botão só no painel da leitura; `companion-core.js:8178-8190`; rota 404 sem a flag. | Nenhum. |
| Ponte da página para "Incluir na leitura" | (b), inerte | `whatsapp-audio-bridge.js` troca `HTMLAnchorElement.prototype.click` e põe um listener de clique em captura para todos. Só age em URLs de `suppressedDownloadUrls`, que só se enchem depois de `CAPTURE_NEXT_FILE` (pedido do botão). | Código novo carregado na página do WhatsApp de todos; sem efeito visível nem custo. |
| Eventos internos do ManyChat | (b) só onde o ManyChat está ligado | `manychat-message-profile.js:221-225`: evento interno ou linha de sistema sem evento útil não vira mensagem; evento útil vira mensagem `author_kind: 'automation'` com o texto da linha (`236-258`). No servidor, o filtro de eventos no Relacionamento só vale com a flag (`companion-client-context-loader.ts:680`). | Pacote normal: nenhum (ManyChat desligado, `manychat-content-script.js:14`). Pacote do piloto com o vendedor fora da lista: a análise antiga recebe os eventos úteis como mensagens de automação (DÚVIDA D6). Sem custo de modelo na captura. |
| Captura de ciclo encerrado | (a) | `capture-batch.js:170-185` exige `can_read_closed_cycle`; `companion-core.js:2490-2497`; no servidor, `full-reading-closed-cycle.ts:113` sai antes de consultar. | Nenhum. |

### 2.2 Demais mudanças da extensão

| Mudança | Classe | Evidência | Efeito; custo |
|---|---|---|---|
| Painel inteiro pela leitura (AGORA, ANÁLISE, CLIENTE, MENSAGEM, ícone) e o caminho antigo de IA desligado | (a) | Tabela de 1.5. | Nenhum. |
| Etapa aplicada na hora ("Aplicar" do cartão de etapa) | (a) | `companion-core.js:7924-7945, 8803`; o cartão só existe na leitura. | Nenhum. |
| Aviso de falha de captura no painel | (a) | `companion-core.js:7915-7921` aplica o aviso na view da leitura. | Nenhum. |
| Mídia do ManyChat (imagem/arquivo) | (a) | `manychat-channel-adapter.js` (`readVisibleMessageEntries({ includeMediaBubbles })` → `setMediaCaptureEnabled`). | Nenhum. |
| ManyChat: bot, botões, citações e "ver mais" separados (rodada 6) | (b) só com ManyChat | `manychat-message-content.js`, `manychat-message-profile.js`. | Pacote normal: nenhum. |
| "Nova oportunidade" a partir do ciclo fechado | (c) | Capability sem flag (`resolve-lead/route.ts:470-472`); extensão: `companion-lead-creation-controller.js:238, 310, 430`; `background.js` (`CREATE_SUCCESSOR_OPPORTUNITY` → `/api/companion/successor-opportunity`). | Com a extensão nova, o botão aparece para todos com ciclo fechado elegível. Se a migração `20261001150000` não estiver aplicada, o clique dá 503. Sem custo de modelo. Ver R1 e D4. |
| Ordem da conversa pela posição na tela (`domOrder`) | (b) | `whatsapp-adapter.js:1952-2000`. | Mensagens do mesmo minuto ficam na ordem da tela. Sem custo. |
| Direção da bolha só de anexo | (b) | `whatsapp-adapter.js:3842-3890`. | Anexo enviado pelo vendedor deixa de ser lido como do cliente. Sem custo. |
| Resiliência da captura (reenvio sem `base_version`, uma vez; mensagem inválida isolada) | (b) | `capture-resilience-null-base.js`, `capture-resilience.js`, `capture-batch.js` (commit `50dcd196`). | Lote recusado deixa de repetir para sempre; pode haver um reenvio. Sem custo de modelo. |
| Canal do pacote (`companion-environment.js`) e origens permitidas | (b) | `yolen-bridge.js`, `yolen-page-bridge.js`, `background.js:8-29`, `yolen-api.js:8-20`. | O pacote PROD aceita só a origem de produção. Sem custo. |
| Escopo do job conferido no pacote PROD | (b) | `yolen-api.js:24-60`. | Job de outro escopo é descartado. Sem custo. |
| Identidade do pacote no cabeçalho (`v1.5.2 · <commit>`) | (b) | `companion-core.js:9630-9700`; `build-identity.js`. | Selo novo no cabeçalho para todos. Sem custo. |
| Diagnóstico da fila/job e trace factual | (a) do canal HML | `companion-core.js:7411`; `companion-message-controller.js:502-506`. | Nunca no pacote PROD. |
| Contexto de tempo, MENSAGEM sem beco sem saída, deduplicação, proveniência (PR #356) | (b) | Commits `14d6389c`, `b0dfa958`, `4949061a`, `ef9891cd`; `companion-seller-information-view.js`, `companion-reasoning-view.js`, `companion-message-controller.js`. | A tela da análise antiga muda para todos (textos e blocos). Custo: ver seção 4. |
| Polling e troca de conversa da análise antiga (R9 do PR #356) | (b) | Commit `c77d26c2` (`companion-analysis-controller.js`, `companion-core.js`, `yolen-api.js`). | O polling acompanha até o estado final. Sem chamada nova a modelo pela extensão. |

---

## 3. Yolen web

| Mudança | Classe | Evidência | Efeito para quem não está ligado; custo |
|---|---|---|---|
| Página do lead: resumo pela leitura do Companion | (a) | `app/leads/[id]/page.tsx:411-427, 671-715`. | Nenhum: sem a flag, o quadro é o de hoje. |
| Botão Copiloto: atalho para a leitura, sem análise paga | (a) | `page.tsx:1006-1010`; `CopilotTogglePanel.tsx:19-29`. | Nenhum. |
| Caixa "Orientações da IA" escondida | (a) | `CopilotTogglePanel.tsx:107` (só no ramo com `companionReadingHref`). | Nenhum. |
| Seção "Leitura do Companion" | (a) | `page.tsx:1014-1016`; `CompanionReadingsSection.tsx`. | Nenhum. |
| Rota `GET /api/sales-cycles/companion-readings` | (a) | `route.ts:35` (404 sem a flag). | Nenhum. |
| Pedido de fechamento pela URL (`?fechar=ganho\|perdido`) | (b), só abre o modal | `app/lib/cycle-closing-link.ts`; `sales-cycles/[id]/page.tsx` (repassa os parâmetros); `CyclePageTabs.tsx:165-200`. O link só é gerado pela leitura (`full-reading-panel-view.ts:1006, 1018`). | Sem a leitura, ninguém recebe o link. Se a URL tiver o parâmetro, o modal de sempre abre pré-preenchido; nada é salvo sem o vendedor. Sem custo. |
| `WinDealModal` e `LostDealModal` com `prefill` | (b) | `WinDealModal.tsx` (props `prefill`, efeitos de pré-preenchimento); `LostDealModal.tsx`. | Sem `prefill`, igual a hoje. |
| `/companion/connect` aceita a origem do preview | (b), só em preview | `app/companion/connect/page.tsx:95-110`. | Em produção, nada muda. |
| `ApplyAISuggestionRequest.preserve_next_action` | (b) no servidor, mas só usado pela leitura | `app/types/ai-sales.ts`; `apply-suggestion/route.ts` (sem flag). Só o cartão de etapa da leitura manda `true`. | Quem não manda o campo tem o comportamento de hoje. |

---

## 4. Servidor fora da leitura completa

### 4.1 O que veio do PR #356 (vale para todos depois do merge)

| Área | Evidência | O que muda para quem não está ligado |
|---|---|---|
| Motor comercial (tempo como evidência, coerência do coaching, reativação) | `commercial-temporal-context.ts`, `commercial-intelligence-coherence.ts`, `commercial-reasoning-engine.ts`, `commercial-coaching-engine.ts`, `commercial-techniques-engine.ts` | Conteúdo da AGORA, ANÁLISE e coaching da análise antiga. Determinístico; sem chamada nova. |
| Proveniência de fatos (firewall) | `commercial-fact-grounding.ts`, `canonical-fact-registry-loader.ts`, `canonical-*-source.ts` | Fatos sem fonte saem das telas e da MENSAGEM. Sem chamada nova. |
| MENSAGEM da análise antiga | `lead-seller-message.ts` | Máximo de chamadas ao modelo por geração igual ao da `main`: 3 tentativas + revisão + 1 reparo + revisão = 6 (`main`: 1291, 1308, 1335, 1371, 1404, 1442; HEAD: os seis `await` em 1951-2063). Muda o conteúdo (recuperação semântica pela estratégia, sem chamada). |
| Pipeline da análise antiga | `companion-deep-analysis-v3/route.ts` (diretiva de retry), `stateful-copilot-background-job.ts:56-83`, `stateful-copilot-background-worker.ts`, `companion-analysis-job-retry.ts` | Novas entregas da fila saem em segundos (3/10/20/30 s) em vez de 180 s. O máximo de entregas continua 5 (`STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS`, igual à `main`). Um job órfão é reaberto e republicado uma vez. Pode haver uma execução a mais do modelo para jobs que antes ficavam presos. |
| Isolamento produção/homolog | `companion-execution-scope.ts`; `stateful-copilot-supabase-reader/writer.ts`; migração `20260930020000` | Em produção, as tabelas canônicas de sempre. Preview usa `*_homolog`. |
| Identidade de build | `app/api/companion/build-identity/route.ts` | `GET` público novo, também em produção (ambiente e commit). |
| Trace factual | `method-guidance/route.ts:135-148` | Só em preview. |

### 4.2 Fora do PR #356, também sem a flag

| Área | Evidência | O que muda |
|---|---|---|
| `COMPANION_AI_PROVIDER` | `app/lib/companion/companion-ai-provider.ts:35-44, 50-78`; usado em `lead-summary/route.ts:487`, `method-guidance/route.ts:632`, `message-intelligence/v2/runner.ts:446, 462`, `stateful-copilot-composition.ts:371` | Sem a variável (ou com outro valor), OpenAI, como hoje. Com `anthropic`/`claude`, todas as chamadas da análise antiga passam ao Claude, para todos os vendedores do deployment. É global, não por vendedor. A transcrição de áudio continua na OpenAI. |
| Saída do Claude ajustada ao schema | `stateful-copilot-anthropic-provider.ts` (commit `bfe7d346`) | Só com `COMPANION_AI_PROVIDER=anthropic`. |
| Histórico recuperado não vira sessão atual; reanálise sem mensagem nova não rebaixa a leitura; ordem do mesmo minuto | Commits `15e142fd`, `9cb1206e`, `177e99a4` (`message-activity-time.ts`, `stateful-copilot-execution-plan.ts`, `stateful-copilot-engine.ts`, `stateful-copilot-runtime-orchestrator.ts`, `diagnostic-input.ts`) | Correções da análise antiga para todos. Sem chamada nova. |
| Rota de captura | `capture/messages/route.ts`; `capture-ingestion.ts` (`classifyCaptureRpcError`, `redactCaptureValidationText`) | Códigos de erro por validação (400 em vez de 500 para três validações), log sem conteúdo e leitura do ledger só na recusa de `base_version`. Sem custo de modelo. |
| `resolve-lead` | `route.ts:470-472, 1000-1002` | Capability `can_create_successor_opportunity` e novo texto para `CLOSED_CYCLE` (`main:948`: "Nova oportunidade deve ser criada dentro da Yolen."). |
| `successor-opportunity` | `app/api/companion/successor-opportunity/route.ts` (nova) | Rota nova sem flag; depende da migração `20261001150000`. |
| `apply-suggestion` | `preserve_next_action` | Ver seção 3. |

### 4.3 Rotas que respondem 409 no HML

Com a flag ligada: `ai/analyze-conversation`, `companion/analyze-conversation`,
`analysis-job-retry`, `lead-summary`, `method-guidance`,
`register-conversation/preview`, `v2/diagnostic-preview` (409
`LEGACY_AI_DISABLED`); as filas `companion-deep-analysis-v3` e
`message-intelligence-shadow-v1` fazem ack sem processar (linhas na seção 1).

Depois do merge, em produção (`VERCEL_ENV=production`), as travas ficam sempre
desligadas: nada muda para ninguém. A suíte `legacy-ai-guard.test.mjs` (5/5)
cobre os dois lados da trava.

---

## 5. Custos (chamadas a modelo que o ramo cria ou muda)

| Chamada | Onde dispara | O que limita | Com o botão desligado |
|---|---|---|---|
| Leitura completa (Claude; padrão `claude-sonnet-5-5`, `COMPANION_FULL_READING_MODEL`; esforço `COMPANION_FULL_READING_EFFORT`) | Planejador em `decision-state`/`analysis-view-model` → `after()` → `full-reading-runner.ts:1280` | Teto diário por empresa (`COMPANION_FULL_READING_DAILY_CAP`, padrão 100; `full-reading-panel.ts:161-191`), contando leituras + resumos de arquivo (`1073-1092`); rajada de 20 s; uma rodada por vez; debounce de 60 s; nova tentativa automática até 3 por conversa por hora (`228-232`); pausa de 5 min sem crédito (`220`). Por rodada: até 2 chamadas por modo (uma nova tentativa no 1º erro de JSON/schema) e uma completa depois de uma continuação que pede a conversa inteira, logo até 4. | Não acontece (`full-reading-panel.ts:2652`). |
| MENSAGEM da leitura (Claude; `COMPANION_FULL_READING_MESSAGE_EFFORT`) | `full-reading/message/route.ts` → `full-reading-message.ts:311` | Uma chamada por clique do vendedor. Sem teto diário nem limite por hora (D8). | Rota 404. |
| Resumo de arquivo (Claude Haiku; padrão `claude-haiku-4-5`, `COMPANION_ATTACHMENT_SUMMARY_MODEL`) | `full-reading/attachments/route.ts` → `full-reading-attachments.ts:542` | Conta no mesmo teto diário (`full-reading-attachments.ts:784-797`); 10 MB; foto pequena recusada antes da chamada. | Rota 404. |
| Transcrição automática (OpenAI; `gpt-4o-mini-transcribe`, reserva `whisper-1`) | Extensão (`companion-core.js:3696-3790`) → rota existente `/api/companion/transcribe-audio` (inalterada no ramo; `route.ts:548-579`) | Só na extensão: 6 por conversa por hora (`companion-analysis-controller.js:1639-1641`), áudio de até 5 min, um por vez, sem repetir áudio já transcrito. Limite em memória da página: recarregar zera. Nenhum limite novo no servidor (D7). | Não acontece (exige `isFullReadingPanelMode()`). |
| Análise antiga pelo Claude (`COMPANION_AI_PROVIDER=anthropic`; `COMPANION_ANTHROPIC_MODEL`, padrão `claude-sonnet-5-5`; `COMPANION_ANTHROPIC_EFFORT`, `COMPANION_ANTHROPIC_THINKING`) | Todas as chamadas da análise antiga | Mesmos limites da análise antiga. | Depende só da variável (global). Sem ela, OpenAI como hoje. |
| Análise antiga (PR #356) | Fila `companion-deep-analysis-v3`; MENSAGEM antiga | Máximo de 5 entregas (igual à `main`); MENSAGEM no máximo 6 chamadas (igual à `main`). Órfão republicado uma vez. | Acontece para todos, como hoje, com retry mais rápido. |

Proteção de custo que falha aberta: `countFullReadingRunsToday` devolve 0 se a
consulta falhar (`full-reading-panel.ts:1047-1070`); com erro na contagem, o
teto não segura.

---

## 6. Variáveis de ambiente que o ramo lê (só nomes)

| Nome | Quem lê | Precisa existir em produção para o piloto? |
|---|---|---|
| `COMPANION_FULL_READING_PANEL` | `full-reading-flag.ts:13` | Hoje sim, mas não basta: a regra exige `VERCEL_ENV=preview` (D1). |
| `VERCEL_ENV` | flag, escopo, rotas da leitura, connect, build-identity | A Vercel define. |
| `ANTHROPIC_API_KEY` | runner, message, attachments, run, provider Anthropic | Sim (leitura, MENSAGEM, arquivos). |
| `COMPANION_FULL_READING_MODEL` | `full-reading-runner.ts:133` | Opcional (padrão `claude-sonnet-5-5`). |
| `COMPANION_FULL_READING_EFFORT` | `full-reading-runner.ts:144` | Opcional. |
| `COMPANION_FULL_READING_MESSAGE_EFFORT` | `full-reading-message.ts:76` | Opcional. |
| `COMPANION_FULL_READING_DAILY_CAP` | `full-reading-panel.ts:186` | Opcional (padrão 100 por empresa). |
| `COMPANION_ATTACHMENT_SUMMARY_MODEL` | `full-reading-attachments.ts:43` | Opcional (padrão `claude-haiku-4-5`). |
| `COMPANION_FULL_READING_RUN_TOKEN` | `full-reading/run/route.ts:118` | Não: a rota não abre em produção. |
| `COMPANION_AI_PROVIDER` | `companion-ai-provider.ts:39` | Não para a leitura. Se existir, vale para todos (D9). |
| `COMPANION_ANTHROPIC_MODEL`, `COMPANION_ANTHROPIC_EFFORT`, `COMPANION_ANTHROPIC_THINKING` | `stateful-copilot-anthropic-provider.ts` | Só com `COMPANION_AI_PROVIDER=anthropic`. |
| `COMPANION_EXECUTION_SCOPE` | `companion-execution-scope.ts:58` | Não: na Vercel vale `VERCEL_ENV`. |
| `OPENAI_API_KEY` | já existia (transcrição, análise antiga) | Já existe. |
| `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` | clientes admin novos da leitura | Já existem. |
| `VERCEL_GIT_COMMIT_SHA` | `build-identity/route.ts:21`, runner | A Vercel define. |
| `VERCEL_URL`, `VERCEL_BRANCH_URL` | `companion/connect/page.tsx:102-105` | Só em preview. |
| `NODE_ENV` | escopo, rota run | Padrão. |
| `YOLEN_COMPANION_HOMOLOG_BASE_URL` | `build-package.mjs:247`, `scripts/companion-hml-local.mjs:73` | Só na máquina que gera o pacote HML; não é variável da Vercel. |

---

## 7. Pacote da extensão para os vendedores ligados

### 7.1 O build E2E hoje (`node build-package.mjs --e2e`)

| Item | Valor | Evidência |
|---|---|---|
| Backend | `https://cockpit-comercial-vocn.vercel.app` (produção) | `companionEnvironmentFor('e2e')`, `build-package.mjs:315-322`; `PRODUCTION_BASE_URL` em 234. |
| Origens aceitas | produção e `http://localhost:3000` | idem. |
| `MANYCHAT_CAPTURE_ENABLED` | `true` (fonte `src/manychat-feature-flags.e2e.js`) | `build-package.mjs:426-450`. |
| Canal no runtime | `e2e` | Não confere escopo de job (`yolen-api.js:29-32`) nem commit do backend (`backend_match_required: false`). Não mostra o cabeçalho HML nem o diagnóstico. |
| Nome e descrição | `Yolen Companion [E2E] <commit>`; descrição + " Internal E2E build — not for distribution." | `build-package.mjs:637-638, 816-826`. |
| ID no Firefox | `yolen-companion-e2e@gerson.local` (diferente do normal) | `build-package.mjs:643, 828-836`. |
| Manifesto | Mantém os hosts de desenvolvimento (`http://localhost/*`) | `build-package.mjs:645-650`. |
| Versão | A do manifesto (`1.5.2`), igual à do pacote normal | `manifest.json`. |
| Saída | `dist/yolen-companion/e2e/<alvo>/`, zip `yolen-companion-<alvo>-e2e-v<versão>.zip` | `build-package.mjs:1080-1086, 1184-1186`. |
| Já existia na `main` | Sim (STEP 2B.1). O ramo não mudou o backend do E2E. | `git show main:…/build-package.mjs` (linhas 233, 429, 470). |

### 7.2 Serve como pacote do piloto?

Ele já junta o que o dono pediu (ManyChat ligado + backend de produção). O que
o código mostra que falta ou difere de um pacote para vendedores:

1. Identificação: nome com `[E2E]` e a frase "Internal E2E build — not for
   distribution." no manifesto.
2. Hosts e origens de desenvolvimento (`localhost`) no manifesto e em
   `allowed_base_urls`, que o pacote PROD remove
   (`toProductionManifest`, `build-package.mjs:846-880`).
3. O canal `e2e` não confere o escopo do job (o PROD confere `production`).
4. No Firefox, ID diferente do pacote normal: os dois podem ficar instalados
   juntos no mesmo perfil e rodar na mesma aba do WhatsApp (D10).
5. Mesma versão (`1.5.2`) do pacote normal: pela versão, não dá para saber
   qual está instalado.
6. Não existe variante "PROD + ManyChat": as variantes são `dev`, `prod`,
   `homolog`, `homolog-manychat` e `e2e` (`build-package.mjs:1169-1191,
   1300-1323`). O pacote normal continua com `MANYCHAT_CAPTURE_ENABLED=false`
   (`build-package.mjs:446-451`), como o dono pediu.

---

## 8. Riscos para quem não estiver ligado depois do merge

| # | Risco | Evidência |
|---|---|---|
| R1 | Botão "Nova oportunidade" aparece para todos (extensão nova, ciclo fechado elegível). Se a migração `20261001150000` não estiver aplicada, o clique responde 503. O texto do `CLOSED_CYCLE` também muda para todos. | `resolve-lead/route.ts:470-472, 1000-1002`; cabeçalho da migração ("NÃO APLICADA"); `successor-opportunity/route.ts:253-270`. |
| R2 | O PR #356 entra junto: muda o conteúdo e a tela da análise antiga para todos (motor, firewall, MENSAGEM, selo de versão no cabeçalho) e acelera os retries da fila. | Seções 2.2 e 4.1. |
| R3 | A regra da flag exige `VERCEL_ENV=preview`: em produção nada liga, nem para a lista. Ligar por vendedor muda a regra em todos os pontos das seções 1.2 a 1.4. | `full-reading-flag.ts:12-15`. |
| R4 | Os pontos em segundo plano não têm vendedor (filas, runner): a decisão por vendedor precisa vir de outra fonte. | Seção 1.3. |
| R5 | As tabelas da leitura completa (`companion_full_reading_runs`, `companion_conversation_attachments`) não têm escopo de execução: HML (preview) e produção usam o mesmo banco e as mesmas linhas. Leituras feitas no HML para um ciclo apareceriam na produção (painel, página do lead, seção "Leitura do Companion"), e o teto diário conta as duas juntas (consulta só por `company_id` e data). | `full-reading-panel.ts:1047-1070`; colunas da migração `20260930060000` (tem `vercel_env`, que as consultas não filtram). |
| R6 | O teto diário falha aberto: erro na contagem vira 0. | `full-reading-panel.ts:1062-1069`. |
| R7 | `fullReadingPanelModeSeen` fica verdadeiro até a página recarregar: um vendedor desligado no meio do dia continua no modo da leitura até recarregar o WhatsApp. | `companion-core.js:254, 8350-8362`. |
| R8 | Patch global em `HTMLAnchorElement.prototype.click` na página do WhatsApp para todos (inerte sem o pedido do botão). | `whatsapp-audio-bridge.js` (bloco final). |
| R9 | `GET /api/companion/build-identity` passa a existir em produção, público, com ambiente e commit. | `app/api/companion/build-identity/route.ts`. |
| R10 | Mudanças de captura para todos (ordem pela tela, direção do anexo, áudio tocando, resiliência): melhoram a captura, mas mudam o ledger de quem não está ligado. | Seção 2.2. |
| R11 | Pacote do piloto com o vendedor fora da lista: ManyChat ligado com a análise antiga (eventos úteis entram como automação). | Seção 2.1, eventos do ManyChat. |

---

## 9. DÚVIDAS para o Controle Mestre

| # | Dúvida | Evidência |
|---|---|---|
| D1 | A regra de hoje exige `VERCEL_ENV=preview`. Em produção, o botão por vendedor substitui essa regra ou soma a ela? E o HML continua com a flag global? | `full-reading-flag.ts:12-15`. |
| D2 | A lista vale pelo vendedor que está usando (o `sub` do token ou a sessão da Yolen) ou pelo dono do ciclo (`sales_cycles.owner_user_id`)? Um gestor abrindo a conversa de um vendedor ligado vê a leitura nova? E na Yolen web, quem vê a página do lead? | `decision-state/route.ts:221-229` (empresa do token); `page.tsx:411-427` (`auth.user.id` de quem vê); `resolve-lead/route.ts:384` (`isOwnedByMe`). |
| D3 | Nos pontos sem vendedor (fila `companion-deep-analysis-v3`, runner em `after()`), a decisão vem do dono do ciclo, de um dado gravado no job/leitura, ou só do ponto de entrada com token? | Seção 1.3; jobs e `companion_full_reading_runs` sem coluna de solicitante. |
| D4 | "Nova oportunidade" (decisão do Controle Mestre de 01/10/2026, por capability) fica para todos ou entra no botão? A migração `20261001150000` está aplicada? | `resolve-lead/route.ts:466-472`; cabeçalho da migração. |
| D5 | O PR #356 entra na `main` antes, junto ou depois da leitura completa? Ele muda a tela e o pipeline da análise antiga para todos. | Seção 4.1. |
| D6 | Eventos internos do ManyChat são descartados na extensão para qualquer pacote com ManyChat: para o vendedor do pacote do piloto que estiver fora da lista, isso vale? | `manychat-message-profile.js:221-258`. |
| D7 | A transcrição automática só tem limite na extensão (6 por conversa por hora, em memória). Precisa de limite no servidor para produção? | `companion-analysis-controller.js:1639-1641`; rota `transcribe-audio` inalterada. |
| D8 | A MENSAGEM da leitura não conta no teto diário nem tem limite por hora. É aceitável em produção? | `full-reading/message/route.ts`; `full-reading-message.ts`. |
| D9 | `COMPANION_AI_PROVIDER` é global: fica fora da produção, ou entra junto com o botão? | `companion-ai-provider.ts:35-44`. |
| D10 | O pacote do piloto é o E2E como está (nome `[E2E]`, "not for distribution", `localhost`, canal sem conferência de escopo, ID próprio no Firefox, mesma versão) ou um pacote novo? Pode ficar instalado junto com o pacote normal? | Seção 7. |
| D11 | Status real das migrações no banco compartilhado (esta auditoria não consultou o banco): `20260930060000`, `20261001090000`, `20261001150000`, `20261003090000`, `20261003100000`. | Seção 0. |
| D12 | Leituras e arquivos gravados no HML (mesmo banco) devem aparecer em produção quando o vendedor for ligado? E o teto diário deve contar HML e produção juntos? | R5. |
| D13 | Teto diário: por empresa (como hoje) ou também por vendedor? O padrão de 100 vale para produção? | `full-reading-panel.ts:160-191`. |
| D14 | Vendedor desligado no meio da sessão: a extensão pode ficar no modo da leitura até recarregar a página? | R7. |

---

## 10. Decisões do Controle Mestre

DECISÕES

- D1: Preview continua global (COMPANION_FULL_READING_PANEL=on liga para todos). Produção: liga só com COMPANION_FULL_READING_PANEL=on e o usuário em COMPANION_FULL_READING_SELLER_IDS. Outros ambientes: desligado.
- D2: A lista vale para quem está usando (sub do token na extensão; usuário da sessão na Yolen web), não para o dono do ciclo.
- D3: As filas companion-deep-analysis-v3 e message-intelligence-shadow-v1 continuam com a regra global de preview (em produção processam como hoje). As rotas que criam esses jobs é que passam a recusar para quem está ligado. O runner em segundo plano herda a decisão da requisição que o agendou.
- D4: Nova oportunidade entra no botão: capability e rota só para quem estiver ligado. A migração 20261001150000 já está aplicada no banco (a função rpc_create_successor_cycle_from_companion existe). Não editar o arquivo da migração.
- D5: O PR #356 entra no mesmo pacote; as melhorias dele na análise antiga valem para todos (aceito pelo dono). Os PRs #356 e #351 serão fechados quando o pacote novo for aberto.
- D6: Aceito. O pacote do piloto só vai para quem está na lista; quem sair da lista volta ao pacote normal.
- D7: Sem limite novo de transcrição no servidor durante o piloto. O Controle Mestre acompanha o custo; revisar antes da liberação ampla.
- D8: Igual ao D7, para a MENSAGEM da leitura.
- D9: COMPANION_AI_PROVIDER não será definida em produção.
- D10: Pacote do piloto novo, não o E2E: igual ao pacote PROD (mesmo ID no Firefox, mesmas origens, sem localhost, confere o escopo production), com MANYCHAT_CAPTURE_ENABLED=true e a identificação "Piloto" no nome e no cabeçalho. Substitui o pacote normal no navegador do vendedor.
- D11: Banco conferido pelo Controle Mestre. 20260930060000: aplicada. 20261001090000: NÃO aplicada e não necessária (o código grava 'analysis_job'). 20261001150000: aplicada. 20261003090000: aplicada. 20261003100000: aplicada.
- D12: Cada ambiente vê só as próprias leituras: toda consulta a companion_full_reading_runs filtra pelo vercel_env do deployment. Os resumos de arquivo (companion_conversation_attachments) são compartilhados entre ambientes.
- D13: Teto diário por empresa e por ambiente, padrão 100. O teto falha fechado: erro na contagem não inicia leitura.
- D14: A extensão segue a capability da última resolução bem-sucedida da conversa atual. Durante o carregamento mantém o modo anterior; o modo não fica preso até recarregar a página.
