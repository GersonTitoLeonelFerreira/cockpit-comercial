# FASE 6 — REGISTRO DE EXECUÇÃO (ManyChatAdapter limpo)

Registro único da FASE 6 do Plano Mestre de Reconstrução do Companion
Multicanal ("Adapter ManyChat limpo"). A FASE 5 foi encerrada antes, na
mesma execução (ver `FASE_5_EXECUTION.md` §9). Nenhuma subfase foi criada;
a FASE 7 não foi iniciada.

## 1. Base efetiva e fontes

| Item | Valor |
|---|---|
| Branch | `claude/companion-multichannel-repair` |
| HEAD auditado no início | `988774aa5a394b69ea8b8a91f36944ddf233d767` (local = remoto, árvore limpa) |
| Base histórica da reconstrução | `0c95b7696775dd900ccdbf3eb9cc071155dd277a` |
| Referência congelada ManyChat | `claude/step-2b5-unified-companion-workspace @ 24f25c713b561cea977b16a0b0961b5642575ab2` (componentes examinados um a um; sem merge nem cherry-pick) |
| Fontes lidas | `COMPANION_CORE_ARCHITECTURE_CONTRACT.md` (§§5–8, 26, 29, 31), `COMPANION_STATE_PARITY_MATRIX.md`, `FASE_5_EXECUTION.md`, gates `MANYCHAT_*` desta pasta |

O texto do Plano Mestre (fases 0–11) não está versionado no repositório;
a execução seguiu o texto da FASE 6 recebido na instrução e o contrato,
que o incorpora (Q4 agendada para a FASE 6 no §31). Decisões Q1/Q2/Q3/Q5
e Q6 preservadas.

## 2. O que foi entregue

`src/manychat-channel-adapter.js` — `YolenManyChatChannelAdapter.create()`:
ChannelAdapter do ManyChat com a MESMA interface normalizada que o Core
consome do WhatsAppAdapter (a lista completa de membros é a
`CONTRACT_MEMBERS` do adapter de contrato da FASE 5 e é verificada por
teste). Só mecânica de plataforma: nenhuma copy comercial, HTML de
produto, estado seller-facing nem decisão de resolução, criação,
workspace, análise, registro ou enriquecimento (§29; gates A2/A10/A12/A18
sem violação no arquivo).

Não entra em nenhum content script do manifest nesta fase (teste). A
ligação ao Core usa o bootstrap compartilhado `companion-bootstrap.js`
(criado na FASE 5: `YolenCompanionBootstrap.create({ channelAdapter })`,
com `whenReady`/`startPlatform` do adapter) e fica para a FASE 7, junto
com a substituição do runtime legado.

### 2.1 Correspondência contrato §7 → ManyChatAdapter

| Contrato (conceitual) | Implementação | Mecânica |
|---|---|---|
| `platform` | `platform` | `{ id: 'manychat', displayName: 'ManyChat' }` |
| `getCurrentConversation` / `getConversationKey` | `getCurrentConversationKey`, `readConversationSnapshot` | Chave namespaced da rota autenticada (`manychat-surface.js`) só com a raiz `chat-messages-list` presente; `conversationType: 'unknown'`; `conversationTitle: ''` (sem nome confiável) |
| `getContactEvidence` | `getContactEvidence`, `acquireContactEvidence`, `revalidateConversationIdentity`, `forgetContactEvidence` | Identidade opaca `manychat:contact:v1:sha256:<64 hex>` pela bridge segura (dupla leitura + conversa conferida após cada espera); telefone por `manychat-phone-evidence.js`; `displayName: null` com `displayNameConfidence: 'unavailable'` |
| `getMessages` | `readVisibleMessageEntries`, `getSelectedChatActivitySnapshot` | `manychat-dom-reader` + perfil validado; `id = <conversationKey>::manychat:<data-mid>`; autoria `customer`/`human_agent`; automação excluída; áudio = `hasAudio`; duplicata → `null` (fail-closed) |
| `getLastOutgoingMessage` | `getLatestOutgoingVisibleMessageText` | Última mensagem `outgoing` de `human_agent` em texto |
| `subscribeToConversationChanges` | `observeHostChanges` | `conversation_changed` (rota) → `conversationInstanceChanged: true`; mutação → `false` + revalidação de identidade; devolve cancelamento |
| `getComposerState` / `applyMessage` | `getComposerState`, `applyMessage`, `insertTextIntoEmptyComposer`, `getComposerText`, `focusComposer`, `onComposerDraftInput` | Exatamente um `<textarea>` elegível; `busy` = com texto; substituição só com `replaceExisting` (confirmação do Core); escrita e verificação só com a conversa esperada aberta; nunca envia |
| `interceptSendAttempt` | `onSendAttempt`, `hasSendControl`, `triggerSend` | Indisponível (Q4): sem efeito; `capability_unavailable` |
| `getAudioSource` | `getVisibleAudioTargets`, `getAudioSource`, `listenToAudioBridge`, `resetCapturedAudio` | Handles opacos `{index,key,durationSeconds}`; fonte https única (`manychat-audio-source.js`); mídia pelo background (`FETCH_MANYCHAT_AUDIO_SOURCE`); handle invalidado na troca de conversa |
| `getMountPoint` | `getMountPoint` | `document.body` (container apenas; o Core cria e renderiza o painel) |
| `getCapabilities` | `getCapabilities` | Matriz da §3 |
| Ciclo de vida do bootstrap | `whenReady`, `startPlatform` | DOM pronto; a identidade segura já é carregada pelo manifest |

