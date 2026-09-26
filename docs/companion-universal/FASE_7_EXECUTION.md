# FASE 7 — REGISTRO DE EXECUÇÃO (ManyChat conectado ao mesmo Core)

Registro único da FASE 7 do Plano Mestre de Reconstrução do Companion
Multicanal. Nenhuma subfase foi criada; a FASE 8 não foi iniciada.

## 1. Base efetiva

| Item | Valor |
|---|---|
| Branch | `claude/companion-multichannel-repair` |
| HEAD auditado no início | `34c5a36a94c65298a4b618d9e1cc9467fe8642b0` |
| Base histórica da reconstrução | `0c95b7696775dd900ccdbf3eb9cc071155dd277a` |
| Fontes | `COMPANION_CORE_ARCHITECTURE_CONTRACT.md` (§§7–10.4, 19, 20, 23, 25, 30.1), `COMPANION_STATE_PARITY_MATRIX.md`, `FASE_5_EXECUTION.md`, `FASE_6_EXECUTION.md` |

Commits anteriores preservados (correções da FASE 5, bootstrap
compartilhado, teste neutro do Core, infraestrutura da FASE 6,
comportamento WhatsApp aprovado). Sem recriação de branch, rollback,
force push, PR, merge, deploy ou live test.

## 2. Correção obrigatória do áudio (ManyChatAdapter)

Registrada em `FASE_6_EXECUTION.md` §9 (reprodução antes/depois).
Resumo: `getAudioSource` confere conversa viva, geração e identidade do
contato antes do efeito e depois da resposta, sem depender do snapshot nem
do observador; identidade não confirmável recusa com segurança; o Core
confere o contexto imutável da operação depois de cada espera da
transcrição. Validações de remetente/host/URL/tamanho preservadas; áudio
continua ligado.

## 3. Composição única

`manifest.json` (content script isolated `document_idle` de
`app.manychat.com`) carrega agora os MESMOS módulos compartilhados do
WhatsApp (API, views, fronteira, controllers, Core, bootstrap, runtimes de
estabilidade, `lead-automation`) + os módulos de plataforma ManyChat
(`platform-contract`, `manychat-surface`, `manychat-message-*`,
`manychat-dom-reader`, `manychat-composer`, `manychat-phone-evidence`,
`manychat-audio-source`, `manychat-channel-adapter`) + o kill switch
(`manychat-feature-flags.js`) + `manychat-content-script.js`.

`manychat-content-script.js` só age com `MANYCHAT_CAPTURE_ENABLED === true`
(pacote e2e); cria o ManyChatAdapter e chama
`YolenCompanionBootstrap.create({ channelAdapter }).start()`. Nenhuma
decisão comercial, de copy ou de apresentação acontece nele. O singleton
`__yolenCompanionRuntimeStarted` do bootstrap impede segunda instância,
segundo painel e assinaturas duplicadas.

Donos comerciais paralelos retirados (arquivos removidos, com seus testes):
`manychat-capture-bootstrap.js`, `manychat-seller-panel-runtime.js`,
`manychat-contact-link-runtime.js`, `manychat-capture-runtime.js`,
`manychat-panel-mount.js`, `manychat-audio-dispatch-runtime.js`. Saem da
composição (arquivos preservados como ferramentas diagnósticas fora do
manifest): `manychat-adapter.js` (adapter somente-leitura da FASE 4) e
`manychat-context-evidence-probe.js`.

Funcionalidades preservadas, agora pelos controllers compartilhados:

| Funcionalidade do runtime legado | Dono agora |
|---|---|
| Resolução por identidade segura | Core `resolveCurrentLead` (§10.4) |
| Status/copy seller-facing | Core + views (copy canônica) |
| AGORA/ANÁLISE/CLIENTE, análise, contexto do cliente | Core + controllers/views compartilhados |
| Vínculo manual (buscar → selecionar → confirmar → first-link) | `companion-contact-link-controller.js` (Core) |
| Captura de mensagens | Core (`INGEST_CAPTURE_MESSAGES`), chave estável `captureConversationKey` fornecida pelo adapter |
| Áudio/transcrição | Core (`transcribeNextVisibleAudio`) + `getAudioSource` do adapter (`FETCH_MANYCHAT_AUDIO_SOURCE`) |
| Painel | Core `createPanel` no container do adapter (`getMountPoint`) |

