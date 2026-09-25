# COMPANION STATE PARITY MATRIX

| Campo | Valor |
|---|---|
| Versão | 1.1.0 (FASE 2.1 — hardening) |
| Fase | FASE 2 / 2.1 — Contrato arquitetural definitivo |
| Branch | `claude/companion-core-rebuild` |
| Base | `b5d877a18843b5653c79adc2c5396447d2a99310` |
| Contrato irmão (autoritativo) | `COMPANION_CORE_ARCHITECTURE_CONTRACT.md` |

---

## 1. Objetivo

Definir, cenário por cenário, o resultado seller-facing ÚNICO do Yolen
Companion e o que cada ChannelAdapter fornece para chegar a ele. A matriz
é a referência de aceite das fases posteriores: um canal está em paridade
somente quando todos os cenários aplicáveis produzem o resultado esperado
com a autoridade no Core.

Estados canônicos (19, definidos em §10 do contrato): `BOOT_LOADING`,
`NO_SESSION`, `CONNECTED_NO_CONVERSATION`, `NON_LEAD_CONVERSATION`,
`NO_CONTACT_EVIDENCE`, `RESOLVING`, `NOT_FOUND`, `LEAD_CREATE_READY`,
`CREATING_LEAD`, `CREATED_RESOLVING`, `CREATED_UNRESOLVED`, `OWNED_BY_ME`,
`IN_POOL`, `OWNED_BY_OTHER`, `CLOSED_CYCLE`, `RESOLUTION_ERROR`,
`NETWORK_ERROR`, `BACKEND_ERROR`, `WORKSPACE_READY`.

---

## 2. Como ler a matriz

| Coluna | Significado |
|---|---|
| **#** | Número do cenário |
| **STATE / SCENARIO** | Estado canônico ou cenário |
| **CORE AUTHORITY** | Controller/módulo conceitual do Core que decide (nomenclatura do §4 do contrato) |
| **EXPECTED SELLER-FACING RESULT** | Resultado único esperado, idêntico em todos os canais |
| **WA INPUT/CAP** | O que o WhatsAppAdapter fornece / capability usada |
| **MC INPUT/CAP** | O que o ManyChatAdapter fornece / capability usada |
| **ALLOWED DIFF** | Única diferença de plataforma permitida (ou "Nenhuma") |
| **FORBIDDEN DIFF** | Diferença explicitamente proibida |
| **AUTO** | Teste automatizado exigido: `CORE` (unitário do Core com adapter fake), `DOM` (integração com harness = manifest), `ADP` (teste do adapter), `BE` (backend) |
| **LIVE** | Teste ao vivo exigido: `WA`, `MC`, `WA+MC` ou `—` |

Abreviações de autoridade: `state` = companion-state; `boundary` =
companion-conversation-boundary; `resolution` =
companion-lead-resolution-controller; `creation` =
companion-lead-creation-controller; `workspace` = companion-workspace;
`message` = companion-message-controller; `analysis` =
companion-analysis-controller; `client` = companion-client-controller;
`summary` = companion-lead-summary-controller; `registration` =
companion-conversation-registration-controller; `enrichment` =
companion-lead-enrichment-controller.

Nenhuma célula de CORE AUTHORITY aponta para adapter.

---

## 3. Regra de paridade

1. Para o mesmo estado de domínio e o mesmo estado do Core, o resultado
   seller-facing é idêntico em todos os canais (mesmo estado, mesma copy,
   mesmos CTAs, mesmas transições, mesmos retries).
2. A única variação permitida é a declarada na coluna ALLOWED DIFF de cada
   cenário, restrita à lista do §27 do contrato.
3. Quando uma capability necessária não existe, o Core apresenta o mesmo
   estado canônico de indisponibilidade que apresentaria em qualquer canal
   sem essa capability.