## 3. Q4 decidida por evidência técnica

| Capability | Decisão | Evidência |
|---|---|---|
| Nome confiável (`canProvideDisplayName`) | **NÃO COMPROVADO → indisponível** | Nenhuma fonte estruturada comprovada; `MANYCHAT_CONTEXT_EVIDENCE_LIVE_RESULT.md` e `MANYCHAT_MAINWORLD_IDENTITY_LIVE_RESULT.md` proíbem fallback por nome visível. Adapter: `displayName: null`, confiança `unavailable`; título vazio |
| Interceptação de envio (`canInterceptSend`) | **NÃO COMPROVADO → indisponível** | Nenhum gate validou o controle de envio nem a semântica de Enter no ManyChat. O Core não instala o gate de pré-envio (diferença declarada no contrato §7.2) |
| Detalhes de contato (`canRequestContactDetails`) | **UNSUPPORTED por política** | Exigiria navegação sintética (abrir "Exibir contato"), proibida; a regra de telefone validada funciona com o drawer fechado |
| Grupo/self (`canClassifyGroupOrSelf`) | **NÃO COMPROVADO → indisponível** | Nenhuma evidência de grupo/self; `conversationType: 'unknown'`, nunca inferido |
| Edição/exclusão (`canDetectDeletedOrEdited`) | **NÃO COMPROVADO → indisponível** | O reader só aceita exclusão explícita (`FASE_5_MANYCHAT_DOM_READER_ISOLATION.md`) e nenhuma marca foi validada ao vivo; desaparecimento do DOM nunca é exclusão |
| Última mensagem enviada | **SUPPORTED** (derivada) | Autoria humana validada (`MANYCHAT_SEMANTIC_AUTHORSHIP_GATE.md`, `_typeOut_` sem `_botMessage_`) + `data-mid` único |

Demais capabilities: telefone confiável CONDITIONAL, mensagens SUPPORTED,
troca de conversa SUPPORTED, inserção SUPPORTED, áudio CONDITIONAL, mount
SUPPORTED (contrato §8). Nenhum UNKNOWN foi promovido a suportado; nenhum
requisito obrigatório da FASE 6 depende das capabilities indisponíveis
(tipo de conversa, nome e operações opcionais são "quando comprovados"),
portanto não há bloqueio factual.

## 4. Registro por componente