Novos no ManyChat pela composição única: criação de lead com telefone
confiável (formulário compartilhado), MENSAGEM (gerar/copiar/incluir),
resumo do lead, registro da conversa e enriquecimento confirmado.

## 4. Resolução por evidência (§10.4)

- Estado do Core `conversationExternalIdentity` (`{platform, key,
  channel}`), vindo do snapshot/aquisição do adapter; zerado na fronteira.
- Ordem: identidade → (`CONTACT_NOT_LINKED` + telefone confiável) telefone;
  só telefone → telefone; nenhuma → nada. Payload de identidade:
  `{platform, platform_contact_key}` (nunca `phone`).
- Erros de rede/auth/backend continuam erro (sem fallback, sem
  `NOT_FOUND`/`CONTACT_NOT_LINKED` sintético).
- A aquisição não depende de `canProvideTrustedPhone`; telefone só é aceito
  de canal que declara a capability.
- Cache: chave `ext:<platform>:<key>`; `CONTACT_NOT_LINKED` não é cacheado.
- Sessão recuperada (ausente → conectada) volta a resolver/adquirir
  evidência; antes a conversa aberta ficava sem consulta até outro evento.
- Sem nome confiável (Q4): o cabeçalho mostra "Conversa aberta" em vez de
  "Nenhuma conversa detectada".

Contrato de backend usado sem alteração: `/api/companion/resolve-lead`
(modo identidade e modo telefone), `/api/companion/link-lead/search`,
`/api/companion/link-lead` (first-link), `/api/companion/create-lead`,
`/api/companion/enrich-lead`. Nenhum contrato externo indispensável
faltou.

## 5. Privacidade (INV-6 / Q3 / §19.3)

`companion-background-privacy.js` (carregado no background antes de
`background.js`) reduz, para remetente `https://app.manychat.com`, as
respostas de `RESOLVE_LEAD` à allowlist Q3 (sem spread) e as de
`CREATE_LEAD` a `{ok, status, code, error}`. O content ManyChat nunca
recebe telefone cadastrado, `lead_id`, `lead_profile`, `owner_user_id` ou
URL com PII. O enriquecimento recebe `enrichment_context.fields`
(`present`/`missing`); o controller compartilhado só oferece campos
`missing`; o background reinjeta o `lead_id` a partir do `cycle_id`
autorizado (memória do background por aba; sem referência → recusa sem
rede). WhatsApp inalterado.

## 6. Harness = runtime (INV-9)

`tests/e3-test-support/load-manychat-composition.mjs` declara as listas
exatas da bridge isolated e do content script ManyChat e falha se
divergirem do manifest; reproduz o staging do build e2e (fonte e2e da flag
no mesmo pathname) e passa o transporte controlado pelo módulo REAL de
privacidade do background com remetente ManyChat. O harness WhatsApp
inclui o novo controller. O teste da FASE 6 que proibia o adapter no
manifest evoluiu para provar a composição correta (adapter só no ManyChat,
antes do Core/bootstrap, atrás do kill switch; flag normal `false`).

A composição efetiva expôs, ao ser executada, dois defeitos corrigidos:
`manychat-surface.js` exige `platform-contract.js` (ausente da lista nova)
e a copy "Nenhuma conversa detectada" com conversa aberta sem nome.

## 7. Testes