4. Capability diferente NÃO significa produto diferente.
5. Resolução e criação seguem a ordem canônica do §10.4 do contrato:
   `trustedPhone` é obrigatório para **criação**; não é obrigatório para
   **resolver** um lead existente por identidade externa segura (casos
   A–D, cenários #4a–#4d).

---

## 4. Capability legend

| Capability | WhatsApp | ManyChat |
|---|---|---|
| `canProvideTrustedPhone` | CONDITIONAL | CONDITIONAL |
| `canProvideDisplayName` | CONDITIONAL | NÃO COMPROVADO → indisponível (Q4, FASE 6) |
| `canReadMessages` | SUPPORTED | SUPPORTED |
| `canObserveConversationChanges` | SUPPORTED | SUPPORTED |
| `canApplyMessage` | SUPPORTED | SUPPORTED |
| `canInterceptSend` | SUPPORTED | NÃO COMPROVADO → indisponível (Q4, FASE 6) |
| `canReadAudio` | SUPPORTED | CONDITIONAL (FASE 6: fonte https validada + download pelo background) |
| `canRequestContactDetails` | SUPPORTED | UNSUPPORTED por política (Q4, FASE 6) |
| `canClassifyGroupOrSelf` | SUPPORTED | NÃO COMPROVADO → indisponível (Q4, FASE 6) |
| `canDetectDeletedOrEdited` | SUPPORTED | NÃO COMPROVADO → indisponível (Q4, FASE 6) |
| `canProvideMountPoint` | SUPPORTED | SUPPORTED |

SUPPORTED = existe e é usado em runtime; CONDITIONAL = existe, nem sempre
produz o dado; UNSUPPORTED = comprovadamente ausente; UNKNOWN = sem
evidência (TO BE VERIFIED). Evidências no §8 do contrato.

---

## 5. Matriz dos cenários (64)

| # | STATE / SCENARIO | CORE AUTHORITY | EXPECTED SELLER-FACING RESULT | WA INPUT/CAP | MC INPUT/CAP | ALLOWED DIFF | FORBIDDEN DIFF | AUTO | LIVE |
|---|---|---|---|---|---|---|---|---|---|
| 1 | boot/loading (`BOOT_LOADING`) | state | Indicador "Conectando com a Yolen..." único; nenhum dado comercial | `getMountPoint`, plataforma pronta | `getMountPoint`, plataforma pronta | Momento em que a plataforma fica pronta | Texto/estado de boot diferente; painel comercial antes da sessão | CORE, DOM | WA+MC |
| 2 | no session (`NO_SESSION`) | state (session) | Mesma copy + CTA "Conectar Yolen"; nenhum dado comercial | nenhum | nenhum | Nenhuma | Status textual sem CTA em um canal (ex.: rótulo `NO_COMPANION_SESSION` do bootstrap ManyChat) | CORE, DOM | WA+MC |
| 3 | conversation absent (`CONNECTED_NO_CONVERSATION`) | state | Painel conectado sem conversa: "Nenhuma conversa detectada" ou equivalente canônico | `getCurrentConversation()` = null | `getCurrentConversation()` = null | Nenhuma | Workspace parcial visível | CORE, DOM | WA+MC |
| 4a | trusted phone unavailable, `platformIdentity` resolve lead existente (§10.4 caso A) | resolution | Resolução comercial continua normalmente: estado comercial correspondente (#15–#18) e workspace conforme Q2; criação indisponível (não necessária) | `trustedPhone` ausente; WA hoje não fornece `platformIdentity` (resolve por telefone) | `platformIdentity` segura (`platform_contact_key`) | Qual evidência resolveu | Exigir telefone para abrir o Companion; bloquear workspace por falta de telefone | CORE, ADP, DOM | MC |
| 4b | trusted phone unavailable + identidade não resolve (§10.4 caso C) → `NO_CONTACT_EVIDENCE` | resolution | "Identificando contato..." (ou equivalente canônico); sem criação de lead; sem telefone inferido | `getContactEvidence` → `unavailable/pending`; pode usar `requestVisibleContactDetails` | `getContactEvidence` → `unavailable/ambiguous` (phone evidence fail-closed) + `CONTACT_NOT_LINKED` | Método de busca do telefone; WA pode tentar abrir "Dados do contato" | Criar lead sem telefone; usar `subscriber_id`/`wa_id`/`platformIdentity` como telefone; mensagem diferente entre canais | CORE, ADP, DOM | WA+MC |
| 4c | NOT_FOUND sem trustedPhone (resultado sem lead obtido só por identidade) | resolution + creation | Tratado como caso C: `NO_CONTACT_EVIDENCE`; criação **não** disponível; nenhum formulário | sem `trustedPhone` | `platformIdentity` sem vínculo, sem `trustedPhone` | Nenhuma | Oferecer formulário/CREATE sem telefone confiável | CORE, DOM | MC |
| 4d | NOT_FOUND com trustedPhone (§10.4 caso D) | resolution + creation | `NOT_FOUND` → `LEAD_CREATE_READY`; criação disponível (ver #6, #7) | `trustedPhone` | `trustedPhone` (fallback do caso B) | Método de obtenção do telefone | Um canal oferecer criação e o outro não com `trustedPhone` disponível | CORE, DOM | WA+MC |
| 5 | resolving (`RESOLVING`) | resolution | "Localizando este contato na Yolen..."; ações bloqueadas; ordem de tentativa identidade → telefone decidida pelo Core/transporte (§10.4) | `trustedPhone` | `platformIdentity`, com fallback por `trustedPhone` quando disponível (caso B) | Identificador opaco enviado ao backend | Spinner/texto distinto; UI comercial antes do resultado | CORE, DOM | WA+MC |
| 6 | `NOT_FOUND` (por `trustedPhone`) | resolution | Card "Este contato ainda não existe na Yolen" + oferta "Novo contato" (quando `can_create_lead`) + sinal de atenção; exige `trustedPhone` (sem ele ver #4c) | `trustedPhone` | `trustedPhone` | Nenhuma | Um canal só texto e outro com formulário (padrão atual ManyChat) | CORE, DOM | WA+MC |
| 7 | create form ready (`LEAD_CREATE_READY`) | creation | Formulário Nome (obrigatório, sugerido por display name confiável), Telefone (readonly, trusted), E-mail e CPF/CNPJ (opcionais, sugeridos por enrichment) | `trustedPhone`, `displayName` | `trustedPhone`, `displayName` indisponível (Q4, FASE 6: sem sugestão de nome) | Presença de sugestão de nome conforme `canProvideDisplayName` | Formulário diferente; telefone editável; nome sugerido de display name não confiável/que parece telefone | CORE, DOM | WA+MC |
| 8 | creating (`CREATING_LEAD`) | creation | "Criando lead na Yolen..."; submit desabilitado | nenhum (payload já no Core) | nenhum | Nenhuma | Estado ausente em um canal | CORE, DOM | WA+MC |
| 9 | duplicate create click | creation | Um único CREATE por `conversation_key`; cliques extras são no-op | nenhum | nenhum | Nenhuma | Segundo CREATE; tratamento distinto | CORE, DOM | WA |
| 10 | `active_lead_conflict` | creation | Transição para `CREATED_RESOLVING`; nenhum segundo CREATE | nenhum | nenhum | Nenhuma | Exibir erro de criação; reabrir formulário | CORE, BE | — |
| 11 | `concurrent_create_conflict` | creation | Transição para `CREATED_RESOLVING`; nenhum segundo CREATE | nenhum | nenhum | Nenhuma | Idem #10 | CORE, BE | — |
| 12 | created_resolving (`CREATED_RESOLVING`) | creation + resolution | "Lead criado. Atualizando o vínculo..."; re-resolve com backoff finito | `trustedPhone` revalidado | `trustedPhone` revalidado | Nenhuma | Polling indefinido; retry diferente | CORE, DOM | WA+MC |
| 13 | created_unresolved (`CREATED_UNRESOLVED`) | creation | "Lead criado, mas o vínculo ainda não foi atualizado." + "Atualizar vínculo"; formulário NUNCA reaparece | nenhum | nenhum | Nenhuma | Formulário/"Criar lead" visível; CREATE disponível | CORE, DOM | WA+MC |
| 14 | retry link | creation + resolution | "Atualizar vínculo" dispara RESOLVE; qualquer RESOLVE ≠ NOT_FOUND encerra a pendência | `trustedPhone` | `trustedPhone` | Nenhuma | Disparar CREATE; pendência presa após resolve global | CORE, DOM | WA+MC |
| 15 | `OWNED_BY_ME` | resolution → workspace | "Lead vinculado à sua carteira."; display autorizado por Q3; `WORKSPACE_READY` quando existe `cycle.id`, `can_analyze_conversation=true` e `is_closed=false` | nenhum adicional | nenhum adicional | Campo display pode ser null/omitido por autorização server-side | Workspace decidido pelo adapter; payload bruto; aba faltando/extra | CORE, DOM | WA+MC |
| 16 | `IN_POOL` | resolution → workspace condicional | Mensagem de domínio + CTA "Abrir Pool na Yolen"; workspace somente com `cycle.id` + `can_analyze_conversation=true` + `is_closed=false`; sem capability, não abre workspace | nenhum | nenhum | Capability pode variar pela autorização do usuário | Abrir workspace apenas por status; ManyChat/WhatsApp divergirem com o mesmo ViewModel | CORE, DOM | WA+MC |
| 17 | `OWNED_BY_OTHER` | resolution → workspace condicional | Mensagem de domínio + CTA canônico; workspace somente com `cycle.id` + `can_analyze_conversation=true` + `is_closed=false`; ações internas continuam capability-gated | nenhum | nenhum | Capability pode variar pela autorização do usuário | Abrir workspace apenas por status; expor dado não autorizado; habilitar sugestão sem capability | CORE, DOM | WA+MC |
| 18 | `CLOSED_CYCLE` | resolution | "Este ciclo comercial já está encerrado." (ou `user_message`) + CTA canônico; `is_closed=true` impede `WORKSPACE_READY`, captura e análise comercial ativa | nenhum | nenhum | Nenhuma | Workspace aberto porque `can_analyze_conversation` legacy veio true; análise disparada; copy contraditória | CORE, DOM | WA+MC |
| 19 | resolution network error (`NETWORK_ERROR`) | resolution | Mensagem canônica de falha de rede + retry manual/automático definido pelo Core; nunca cacheado como resolução | nenhum | nenhum | Nenhuma | Cachear erro como resolução; copy diferente | CORE, DOM | WA+MC |
| 20 | resolution backend error (`BACKEND_ERROR` / `RESOLUTION_ERROR`) | resolution | Mensagem canônica ("Não foi possível consultar o vínculo na Yolen.") + retry | nenhum | nenhum | Nenhuma | Idem #19 | CORE, DOM | — |
| 21 | AGORA loading | workspace (agora) | Estado de carregamento da área AGORA | nenhum | nenhum | Nenhuma | Área vazia silenciosa em um canal | CORE, DOM | WA+MC |
| 22 | AGORA ready | workspace (agora) | Decision state, prioridade, próxima ação, sinais persistidos; atenção no painel recolhido | nenhum | nenhum | Nenhuma | Snapshot diferente por canal | CORE, DOM | WA+MC |
| 23 | AGORA empty | workspace (agora) | Estado vazio canônico (preparação) | nenhum | nenhum | Nenhuma | Fallback distinto | CORE | — |
| 24 | AGORA error | workspace (agora) | Erro canônico + retry | nenhum | nenhum | Nenhuma | Erro engolido (padrão ManyChat `ready:false` silencioso) | CORE, DOM | — |
| 25 | MENSAGEM ineligible | message | Área MENSAGEM mostra estado de preparação (sem composer) | nenhum | nenhum | Nenhuma | Regra de elegibilidade diferente | CORE, DOM | — |
| 26 | MENSAGEM ready | message | Composer seller-facing: objetivo, presets, instrução, "Gerar mensagem" | nenhum | nenhum | Nenhuma | Presets/intent diferentes | CORE, DOM | WA+MC |
| 27 | MENSAGEM generating | message | Loading de geração; ação desabilitada | nenhum | nenhum | Nenhuma | Estado ausente | CORE, DOM | — |
| 28 | MENSAGEM generated | message | Resultado + "Inserir no {platformDisplayName}" + "Copiar" | nenhum | nenhum | Label com nome do canal | Ações diferentes; copy distinta além do nome | CORE, DOM | WA+MC |
| 29 | MENSAGEM stale | message | Resultado de contexto antigo descartado; nenhum texto de A em B | `getConversationKey` | `getConversationKey` | Nenhuma | Aplicar resultado stale | CORE, DOM | — |
| 30 | composer busy | message | Feedback canônico "O campo do {canal} já contém texto..." ; nada inserido | `getComposerState().busy` | `getComposerState().busy` | Nome do canal | Sobrescrever rascunho; copy em adapter | CORE, ADP | WA+MC |
| 31 | apply message | message | Inserção + feedback canônico "Mensagem inserida no {canal}. Revise antes de enviar." ; fallback "Use Copiar" em falha | `applyMessage` | `applyMessage` | Seletor/evento físico; nome do canal | Mapeamento de feedback no adapter; envio automático | CORE, ADP | WA+MC |
| 32 | ANALYSIS idle | analysis | Vazio progressivo canônico + ação "Analisar agora" quando elegível | nenhum | nenhum | Nenhuma | Ação ausente num canal | CORE | — |
| 33 | ANALYSIS automatic scheduled | analysis | Agendamento por política única (debounce) após resolução/mudança de conteúdo | `messages_mutated` | `messages_mutated` | Origem física do evento | Análise a cada captura (padrão ManyChat congelado); debounce diferente | CORE, DOM | WA+MC |
| 34 | ANALYSIS queued | analysis | "Analisando…" (queued) | nenhum | nenhum | Nenhuma | Estado ausente | CORE | — |
| 35 | ANALYSIS processing | analysis | "Analisando…" (processing) + polling da política única | nenhum | nenhum | Nenhuma | Polling diferente | CORE | — |
| 36 | ANALYSIS ready | analysis | View model de análise do contexto atual; "Analisar novamente" | nenhum | nenhum | Nenhuma | Composição diferente | CORE, DOM | WA+MC |
| 37 | ANALYSIS failed | analysis | Erro canônico + "Tentar novamente" | nenhum | nenhum | Nenhuma | Spinner preso; copy diferente | CORE | — |
| 38 | ANALYSIS superseded | analysis | Mensagem canônica de conversa alterada + retry | nenhum | nenhum | Nenhuma | Idem #37 | CORE | — |
| 39 | ANALYSIS timeout | analysis | Mensagem canônica de demora + retry; watchdog único | nenhum | nenhum | Nenhuma | Timeout distinto por canal | CORE | — |
| 40 | ANALYSIS outdated | analysis | Indicação de leitura desatualizada + ação de atualizar | fingerprint via mensagens | fingerprint via mensagens | Nenhuma | Declarar outdated "inaplicável" em um canal | CORE, DOM | — |
| 41 | CLIENT loading | client | Loading da área CLIENTE | nenhum | nenhum | Nenhuma | Área vazia silenciosa | CORE | — |
| 42 | CLIENT ready | client | Composição única: contexto, relacionamento, customer view model, enrichment, registro | nenhum | nenhum | Nenhuma | Cards faltando por falta de wiring | CORE, DOM | WA+MC |
| 43 | CLIENT error | client | Erro canônico sem apagar cards válidos + retry | nenhum | nenhum | Nenhuma | Erro engolido | CORE | — |
| 44 | lead summary loading | summary | Loading do resumo | nenhum | nenhum | Nenhuma | Caminho de carga distinto | CORE | — |
| 45 | lead summary ready | summary | Resumo + orientação de método; habilita MENSAGEM | nenhum | nenhum | Nenhuma | Method guidance só em um canal | CORE, DOM | WA+MC |
| 46 | lead summary save | summary | "Salvando…" → salvo; CAS com versão esperada | nenhum | nenhum | Nenhuma | Save sem CAS | CORE, BE | WA+MC |
| 47 | lead summary conflict | summary | Estado de conflito canônico + recarregar | nenhum | nenhum | Nenhuma | Sobrescrever versão nova | CORE, BE | — |
| 48 | lead summary error | summary | Erro canônico + "Tentar novamente" | nenhum | nenhum | Nenhuma | Copy distinta | CORE | — |
| 49 | registration preview | registration | Prévia do registro + confirmar/cancelar | `conversation_key`, mensagens | `conversation_key`, mensagens | Nenhuma | Elegibilidade diferente | CORE, DOM | WA+MC |
| 50 | registration confirm | registration | "confirming" → success (ou já registrado) | nenhum | nenhum | Nenhuma | Confirmação sem token de prévia | CORE, BE | WA+MC |
| 51 | registration stale | registration | Estado stale canônico + "Gerar novamente" | `conversation_key` | `conversation_key` | Nenhuma | Aplicar confirmação em outro contexto | CORE | — |
| 52 | enrichment same | enrichment | Candidato oculto | mensagens | mensagens (ledger) | Nenhuma | Exibir candidato igual | CORE | — |
| 53 | enrichment missing | enrichment | Candidato confirmável (confirmar/ignorar) | mensagens | mensagens | Nenhuma | Não oferecer em um canal | CORE, DOM | WA+MC |
| 54 | enrichment different | enrichment | Candidato confirmável conforme política, com valor atual quando autorizado | mensagens | mensagens | Nenhuma | Regra de comparação diferente | CORE, BE | — |
| 55 | enrichment phone same | enrichment | Oculto (semântica `same`, sem valor atual) | mensagens | mensagens | Nenhuma | Exibir telefone cadastrado | CORE, BE | — |
| 56 | enrichment phone missing | enrichment | Confirmável | mensagens | mensagens | Nenhuma | Idem | CORE, BE | — |
| 57 | enrichment phone `different_private` | enrichment | Confirmável sem revelar o telefone atual | mensagens | mensagens | Nenhuma | Vazar raw phone ao content; semântica existir só em um canal | CORE, BE | MC |
| 58 | enrichment stale | enrichment | Apply rejeitado por CAS/contexto; estado canônico de conflito | nenhum | nenhum | Nenhuma | Escrita sem CAS | CORE, BE | — |
| 59 | conversation A → B | boundary | Reset total (§20 do contrato); área = AGORA; nada de A visível em B | `conversation_changed` | `conversation_changed` | Mecanismo de detecção | Reset parcial; área de A herdada | CORE, DOM, ADP | WA+MC |
| 60 | conversation A → B → A | boundary | Somente estado persistível/reconstruível reaparece; nenhum conteúdo de B em A | `conversation_changed` ×2 | `conversation_changed` ×2 | Nenhuma | DOM de B sobre A; dedup que pula repaint | CORE, DOM, ADP | WA+MC |
| 61 | stale async response from A while on B | boundary + todos controllers | Resposta descartada (`STALE_RESULT`); nenhuma mutação de estado de B | `getConversationKey` ao vivo | `getConversationKey` ao vivo | Nenhuma | Loader sem guard de contexto (padrão ManyChat congelado) | CORE, DOM | — |
| 62 | session/company change | state (session) + boundary | Invalidação de todo estado comercial; view models com `company_id` divergente descartados; volta a `BOOT_LOADING` | nenhum | nenhum | Nenhuma | Manter dados da empresa anterior | CORE, DOM | WA |
| 63 | audio supported | analysis (transcrição) | Transcrição incluída na análise; estado de transcrição canônico | `getAudioSource` | `getAudioSource` | Método físico de obter áudio | Estado de transcrição diferente | CORE, ADP | WA+MC |
| 64 | audio unavailable | analysis | Mesmo Companion; análise segue sem áudio com indicação canônica de áudio não transcrito | `CAPABILITY_UNAVAILABLE` | `CAPABILITY_UNAVAILABLE` | Capability indisponível | Esconder áreas; comportamento distinto do Core | CORE | — |

### 5.1 Cenários complementares (evidência da base)

| # | STATE / SCENARIO | CORE AUTHORITY | EXPECTED SELLER-FACING RESULT | WA INPUT/CAP | MC INPUT/CAP | ALLOWED DIFF | FORBIDDEN DIFF | AUTO | LIVE |
|---|---|---|---|---|---|---|---|---|---|
| 65 | group/self (`NON_LEAD_CONVERSATION`) | resolution | "Conversas em grupo não são vinculadas a leads." / "Esta conversa não é vinculada a um lead comercial." ; sem busca de telefone | `kind: group/self` | `kind: unknown` (Q4 decidida na FASE 6: sem classificação; nunca inferido) | Capability `canClassifyGroupOrSelf` | Resolver grupo como lead | CORE, ADP | WA |
| 66 | `LEAD_WITHOUT_CYCLE` / `SOFT_DELETED` / `MULTIPLE_MATCHES` → `RESOLUTION_ERROR` | resolution | Exibir `user_message` canônico do backend/Core + CTA para corrigir na Yolen; sem criação, análise ou `WORKSPACE_READY`; retry volta a `RESOLVING` | nenhum | nenhum | Nenhuma | Estado próprio por canal; rótulo/copy definido em adapter; formulário de criação; escolher lead automaticamente; abrir workspace | CORE, DOM | — |
| 67 | pré-envio (gate) | message (pre-send) | Avaliação e gate de pré-envio canônicos | `interceptSendAttempt` | indisponível (Q4 decidida na FASE 6) — gate não instalado (diferença declarada) | Capability `canInterceptSend` | Regra de avaliação distinta | CORE, ADP | WA |
| 68 | painel recolhido com atenção | workspace | Ponto de atenção por sinal canônico; reconhecimento ao abrir | nenhum | nenhum | Nenhuma | Atenção só em um canal | CORE, DOM | — |

Total documentado: **71 linhas de cenário** — os 64 cenários obrigatórios, com o cenário 4 dividido em 4a/4b/4c/4d (67 linhas), + 4 complementares (#65–#68).

---

## 6. A → B / stale matrix

| Recurso | Ao sair de A (`conversation_changed`) | Resposta tardia de A enquanto em B | Ao voltar para A |
|---|---|---|---|
| Resolução de lead | Invalidação de in-flight; cache só para resultado de domínio | Descartada | Reusa cache de domínio da identidade ou re-resolve |
| Criação de lead | Retries de re-resolve param; rascunho isolado | Descartada (`applied: false`) | Estado de criação só se ainda pendente e reconstruível; nunca formulário após CREATE confirmado |
| AGORA | Reset para `idle` | Descartada por `cycle_id`/`conversation_key`/`company_id`/sequence | Recarregada |
| MENSAGEM | Engine limpo; composer seller-facing removido | Descartada | Recarregada a partir do resumo |
| ANÁLISE | Timers (debounce, polling, watchdog) cancelados | Descartada | Recarregada; `outdated` recalculado |
| CLIENTE | Reset; ticker/refresh cancelados | Descartada | Recarregada |
| Lead summary | Reset; draft isolado | Descartada | Recarregada |
| Registro | Reset | Descartada | `idle` |
| Enrichment | Reset; ignore por chave com contexto | Descartada | Recalculado |
| Área ativa | `now` | — | `now` |
| DOM do painel | Render forçado na fronteira | — | Render forçado; dedup não pode pular repaint |
| Ledger de mensagens | Isolado por identidade/conversa | Captura rejeitada se a identidade não possui mais a captura | Reconstruído |

---

## 7. Privacy matrix

| Dado | WhatsApp content | ManyChat content | Backend | Regra |
|---|---|---|---|---|
| Telefone da conversa | Trusted evidence em memória | Trusted evidence em memória (DOM fail-closed) | Recebe para resolve/create | Nunca de `subscriber_id`/`wa_id` |
| Telefone cadastrado | Não necessário | Não recebe | Mantém | Semântica `same/missing/different_private` |
| `lead_id` | Não recebe no `DomainResolutionViewModel` | Não recebe no `DomainResolutionViewModel` (FASE 7: o content ManyChat não recebe `lead_id` algum; o background reinjeta pelo `cycle_id`) | Deriva por `cycle_id` ou identificador autorizado | Não cruza apenas para ser devolvido |
| Lead name / owner name / cycle status | Allowlist sanitizada, nullable conforme autorização server-side | Mesma allowlist sanitizada, nullable conforme autorização server-side | Autoriza/omite | Nenhuma diferença de schema por canal (Q3 DECIDIDA) |
| Payload de resolução | `DomainResolutionViewModel` allowlisted | Mesmo `DomainResolutionViewModel` allowlisted | Mantém raw privilegiado server-side | Nenhum spread de payload bruto; raw phone/PII não atravessam |
| Identidade de plataforma | JID (opaco) | `platform_contact_key` (opaco) | Recebe | Nunca exibida; nunca telefone; válida para resolver vínculo existente, nunca para criação |
| Mensagens/áudio | Memória | Memória | Persistência server-side | Nunca storage do browser |
| Storage do browser | Sessão + preferências de UI | Sessão + preferências de UI | — | Sem PII por conveniência |

---

## 8. Backend/action parity

FASE 7: a coluna ManyChat descreve a referência congelada @24f25c7; a
composição atual do ManyChat usa exatamente as ações da coluna WhatsApp
pelo mesmo Core (resolução por identidade e fallback por telefone em
`RESOLVE_LEAD`, `CREATE_LEAD`, `APPLY_LEAD_ENRICHMENT`, `TRANSCRIBE_AUDIO`
com a fonte obtida por `FETCH_MANYCHAT_AUDIO_SOURCE`, e o vínculo manual
`SEARCH_LINKABLE_LEADS`/`FIRST_LINK_EXTERNAL_IDENTITY` pelo controller único
do Core).

| Operação conceitual | WhatsApp (base) | ManyChat (@24f25c7) | Alvo |
|---|---|---|---|
| Resolve lead | `RESOLVE_LEAD` (phone) | `RESOLVE_LEAD` (platform key) + `RESOLVE_MANYCHAT_LEAD_BY_PHONE` (sanitizado) | Um contrato de resolução no Core → Domain Resolution ViewModel; rota por telefone pode diferir por privacidade |
| Create lead | `CREATE_LEAD` | inexistente | `CREATE_LEAD` único via Core quando há trusted phone |
| View models (AGORA/ANÁLISE/CLIENTE/contexto) | `LOAD_*` | `LOAD_*` (mesmas ações) | Mesmas ações, loaders únicos no Core |
| Lead summary | `LOAD/SAVE_LEAD_SUMMARY` via wrappers | Idem via controller | Controller único |
| Method guidance | `LOAD_METHOD_GUIDANCE` | Idem | Fluxo único |
| Análise | `ANALYZE_CONVERSATION` + `GET_ANALYSIS_JOB_STATUS` | Idem | Política única |
| Registro de conversa | `PREVIEW/CONFIRM_CONVERSATION_REGISTRATION` | Idem via controller | Controller único |
| Enrichment context | derivado em memória | `LOAD_LEAD_ENRICHMENT_CONTEXT` | Contrato único; UNKNOWN / TO BE VERIFIED qual fonte |
| Enrichment apply | `APPLY_LEAD_ENRICHMENT` (`/enrich-lead`) | `APPLY_MANYCHAT_LEAD_ENRICHMENT` | Rotas podem diferir por privacidade; regra de escrita no core server-side compartilhado |
| Captura | `INGEST_CAPTURE_MESSAGES` | Idem | Transporte compartilhado; gatilho no adapter |
| Transcrição | `TRANSCRIBE_AUDIO` + `LOAD_AUDIO_TRANSCRIPTIONS` | `TRANSCRIBE_MANYCHAT_AUDIO` (transporte de áudio ManyChat) | Estado no Core; transporte por capability |
| Link manual | — | `SEARCH_LINKABLE_LEADS`, `FIRST_LINK_EXTERNAL_IDENTITY` (sem consumidor) | Não usar como base de UI; reavaliar em fase própria |

---

## 9. Automated coverage requirements

1. Todo cenário com `CORE` na coluna AUTO tem teste unitário do Core com
   adapter fake (sem DOM de plataforma).
2. Todo cenário com `DOM` tem teste de integração cujo harness carrega a
   mesma composição efetiva do manifest (gate A9).
3. Todo cenário com `ADP` tem teste do adapter provando que ele só entrega
   dados/capabilities (gates A2, A12).
4. Todo cenário com `BE` tem teste de rota/core server-side
   (autorização, CAS, allowlist).
5. Cenários 1–31 (incluindo 4a–4d) e 59–64 são executados com os DOIS adapters fake
   (WhatsApp e ManyChat) produzindo o mesmo resultado do Core.
6. Os 18 gates do §30 do contrato são pré-requisito de toda cobertura.

---

## 10. Live acceptance requirements

Cenários com `WA`, `MC` ou `WA+MC` na coluna LIVE exigem validação em
ambiente real:

- WhatsApp: extensão de build normal.
- ManyChat: canal de build e2e isolado (kill switch ligado apenas nesse
  canal).
- Evidência registrada por cenário: estado exibido, ações disponíveis,
  resultado após A → B → A.
- Nenhum aceite ao vivo substitui teste automatizado.

---

## 11. Forbidden divergence examples

Exemplos concretos comprovados pela auditoria (a reconstrução não pode
reproduzi-los):

| Exemplo | Onde foi encontrado | Cenário |
|---|---|---|
| NOT_FOUND como texto sem oferta de criação | `manychat-capture-bootstrap.js` `STATUS_LABELS` | #6 |
| IN_POOL/OWNED_BY_OTHER sem CTA | idem | #16, #17 |
| Análise disparada a cada captura | `manychat-seller-panel-runtime.js#handleCaptureResult` | #33 |
| `outdated` declarado inaplicável | `manychat-seller-panel-runtime.js` (comentário e ausência) | #40 |
| Loaders sem guard de contexto/sequence | `manychat-seller-panel-runtime.js` `loadClientContext`/`loadSimpleViewModel` | #61 |
| Copy de feedback do composer no código de canal | `mapWhatsAppApplyResult`, `mapManyChatApplyResult` | #30, #31 |
| Elegibilidade de captura usada como decisão de UI | `manychat-capture-runtime.js` `resolution.ready` | #15–#18 |
| Controllers usados por um canal só | `companion-lead-summary/registration/enrichment-controller.js` (@24f25c7) | #44–#58 |
| Dois contratos de enrichment | `APPLY_LEAD_ENRICHMENT` vs `APPLY_MANYCHAT_LEAD_ENRICHMENT` | #52–#58 |
| Estado global com reset (WA) vs mapa por conversa (MC) | `content-script.js` vs seller-panel runtime | #59–#61 |

---

## 12. Definition of parity complete

Paridade está completa quando:

1. Todas as 71 linhas de cenário (64 obrigatórios, com #4 dividido em 4a–4d, + 4 complementares) têm CORE
   AUTHORITY implementada no Core e nenhuma decisão em adapter.
2. Toda cobertura AUTO exigida existe e passa.
3. Todo aceite LIVE exigido foi registrado.
4. Toda diferença observada entre canais está listada em ALLOWED DIFF.
5. Nenhum exemplo do §11 se reproduz.
6. As questões Q1–Q4 e Q6 do DECISION SCHEDULE (§31 do contrato) foram
   decididas nas fases indicadas (Q5 já DECIDED / OUT OF SCOPE FOR WRITE),
   e os cenários #4a, #15–#17, #65–#67 foram atualizados em nova versão
   desta matriz.