| Componente | Decisão | Motivo |
|---|---|---|
| `manychat-surface.js` | Reutilizado | Chave namespaced da rota autenticada, sem DOM nem produto |
| `manychat-dom-reader.js` | Reutilizado | Perfil obrigatório, fail-closed, observer escopado à raiz, cancelamento, filtro da própria UI |
| `manychat-message-profile.js`, `-identity.js`, `-content.js` | Reutilizados | Identidade `data-mid` única + timestamp; automação fora; mista áudio+texto fail-closed |
| `manychat-message-semantics.js` | **Ajustado** | Removidas as flags de elegibilidade (`customer_evidence_eligible`, `seller_action_eligible`, `automation_context_only`, `reasoning_evidence_eligible`) — decisão de produto; fica só direção/autoria/`bot_message` |
| `manychat-composer.js` | **Ajustado** | `replaceExisting` opcional (padrão continua preservando rascunho); trazido da referência congelada o hardening que exclui `<textarea>` dentro do painel Yolen (o campo de intenção da MENSAGEM do Core tornaria o composer ambíguo); resolução estrutural e verificação mantidas; sem copy |
| `manychat-phone-evidence.js` | **Trazido da referência congelada + ajustado** | Regra validada ao vivo preservada (exclusão `details-subscriber-id`, contexto WhatsApp, 55+10/11 dígitos, 0/1/>1); acrescentada a exclusão da própria UI Yolen (um telefone exibido pelo Companion não se autovalida). Teste da referência trazido junto e ampliado |
| `manychat-safe-identity-bridge.js` / `-main.js` / `-background.js`, `manychat-identity-namespace.js` | Reutilizados (indiretamente) | Identidade opaca sanitizada; `subscriber_id` bruto nunca sai do MAIN world |
| `manychat-audio-source.js` | Reutilizado | Fonte https única por mensagem de áudio |
| `manychat-audio-background-transport.js` | **Ajustado** | `handleAudioSourceRequest` (`FETCH_MANYCHAT_AUDIO_SOURCE`): só a mídia validada, só para o frame principal de `app.manychat.com`, sem backend/transcrição/persistência; `background.js` roteia a ação |
| `manychat-panel-mount.js` | Rejeitado para o adapter | Cria e renderiza o painel (`setPanelContent`) — responsabilidade do Core; do módulo só se aproveita o fato comprovado (sem ancestral estável → body) |
| `manychat-adapter.js` (contrato universal legado) | Rejeitado para o adapter | Devolve o nó do composer e snapshots de captura; segue servindo o runtime legado até a FASE 7 |
| `manychat-capture-runtime.js` | Rejeitado para o adapter | Mistura captura/bookkeeping com orquestração comercial (`RESOLVE_LEAD`, ingestão, transcrição); a ideia validada de chave de mensagem escopada foi preservada no adapter (escopo por conversa + nova instância quando o contato muda na mesma rota) |
| `manychat-capture-bootstrap.js`, `manychat-seller-panel-runtime.js`, `manychat-contact-link-runtime.js` | Rejeitados | Produto seller-facing paralelo (baseline A2/A3/A5/A10) — substituídos pelo Core na FASE 7 |
| Diferenças da referência congelada em `manychat-capture-runtime.js`, `-capture-bootstrap.js` e `-seller-panel-runtime.js` | Rejeitadas | Orquestração comercial (estados de domínio da resolução, payload de resolução sanitizado, resolução por telefone, ledger de enriquecimento): pertence ao Core; nada disso entra no adapter |
| `manychat-audio-dispatch-runtime.js`, `-transcription-contract.js`, `-accessibility.js`, `-source-stability.js` | Não reutilizados | Probes/diagnóstico e plano de transcrição do runtime legado; o Core tem o próprio fluxo de transcrição |
| `manychat-context-evidence-probe.js`, `manychat-evidence-probe.js`, `manychat-mainworld-*`, `manychat-profile-*`, `manychat-runtime-*`, `manychat-authenticated-*` | Não reutilizados | Ferramentas de validação/diagnóstico já usadas para produzir as evidências |
| `manychat-feature-flags*.js` | Inalterados | ManyChat OFF em builds normais, ON só no build E2E |

## 5. Segurança, identidade e isolamento

- `subscriber_id` / `wa_id` nunca viram telefone (A18 sem violação; teste
  com o subscriber id sob `details-subscriber-id`).
- Telefone confiável só em memória, por instância de conversa; descartado
  na troca de rota e na troca de contato na mesma rota; sem log nem
  storage (teste estático do adapter).
- A ausência de telefone não elimina a identidade externa segura:
  `acquireContactEvidence` devolve `externalIdentity` também em
  `phone_unavailable`. Criação continua exigindo telefone confiável e
  decisão do Core.
- Eventos e efeitos revalidam o contexto vivo: evidência atrasada de A
  nunca é aplicada em B (`stale`); A→B→A exige evidência nova; handle de
  áudio de outra instância é recusado; escrita no composer só na conversa
  esperada.