`tests/e3-dom/manychat-shared-composition.test.mjs` (22, ManyChatAdapter
real + bootstrap + Core + controllers/views pela composição do manifest):
composição única e segundo start sem duplicação; kill switch OFF sem
tráfego; §10.4 A (identidade sem telefone + allowlist entregue ao
content), B (fallback por telefone), C/D (sem evidência nada; sem vínculo e
sem telefone não cria); erro de backend na identidade; NOT_FOUND →
formulário → confirmação → CREATE único (duplo envio) → re-resolve →
workspace; CREATED_UNRESOLVED (só RESOLVE, nunca CREATE de novo); conflito;
vínculo manual completo (id do lead fora do DOM, duplo clique); estados
OWNED_BY_OTHER/IN_POOL/CLOSED_CYCLE sem ações não autorizadas; MENSAGEM
(gerar/copiar/incluir, composer ocupado, nunca envia); ANÁLISE (composer
ocupado exige confirmação, inserção confirmada, nunca envia); registro da
conversa; enriquecimento sanitizado (lead_id reinjetado) e campo privado
nunca sobrescrito; áudio/transcrição e áudio stale A → B; A → B → A com
resposta tardia; mesma rota com outro contato (CONTACT_CHANGED); sessão
ausente e recuperação; troca de empresa e perda de sessão.

Antes das correções (Core/controllers/adapter de `34c5a36a` na mesma
composição): 18 falhas; os 4 controles positivos (kill switch, criação por
telefone, CREATED_UNRESOLVED, conflito) passavam.

`tests/companion-background-privacy.test.mjs` (6, background.js real):
allowlist para ManyChat, reinjeção/recusa do `lead_id` (inclusive outra
aba), CREATE reduzido, WhatsApp inalterado (controle), remetente estrito,
sanitizador sem spread. Expôs a dependência do global `URL` na checagem de
remetente (corrigida para um padrão de origem estrito).

Neutro (`core-neutral-channel-adapter.test.mjs`, 14): fixture evoluída com
identidade externa e telefone adquirido junto; a asserção "sem
acquireContactEvidence sem capability de telefone" virou a regra nova
(aquisição acontece; sem evidência, nenhuma consulta); +2 casos §10.4.
Testes estruturais atualizados para o contrato evoluído: ordem do startup
(evidência = telefone OU identidade), boundary no manifest ManyChat,
ViewModel com `can_link_lead`, allowlist de leitura raw do enriquecimento,
listas do manifest/background.

## 8. Baseline arquitetural

12 → 0 pela remoção real das causas (ver contrato §30.1). Nenhum detector
alterado, nenhuma exceção nova. A asserção do relatório passou de "baseline
vazia é suspeita" para "baseline precisa estar vazia" (fim da
reconstrução); os self-tests seguem provando os detectores.

## 9. Evidências finais (HEAD `17dbf4db`, árvore limpa)

| Comando | Resultado | Exit |
|---|---|---|
| `node --test …/companion-core-architecture-gates.test.mjs` | 53/53; baseline 0; 0 violação nova | 0 |
| `npm run test:companion` | 2262/2266; 4 falhas, todas conhecidas e vermelhas na base `0c95b769` | 1 |
| `npm run test:companion-authorization` | 266/266 | 0 |
| `node --test --test-force-exit …/e3-dom/*.test.mjs` | 290/290 | 0 |
| `./node_modules/.bin/tsc --noEmit` | limpo | 0 |
| `npm run lint` | 56 erros, os mesmos da base (páginas/API não tocadas); 0 erro nos arquivos desta fase | 1 |
| `build-package.mjs` + `validate-release-candidate.mjs` | PASS; ManyChat OFF em dev/prod | 0 / 0 |
| `build-package.mjs --e2e` + `validate-release-candidate.mjs --e2e` | PASS; ManyChat ON só em e2e | 0 / 0 |
| `git diff --check` | limpo | 0 |
| `companion-known-failures-gate.mjs companion` | 4 conhecidas, 0 novas | 0 |
| `companion-known-failures-gate.mjs e3` | 0 falhas, 0 novas | 0 |

Falhas conhecidas (fora do escopo, provadas vermelhas na base na FASE 6):
`Final Release autoriza somente produção e desenvolvimento local`
(permissão de host `localhost:3000` × `localhost`, distribuição) e três de
`app/lib` (backend): `acerto do vendedor exige ação concreta…`, `ponto de
melhoria exige problema comprovado…`, `guardrail exige recovery completo…`.

## 10. Limitações

- WhatsApp continua recebendo o payload de resolução atual (dívida
  preexistente, fora da FASE 7).
- Referência privada do enriquecimento vive na memória do background: um
  reinício do service worker exige nova resolução antes de aplicar.
- Paridade completa é da FASE 8; homologação é da FASE 9. Sem live test.

## 11. Reauditoria da FASE 7 (instrução de 26/09/2026)

Execução da mesma FASE 7 (sem subfase) contra o checklist ampliado da
nova instrução. Primeiro gate: estado real do repositório, não o handoff.

### 11.1 Estado real × handoff

| Item do handoff | Estado real verificado (git + GitHub) |
|---|---|
| PR #338, HEAD `7a0717ec` | **Mergeado** em `main` em 2026-09-24 (`0c95b769`, "Merge pull request #338 …"); `7a0717ec` é ancestral de `origin/main` |
| `main` = `cf50fac3` | `main` = `0c95b769` (`cf50fac3` era a base do PR #338, merge do #337/login) |
| Branch de trabalho | `claude/companion-multichannel-repair` sobre `0c95b769`, com FASES 5–7 já entregues; HEAD `24528b26` = remoto; árvore limpa; nenhuma alteração de terceiros |
| Known failures 9 (companion) / 3 (E3) | Lista real: 4 / 0. Só diminuiu desde `7a0717ec` (retiradas por correção em `dc0974dd`, FASE 5); nenhuma entrada adicionada |
| LEGACY=26 | 0 (FASE 5 retirou 14; FASE 7 retirou as 12 do ManyChat legado) |
| GitHub Actions | Últimas execuções são do PR #338 (`36062588757`, `36062588647`): jobs concluídos em ~2 s sem passos — compatível com o bloqueio de billing relatado → **BILLING_BLOCKED**. A branch atual não tem PR, logo nenhum workflow (`pull_request`) rodou nela → **NOT RUN** |

Nada foi desfeito; o merge do #338 foi preservado e a fase continuou na
branch atual (nenhum PR duplicado aberto).

### 11.2 Inventário ManyChat (antes = legado removido em `6d77bddf`; depois = atual)

| Módulo | No manifest | Categoria | Observação |
|---|---|---|---|
| `manychat-channel-adapter.js` | cs ManyChat | A/B infra + integração com o Core | Implementa o ChannelAdapter (§7); nenhum status/copy comercial |
| `manychat-content-script.js` | cs ManyChat | B integração | Kill switch + cria adapter + `YolenCompanionBootstrap` |
| `manychat-surface.js`, `platform-contract.js` | cs ManyChat | A | Rota/chave da conversa; contrato universal de mensagens |
| `manychat-dom-reader.js`, `manychat-message-{semantics,identity,content,profile}.js` | cs ManyChat | A | Leitura/normalização de mensagens (fail-closed) |
| `manychat-composer.js` | cs ManyChat | A | Composer físico; ignora o textarea do painel Yolen |
| `manychat-phone-evidence.js` | cs ManyChat | A | Telefone confiável só em contexto WhatsApp fora de `details-subscriber-id` |
| `manychat-audio-source.js` | cs ManyChat | A | Fonte https única por mensagem |
| `manychat-feature-flags.js` | cs ManyChat | A | Kill switch (false; e2e = true no staging) |
| `manychat-safe-identity-bridge.js` | cs ManyChat (document_start) | A | Identidade opaca via background |
| `manychat-safe-identity-main.js`, `manychat-identity-namespace.js`, `manychat-mainworld-*` | cs MAIN | A | Leitura da identidade no page world + diagnóstico armado só por hash |
| `manychat-audio-background-transport.js`, `manychat-safe-identity-background.js` | background | A | Transporte validado (host/remetente/tamanho) |
| `manychat-adapter.js`, `manychat-context-evidence-probe.js`, `manychat-evidence-probe.js`, `manychat-profile-*`, `manychat-runtime-{admission,bootstrap}.js`, `manychat-authenticated-*`, `manychat-audio-{accessibility,source-stability,transcription-contract}.js` | não | D | Ferramentas diagnósticas/validação das fases anteriores; não executam na extensão |
| `manychat-capture-bootstrap/runtime`, `seller-panel-runtime`, `contact-link-runtime`, `panel-mount`, `audio-dispatch-runtime` | — (removidos) | C (antes) | Segundo cérebro seller-facing; removidos na FASE 7 |

Varredura por símbolos seller-facing (AGORA/MENSAGEM/ANÁLISE/CLIENTE,
status comerciais, ações `LOAD_*`/`RESOLVE_LEAD`/…, recommendation,
reasoning, next action) nos módulos compostos: só falsos positivos
(`composer_not_found`, flags `reasoning_enabled: false`, comentários).
**Segundo cérebro seller-facing: NONE.**

### 11.3 Enforcement e testes adicionados

- `tests/manychat-channel-only-architecture.test.mjs` (6): nenhum módulo
  ManyChat composto contém status comercial, ação comercial de backend,
  área seller-facing, view/estado do Core ou campo de decisão; o content
  script só toca bootstrap/fronteira; Core/controllers/views/bootstrap
  compartilhados não contêm global, arquivo, host, seletor ou mensagem de
  transporte ManyChat; a composição ManyChat carrega exatamente os mesmos
  módulos compartilhados do WhatsApp na mesma ordem. Cada regra tem
  controle positivo sintético.
- `manychat-shared-composition.test.mjs` (+8, total 30):
  - mesmo domínio → AGORA/MENSAGEM/ANÁLISE/CLIENTE com HTML idêntico no
    WhatsApp e no ManyChat (normalizados só nome do canal e chaves de
    conversa), com capabilities diferentes (Q4);
  - composer indisponível (feedback canônico "Use Copiar");
  - inserção não confirmada (nunca "incluída");
  - erro físico do adapter na MENSAGEM e na ANÁLISE;
  - conversa trocada no instante da inserção (nada escrito em B);
  - análise de A concluída depois da troca (nada em B, sem inserção);
  - áudio com transporte indisponível (sem transcrição, áudio pendente).

### 11.4 Defeito encontrado e corrigido (Core, neutro de canal)

Um erro físico do adapter (DOM do composer lançando exceção) escapava do
Core como exceção não tratada, sem feedback — na MENSAGEM
(`insertIntoComposer`) e na ANÁLISE (`getComposerState`/`applyMessage`).
O Core agora converte a falha física no resultado canônico
(`insert_failed` / composer indisponível / `apply_failed`), sem registrar
uso. Antes: 0/2 testes (exceção `falha física do DOM do ManyChat`);
depois: 2/2. Vale para qualquer canal.

### 11.5 Observações (não alteradas)

- O texto de status da transcrição/inserção da ANÁLISE é gravado num
  bloco legado que o layout atual das quatro áreas não exibe — igual no
  WhatsApp (mesmo Core). Não é bifurcação do ManyChat; mudar a UX aprovada
  está fora desta fase (candidato à FASE 8/10).

### 11.6 Adiado

- **FASE 8:** matriz completa de paridade automatizada (aqui só a prova de
  mesmo estado seller-facing para um domínio e os cenários de fronteira).
- **FASE 9:** comportamento ao vivo do DOM real do ManyChat (seletores,
  bridge de identidade no page world, mídia real) — só verificável em live
  test; todos os fluxos automatizáveis foram provados em jsdom.