- Homônimos: nenhum nome é usado como identidade. Colisão de
  identificadores: ids de mensagem escopados pela conversa; `data-mid`
  duplicado derruba a leitura (fail-closed); outro contato na mesma rota é
  nova instância (`identityChanged`).

## 6. Testes

- `tests/manychat-channel-adapter.test.mjs` (12): contrato completo +
  capabilities; conversa/rota; autoria, deduplicação, automação e áudio;
  identidade/telefone/subscriber id; stale (troca de conversa e de contato,
  A→B→A); revalidação de identidade; composer (rascunho, confirmação,
  conversa trocada, ambiguidade, nunca envia); eventos e cancelamento;
  áudio (handles, background, invalidação); campo de intenção do painel fora do composer; ausência de responsabilidades
  de produto; não-inclusão no manifest.
- `tests/manychat-phone-evidence.test.mjs` (13, da referência + UI própria).
- `tests/manychat-audio-background-transport.test.mjs` (+2: remetente e
  host validados, sem rede fora do permitido).
- `tests/manychat-message-semantics.test.mjs` e
  `tests/manychat-audio-source.test.mjs` reconciliados (a fixture "texto"
  carregava `<audio>`; o caso misto continua provado como fail-closed) — a
  última falha conhecida ManyChat saiu da lista.

## 7. Limitações e saldo reservado à FASE 7

- A baseline arquitetural continua com 12 entradas, todas do runtime
  seller-facing legado do ManyChat (`manychat-capture-bootstrap`,
  `manychat-contact-link-runtime`, `manychat-seller-panel-runtime`: A2/A3/
  A5/A10). Elas só saem quando a FASE 7 conectar o ManyChatAdapter ao Core
  pelo bootstrap compartilhado e remover esse runtime; nenhuma entrada foi
  adicionada ou reclassificada.
- Resolução por identidade externa (vínculo existente sem telefone) é do
  Core e entra na FASE 7; o adapter já entrega a evidência.
- Paridade completa é da FASE 8 e homologação da FASE 9; nada disto foi
  declarado aqui. Sem live test, rollout, PR, merge ou deploy.

## 8. Evidências finais (código entregue, fim da execução FASE 5 + FASE 6)

| Comando | Resultado | Exit |
|---|---|---|
| `node --test …/companion-core-architecture-gates.test.mjs` | 53/53; baseline 12 (todas ManyChat legado, FASE 7); 0 violação nova | 0 |
| `npm run test:companion` | 2378/2382; 4 falhas, todas conhecidas e vermelhas na base `0c95b769` | 1 |
| `npm run test:companion-authorization` | 266/266 | 0 |
| `node --test --test-force-exit …/e3-dom/*.test.mjs` | 266/266 | 0 |
| `./node_modules/.bin/tsc --noEmit` | limpo | 0 |
| `npm run lint` | 56 erros, os mesmos da base `0c95b769` (páginas/API não tocadas); 0 erro nos arquivos desta branch | 1 |
| `validate-release-candidate.mjs` | PASS; ManyChat OFF em dev/prod | 0 |
| `validate-release-candidate.mjs --e2e` | PASS; ManyChat ON só em e2e | 0 |
| `git diff --check` | limpo | 0 |
| `companion-known-failures-gate.mjs companion` | 4 conhecidas, 0 novas | 0 |
| `companion-known-failures-gate.mjs e3` | 0 falhas (lista vazia) | 0 |
| Testes focais (FASE 5 + FASE 6, 10 arquivos) | 97/97 | 0 |
| E3 focais (corrida da inserção, Core neutro, regressão WhatsApp) | 21/21 | 0 |

Falhas conhecidas restantes (fora do escopo, provadas vermelhas na base em
worktree isolada): `Final Release autoriza somente produção e
desenvolvimento local` (teste exige `http://localhost:3000/*`, manifest
declara `http://localhost/*`; permissão de host é distribuição) e três de
`app/lib` (backend): `acerto do vendedor exige ação concreta…`, `ponto de
melhoria exige problema comprovado…` (`GROUNDING_REQUIRED` ≠
`DIRECT_EVIDENCE_REQUIRED`) e `guardrail exige recovery completo…`
(exceção esperada não lançada).
