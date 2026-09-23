# COMPANION CORE ARCHITECTURE CONTRACT

> Existe um único Yolen Companion.
>
> WhatsApp e ManyChat são adapters de canal.
>
> Nenhuma regra comercial, estado seller-facing, decisão de produto
> ou interface funcional do Companion pode existir separadamente
> por plataforma.

```
                    YOLEN COMPANION CORE
                            |
              +-------------+-------------+
              |                           |
       WhatsAppAdapter              ManyChatAdapter
              |                           |
          plataforma                   plataforma
```

---

## 1. Status e autoridade do documento

| Campo | Valor |
|---|---|
| Versão | 1.0.0 |
| Fase | FASE 2 — Contrato arquitetural definitivo |
| Data de início da reconstrução | 2026-09-23 |
| Branch de reconstrução | `claude/companion-core-rebuild` |
| Base | `b5d877a18843b5653c79adc2c5396447d2a99310` (main oficial no momento da auditoria) |
| Branch de referência congelada (somente evidência) | `claude/step-2b5-unified-companion-workspace` @ `24f25c713b561cea977b16a0b0961b5642575ab2` |
| Documento irmão | `COMPANION_STATE_PARITY_MATRIX.md` |

Este documento e `COMPANION_STATE_PARITY_MATRIX.md` são o contrato
**AUTORITATIVO** da reconstrução do Companion multicanal. Todas as fases
posteriores (3, 4, …) DEVEM cumpri-lo. Em caso de conflito:

1. este contrato prevalece sobre qualquer outro documento em
   `docs/companion-universal/` (os demais são **histórico** do
   desenvolvimento anterior e não são reescritos);
2. este contrato prevalece sobre comentários de código e sobre testes
   existentes — um teste passar NÃO prova que a arquitetura está correta;
3. alterações a este contrato só podem ser feitas por decisão explícita do
   Controle Mestre, com incremento de versão.

Convenção: onde a auditoria (Fases 0/1) não produziu evidência suficiente,
o contrato marca **UNKNOWN / TO BE VERIFIED**. Isso nunca pode ser
preenchido por suposição de implementação.

---

## 2. Objetivo

Estabelecer, antes de qualquer extração de código:

- a fronteira única entre **Companion Core** (produto) e **ChannelAdapter**
  (plataforma);
- a máquina de estados seller-facing canônica, única para todos os canais;
- os contratos de cada área e controller do Core;
- as regras de privacidade, estado assíncrono, fronteira de conversa,
  composição de dependências e harness de teste;
- as travas arquiteturais (gates) que a FASE 3 deve implementar para
  impedir regressão para uma segunda implementação do Companion.

Motivação comprovada pela auditoria: a branch congelada contém uma
segunda implementação parcial do Companion no ManyChat
(`manychat-seller-panel-runtime.js`, `manychat-capture-bootstrap.js`
`renderStatus()/STATUS_LABELS`, uso de `resolution.ready` de
`manychat-capture-runtime.js` como decisão de UI). A base `b5d877` também
contém, atrás do kill switch, uma versão menor dessa UI paralela. O
WhatsApp (`content-script.js` @ `b5d877`) contém a lógica de produto mais
completa, misturada com código de plataforma, e é a fonte de extração do
Core.

---

## 3. Invariantes

**INV-1 — Companion único.** Existe um único Yolen Companion. Toda
regra comercial, estado seller-facing, decisão de produto, copy e CTA
existe exatamente uma vez, no Core.

**INV-2 — Não se porta função entre canais.**

> "Nenhuma funcionalidade do Companion é portada do WhatsApp para o ManyChat.
>
> Se uma funcionalidade existe no Companion, ela pertence ao Core.
>
> WhatsApp e ManyChat apenas fornecem capacidades de plataforma ao mesmo Core."

**INV-3 — Capability diferente NÃO significa produto diferente.**
Adapters diferem em *como* obtêm um dado; depois que o dado é entregue ao
Core no formato do contrato, o Core executa o MESMO fluxo.
Exemplo: o WhatsApp obtém telefone por JID/bridge ou painel "Dados do
contato"; o ManyChat obtém telefone por evidência confiável do DOM. Ambos
entregam `trustedPhone`; a partir daí resolução, NOT_FOUND e criação de
lead são idênticos.

**INV-4 — Adapter não é source of truth de produto.** Hierarquia:

```
Domain/backend truth
        ↓
Companion Core state
        ↓
Shared ViewModel
        ↓
Shared seller-facing view
        ↓
Platform mount
```

**INV-5 — Sem telefone confiável não há lead.** Não se cria lead, não se
infere telefone, não se usa `subscriber_id` nem `wa_id` como telefone,
não se inventa dado (Decisão do Controle — ver §9, §10, §11).

**INV-6 — Privacidade ManyChat.** Nenhuma parte da arquitetura pode exigir
que o content script ManyChat receba payload bruto de lead (Decisão do
Controle — ver §9 e §23).

**INV-7 — Isolamento de conversa.** Nenhum resultado, estado, timer ou DOM
da conversa A pode alterar ou aparecer na conversa B (§20).

**INV-8 — Composição explícita.** Controllers do Core são compostos por
dependências/interfaces explícitas, não por monkey-patch nem por ordem
implícita de carga (§26).

**INV-9 — Harness = runtime.** O harness de integração reproduz a mesma
composição efetiva do manifest/runtime real (§25).

**INV-10 — Kill switch ManyChat fail-closed.** `MANYCHAT_CAPTURE_ENABLED`
permanece `false` em canais de build normais (dev/prod); só o canal e2e
isolado pode ligá-lo.

---

## 4. Arquitetura oficial

```
                    YOLEN COMPANION CORE
                            |
              +-------------+-------------+
              |                           |
       WhatsAppAdapter              ManyChatAdapter
              |                           |
          plataforma                   plataforma
```

Camadas:

| Camada | Responsabilidade | Exemplos conceituais |
|---|---|---|
| Backend / domínio | Verdade comercial, autorização, escrita | `/api/companion/*`, `app/lib/server/*` |
| Transporte de extensão | Sessão, token, roteamento de ações, sanitização de fronteira | `background.js`, `capture-transport.js`, safe identity background |
| Companion Core | Estado, transições, controllers, ViewModels, views, copy, CTAs, renderer do painel | ver nomenclatura abaixo |
| ChannelAdapter | Leitura/escrita física da plataforma, capabilities | `whatsapp-adapter`, `manychat-adapter` |
| Plataforma | WhatsApp Web / ManyChat | — |

### Nomenclatura conceitual futura

Não são arquivos a criar nesta fase. Extensão de arquivo e estrutura de
pastas serão confirmadas na FASE 4 conforme dependências reais.

| Nome conceitual | Responsabilidade |
|---|---|
| `companion-core` | Composição raiz; recebe um `ChannelAdapter` e o transporte |
| `companion-state` | Estado seller-facing canônico e transições |
| `companion-conversation-boundary` | Fronteira A → B, tokens de contexto, cancelamento |
| `companion-lead-resolution-controller` | Resolução de lead → Domain Resolution ViewModel |
| `companion-lead-creation-controller` | Máquina de criação de lead |
| `companion-workspace` | Shell de 4 áreas, composição e renderer do painel |
| `companion-message-controller` | MENSAGEM |
| `companion-analysis-controller` | ANÁLISE (política única) |
| `companion-client-controller` | CLIENTE |
| `companion-lead-summary-controller` | Resumo do lead |
| `companion-conversation-registration-controller` | Registro de conversa |
| `companion-lead-enrichment-controller` | Enriquecimento de cadastro |
| `whatsapp-adapter` | ChannelAdapter do WhatsApp |
| `manychat-adapter` | ChannelAdapter do ManyChat |

Os nomes `companion-lead-summary-controller`,
`companion-conversation-registration-controller` e
`companion-lead-enrichment-controller` coincidem com módulos da branch
congelada; a auditoria classificou esses módulos como **REFACTOR** (hoje
consumidos apenas pelo ManyChat). A coincidência de nome não os torna
automaticamente conformes a este contrato.

---

## 5. Definição de Core

O Core é a **ÚNICA** autoridade sobre:

- lifecycle seller-facing;
- session state seller-facing;
- conversation state;
- resolution state;
- loading;
- errors;
- retries;
- NOT_FOUND;
- lead creation;
- creating;
- created_resolving;
- created_unresolved;
- OWNED_BY_ME;
- OWNED_BY_OTHER;
- IN_POOL;
- CLOSED_CYCLE;
- AGORA;
- MENSAGEM;
- ANÁLISE;
- CLIENTE;
- lead summary;
- seller message;
- lead enrichment;
- conversation registration;
- seller attention;
- commercial decisions;
- presentation rules;
- seller-facing copy;
- seller-facing CTAs;
- state transitions;
- reset de conversa;
- stale result rejection em controllers comerciais;
- shared panel/view composition.

Adapter **NÃO** pode possuir nenhuma dessas decisões.

Regras adicionais do Core:

- **DOM.** O Core NÃO pode: fazer `querySelector` de plataforma; instalar
  `MutationObserver` de plataforma; conhecer classes/seletores do WhatsApp;
  conhecer classes/seletores do ManyChat; conhecer JID; conhecer
  `subscriber_id`; conhecer React Fiber; conhecer hostname específico
  (`web.whatsapp.com`, `app.manychat.com`).
  **Exceção:** o renderer do próprio painel Yolen pode operar sobre o DOM
  que ELE controla, desde que receba o mount/container por interface
  (`getMountPoint()`).
- **Imports.** O Core não importa/consome `manychat-*` nem `whatsapp-*`.
- **Nome do canal.** O Core pode receber `platformDisplayName` do adapter
  (ex.: `"WhatsApp"`, `"ManyChat"`) apenas para interpolar em copy canônica
  (ex.: "Inserir no {platformDisplayName}"). Isso não autoriza UI paralela.

---

## 6. Definição de Adapter

Um `ChannelAdapter` pode **somente**:

- detectar se a plataforma está pronta;
- identificar a conversa aberta;
- produzir `conversation_key`;
- obter identidade da conversa;
- obter telefone com evidence;
- obter display name quando confiável;
- identificar grupo/self quando a plataforma permitir;
- ler mensagens;
- identificar autoria;
- identificar mensagem deletada/editada;
- detectar troca de conversa;
- emitir eventos de plataforma;
- localizar o composer;
- ler estado físico do composer;
- inserir texto no composer;
- detectar tentativa física de envio quando suportado;
- obter áudio/blob quando suportado;
- informar capabilities;
- fornecer mount point/container físico para o Companion;
- executar operações inevitavelmente específicas da plataforma.

O adapter **NÃO** pode interpretar comercialmente os dados obtidos.

O adapter informa falha **técnica** (classes do contrato de erro abaixo e
razões técnicas do §7); o Core decide a apresentação seller-facing. O adapter nunca
escreve copy comercial final.

### Contrato de erro

| Classe | Origem | Quem decide apresentação |
|---|---|---|
| `PLATFORM_UNAVAILABLE` | Adapter (plataforma não pronta, DOM ausente) | Core |
| `CAPABILITY_UNAVAILABLE` | Adapter (capability não suportada/indisponível agora) | Core |
| `NETWORK_ERROR` | Transporte | Core |
| `AUTH_ERROR` | Transporte/backend (sessão ausente, token inválido/expirado) | Core |
| `BACKEND_ERROR` | Backend (5xx, resposta inválida) | Core |
| `DOMAIN_ERROR` | Backend (regra de domínio: conflito, validação, permissão comercial) | Core |
| `STALE_RESULT` | Core (resposta rejeitada por contexto divergente — §20) | Core (normalmente silencioso) |

Adapter devolve razões técnicas (ex.: `composer_not_found`,
`composer_not_empty`, `composer_ambiguous`, `apply_verification_failed`,
`phone_unavailable`, `phone_ambiguous`). O mapeamento razão → texto
seller-facing é do Core.

Evidência na base: `mapWhatsAppApplyResult` (WhatsApp) e
`mapManyChatApplyResult` (branch congelada) são hoje dois mapeamentos de
copy em código de canal — **violação** a ser eliminada.

---

## 7. ChannelAdapter conceptual contract

Contrato **documental**. Nenhuma implementação TypeScript/JavaScript é
definida nesta fase. Nomes são conceituais.

### 7.1 Métodos obrigatórios

#### `platform`
| Aspecto | Contrato |
|---|---|
| Propósito | Identificador estável do canal e nome de exibição |
| Input | — |
| Output | `{ id: 'whatsapp' \| 'manychat', displayName: string }` |
| Responsável | Adapter |
| PII | Não |
| Duração do dado | Constante durante o runtime |
| Indisponível | Não aplicável (constante) |
| Obrigatoriedade | Obrigatório |

#### `getCurrentConversation()`
| Aspecto | Contrato |
|---|---|
| Propósito | Descrever a conversa aberta agora |
| Input | — |
| Output | `null` ou `{ conversationKey, kind: 'direct' \| 'group' \| 'self' \| 'unknown', displayName?: { value, trusted: boolean } }` |
| Responsável | Adapter |
| PII | Sim (displayName) |
| Duração do dado | Válido somente enquanto a mesma conversa estiver aberta; nunca persistido pelo adapter |
| Indisponível | `null` (nenhuma conversa) ou erro `PLATFORM_UNAVAILABLE` |
| Obrigatoriedade | Obrigatório; `kind` pode ser `'unknown'` quando a plataforma não permite classificar |

#### `getConversationKey()`
| Aspecto | Contrato |
|---|---|
| Propósito | Chave autoritativa da conversa aberta, lida ao vivo |
| Input | — |
| Output | `string \| null` |
| Responsável | Adapter (produção da chave); Core (uso como contexto — §20) |
| PII | Pode conter identificador de plataforma; tratar como sensível; nunca exibir |
| Duração do dado | Ao vivo; nunca cacheado como "conversa atual" por callback assíncrono |
| Indisponível | `null` |
| Obrigatoriedade | Obrigatório |

#### `getContactEvidence()`
| Aspecto | Contrato |
|---|---|
| Propósito | Entregar identidade e telefone **com evidência** da conversa atual |
| Input | `conversationKey` esperado (o adapter confirma que ainda é a conversa aberta) |
| Output | `{ conversationKey, platformIdentity?: { namespace, key }, trustedPhone?: string, phoneStatus: 'trusted' \| 'unavailable' \| 'ambiguous' \| 'pending', displayName?: { value, trusted } }` |
| Responsável | Adapter |
| PII | **Sim** (telefone, nome, identidade) |
| Duração do dado | Somente o ciclo de resolução da conversa atual; nunca persistido no browser por conveniência |
| Indisponível | `phoneStatus: 'unavailable' \| 'ambiguous' \| 'pending'` → Core entra em `NO_CONTACT_EVIDENCE` |
| Obrigatoriedade | Obrigatório (o telefone confiável em si é capability `canProvideTrustedPhone`) |

Regras: `trustedPhone` NUNCA deriva de `subscriber_id`, `wa_id` ou
qualquer identificador opaco de plataforma. `platformIdentity` é opaca
para o Core (só transportada ao backend).

#### `getMessages()`
| Aspecto | Contrato |
|---|---|
| Propósito | Mensagens elegíveis da conversa atual, normalizadas |
| Input | `conversationKey` esperado |
| Output | Lista de `{ messageKey (com escopo de identidade), direction/authorKind: 'customer' \| 'human_agent' \| 'automation' \| 'unknown', text?, timestamp?, deleted?, edited?, hasAudio? }` |
| Responsável | Adapter (leitura, autoria, dedupe, ledger técnico) |
| PII | **Sim** (conteúdo) |
| Duração do dado | Ledger em memória por conversa, com limite de retenção; não persistido no browser |
| Indisponível | Lista vazia + `CAPABILITY_UNAVAILABLE` quando `canReadMessages` falso |
| Obrigatoriedade | Obrigatório (capability `canReadMessages`) |

Referência de forma: `platform-contract.js` (`yolen-universal-conversation-v1`,
`AUTHOR_KINDS`).

#### `subscribeToConversationChanges(callback)`
| Aspecto | Contrato |
|---|---|
| Propósito | Emitir `conversation_changed` (e eventos de mutação técnica) |
| Input | `callback({ type: 'conversation_changed', previousConversationKey, conversationKey })`; opcionalmente `{ type: 'messages_mutated', conversationKey }` |
| Output | Função de cancelamento da inscrição |
| Responsável | Adapter emite; Core reage (§20) |
| PII | Chaves apenas |
| Duração do dado | Evento pontual |
| Indisponível | `CAPABILITY_UNAVAILABLE` (Core não pode operar sem fronteira confiável → `PLATFORM_UNAVAILABLE`) |
| Obrigatoriedade | Obrigatório (capability `canObserveConversationChanges`) |

#### `getComposerState()`
| Aspecto | Contrato |
|---|---|
| Propósito | Estado físico do composer |
| Input | — |
| Output | `{ available: boolean, busy: boolean (já contém texto), reason?: 'composer_not_found' \| 'composer_ambiguous' \| ... }` |
| Responsável | Adapter |
| PII | Não retorna o texto do rascunho, exceto quando capability de pré-envio exigir (ver `getLastOutgoingMessage`/`interceptSendAttempt`) |
| Duração do dado | Instantâneo |
| Indisponível | `available: false` + razão técnica |
| Obrigatoriedade | Obrigatório (capability `canApplyMessage`) |

#### `applyMessage(text)`
| Aspecto | Contrato |
|---|---|
| Propósito | Inserir texto no composer físico (nunca enviar) |
| Input | `text` gerado pelo Core |
| Output | `{ applied: boolean, reason: string \| null }` |
| Responsável | Adapter (inserção, eventos DOM, verificação); Core (decisão de chamar, feedback, copy) |
| PII | Texto comercial |
| Duração do dado | Nenhuma retenção |
| Indisponível | `{ applied: false, reason }`; Core oferece "Copiar" |
| Obrigatoriedade | Obrigatório (capability `canApplyMessage`) |

Regra: o adapter exclui o próprio painel Yolen da busca do composer.

#### `getMountPoint()`
| Aspecto | Contrato |
|---|---|
| Propósito | Container físico onde o Core monta o painel |
| Input | — |
| Output | Elemento/container controlado pelo Companion + sinal de visibilidade |
| Responsável | Adapter (onde); Core (o quê) |
| PII | Não |
| Duração do dado | Enquanto o mount existir; o adapter sinaliza remoção/recriação |
| Indisponível | `null` → Core não renderiza (fail-closed) |
| Obrigatoriedade | Obrigatório |

#### `getCapabilities()`
| Aspecto | Contrato |
|---|---|
| Propósito | Declarar capabilities (§8) |
| Input | — |
| Output | Mapa `capability → boolean \| 'conditional'` |
| Responsável | Adapter |
| PII | Não |
| Duração do dado | Estável; pode mudar por conversa quando `CONDITIONAL` |
| Indisponível | Não aplicável |
| Obrigatoriedade | Obrigatório |

### 7.2 Capabilities opcionais

#### `getAudioSource(message)`
| Aspecto | Contrato |
|---|---|
| Propósito | Obter áudio/blob de uma mensagem para transcrição |
| Input | `messageKey` |
| Output | `{ ok, blob?/source?, durationSeconds?, reason? }` |
| Responsável | Adapter (obtenção/transporte físico); Core (quando pedir, estado de transcrição, apresentação) |
| PII | **Sim** (voz) |
| Duração do dado | Somente até o envio para transcrição; nunca persistido no browser |
| Indisponível | `CAPABILITY_UNAVAILABLE` — ausência de áudio não cria um Companion diferente |
| Obrigatoriedade | Opcional (`canReadAudio`) |

#### `interceptSendAttempt(callback)`
| Aspecto | Contrato |
|---|---|
| Propósito | Notificar tentativa física de envio (clique/Enter) e permitir bloqueio para o gate de pré-envio |
| Input | `callback({ draftText }) → { allow: boolean }` decidido pelo Core |
| Output | Cancelamento da inscrição |
| Responsável | Adapter (detecção física); Core (decisão do gate) |
| PII | Sim (rascunho) |
| Duração do dado | Instantâneo |
| Indisponível | Core desativa o gate de pré-envio para o canal (diferença permitida declarada) |
| Obrigatoriedade | Opcional (`canInterceptSend`) |

#### `getLastOutgoingMessage()`
| Aspecto | Contrato |
|---|---|
| Propósito | Última mensagem enviada visível (confirmar envio de sugestão) |
| Input | `conversationKey` |
| Output | `{ text, messageKey } \| null` |
| Responsável | Adapter |
| PII | Sim |
| Duração do dado | Instantâneo |
| Indisponível | `null` |
| Obrigatoriedade | Opcional (**UNKNOWN / TO BE VERIFIED** no ManyChat) |

#### `requestVisibleContactDetails()`
| Aspecto | Contrato |
|---|---|
| Propósito | Pedir à plataforma que exponha dados do contato (ex.: abrir "Dados do contato" no WhatsApp) para obter evidência de telefone |
| Input | `conversationKey` |
| Output | Nova evidência via `getContactEvidence()` |
| Responsável | Adapter (ação física); Core decide se/quando pedir |
| PII | Sim |
| Duração do dado | Instantâneo |
| Indisponível | `CAPABILITY_UNAVAILABLE` |
| Obrigatoriedade | Opcional (`canRequestContactDetails`) |

---

## 8. Capability model

Legenda: **SUPPORTED** (existe e é usado em runtime), **CONDITIONAL**
(existe, mas nem sempre produz o dado), **UNSUPPORTED** (a plataforma/código
comprovadamente não oferece), **UNKNOWN** (sem evidência suficiente).

| # | Capability | WhatsApp | Evidência WhatsApp | ManyChat | Evidência ManyChat |
|---|---|---|---|---|---|
| 1 | `canProvideTrustedPhone` | CONDITIONAL | `getConversationPhone`, `resolvePassivePhoneForConversation`, identity bridge (JID), `runAutomaticContactLookup`; falha em grupo/self/sem dado | CONDITIONAL | `manychat-phone-evidence.js` (@24f25c7): `phone_unavailable` / `phone_ambiguous` fail-closed; ausente na base `b5d877` |
| 2 | `canProvideDisplayName` | CONDITIONAL | `getConversationTitle`/header; `looksLikePhone` impede uso como nome | UNKNOWN | `manychat-dom-reader.getContact` existe, mas o bootstrap só declara seletores `conversationRoot` e `messages` — TO BE VERIFIED |
| 3 | `canReadMessages` | SUPPORTED | `buildReliableMessageFromNode`, ledger, `message-mutations.js` | SUPPORTED | `manychat-dom-reader`, `manychat-message-*` |
| 4 | `canObserveConversationChanges` | SUPPORTED | `observeWhatsAppChanges`, epoch do bridge | SUPPORTED | reader `conversation_changed` autoritativo |
| 5 | `canApplyMessage` | SUPPORTED | `insertIntoWhatsAppComposer` | SUPPORTED | `manychat-composer.js` `applyManyChatComposerSuggestion` |
| 6 | `canInterceptSend` | SUPPORTED | `interceptPreSendAttempt`, `observeManualWhatsAppSend` | UNKNOWN | nenhum código de interceptação — TO BE VERIFIED |
| 7 | `canReadAudio` | SUPPORTED | `whatsapp-audio-bridge.js`, `getAudioBlobForTarget` | SUPPORTED | `manychat-audio-source.js`, `manychat-audio-dispatch-runtime.js`, background transport |
| 8 | `canRequestContactDetails` | SUPPORTED | `runAutomaticContactLookup` abre/fecha "Dados do contato" | UNKNOWN | sem evidência — TO BE VERIFIED |
| 9 | `canClassifyGroupOrSelf` | SUPPORTED | identity bridge (grupo), `isSelfConversationTitle` | UNKNOWN | sem evidência no runtime — TO BE VERIFIED |
| 10 | `canDetectDeletedOrEdited` | SUPPORTED | `isDeletedMessageNode`, `message-mutations.js` | UNKNOWN | TO BE VERIFIED |
| 11 | `canProvideMountPoint` | SUPPORTED | `createPanel` | SUPPORTED | `manychat-panel-mount.js` |

**Capability diferente NÃO significa produto diferente.** Quando a
capability necessária para uma ação existe (inclusive CONDITIONAL no
momento em que produz o dado), o Core oferece a MESMA ação com o MESMO
fluxo em qualquer canal. Quando a capability não existe, o Core apresenta
o MESMO estado canônico de indisponibilidade.

---

## 9. Domain Resolution ViewModel

O Core consome um **modelo de domínio sanitizado** de resolução — não
necessariamente o payload bruto de `/api/companion/resolve-lead`.

Estrutura conceitual:

```
DomainResolutionViewModel
  status            : NOT_FOUND | OWNED_BY_ME | OWNED_BY_OTHER | IN_POOL
                      | CLOSED_CYCLE | <outros status de domínio — ver §10.3>
  cycle
    id              : identificador autorizado
    status          : somente quando seller-facing necessário
  lead display
    name            : somente quando autorizado/necessário
  ownership display
    owner_name      : somente quando autorizado/necessário
  capabilities
    can_create_lead
    can_analyze_conversation
    can_open_pool
    can_open_cycle
    can_register_conversation
    can_enrich_lead
    ...
  flags
    is_closed
    ...
```

Regras (Decisão do Controle — privacidade ManyChat):

- o Core consome um modelo de domínio sanitizado;
- cada canal não recebe mais informação do que precisa;
- dados privilegiados podem permanecer server-side;
- o raw canonical phone cadastrado permanece server-side quando não há
  necessidade seller-facing legítima;
- `lead_id` não precisa cruzar para o content apenas para ser devolvido ao
  servidor; o backend pode derivar identidade comercial a partir de
  `cycle_id` ou outro identificador autorizado;
- respostas privilegiadas usam **allowlist**; nenhum spread de payload bruto;
- PII não é persistida no browser por conveniência arquitetural.

Evidência de hardening a preservar: `sanitizeManyChatPhoneResolutionPayload`
(`background.js` @24f25c7) e `sanitizeLeadResolutionPayload`
(`manychat-capture-runtime.js`) já reduzem a resposta a
`{status, cycle.id, actions.can_analyze_conversation, flags.is_closed}`.

**Não determinado nesta fase:** endpoint final; lista exata de campos de
display autorizados por canal (UNKNOWN / TO BE VERIFIED — ver §31). O
backend não é alterado nesta fase.

**Proibido:** usar elegibilidade de captura
(`isCaptureResolutionEligible`) como decisão de estado seller-facing
(padrão encontrado em `manychat-capture-runtime.js` → `resolution.ready`).

---

## 10. Canonical seller state machine

Definição formal e cenários: `COMPANION_STATE_PARITY_MATRIX.md`. Este
contrato fixa a lista e as transições.

### 10.1 Estados canônicos (19)

| # | Estado | Significado |
|---|---|---|
| 1 | `BOOT_LOADING` | Core inicializando / sessão sendo lida |
| 2 | `NO_SESSION` | Sem sessão válida do Companion (inclui token ausente/expirado — `AUTH_ERROR`) |
| 3 | `CONNECTED_NO_CONVERSATION` | Sessão válida, nenhuma conversa aberta |
| 4 | `NON_LEAD_CONVERSATION` | Conversa classificada pelo adapter como grupo ou self (só quando `canClassifyGroupOrSelf`) |
| 5 | `NO_CONTACT_EVIDENCE` | Conversa aberta sem telefone confiável (inclui `phone_unavailable`, `phone_ambiguous`, `pending`, `CONTACT_NOT_LINKED` sem telefone) |
| 6 | `RESOLVING` | Resolução em voo |
| 7 | `NOT_FOUND` | Backend: nenhum lead para o telefone confiável |
| 8 | `LEAD_CREATE_READY` | Formulário de criação disponível |
| 9 | `CREATING_LEAD` | CREATE em voo |
| 10 | `CREATED_RESOLVING` | CREATE confirmado (ou conflito de criação), re-resolve em curso |
| 11 | `CREATED_UNRESOLVED` | Re-resolve esgotado; apenas RESOLVE manual permitido |
| 12 | `OWNED_BY_ME` | Lead na carteira do vendedor |
| 13 | `IN_POOL` | Lead no Pool |
| 14 | `OWNED_BY_OTHER` | Lead de outra carteira |
| 15 | `CLOSED_CYCLE` | Ciclo encerrado |
| 16 | `RESOLUTION_ERROR` | Resposta de domínio de erro na resolução (`DOMAIN_ERROR`) |
| 17 | `NETWORK_ERROR` | Falha de transporte |
| 18 | `BACKEND_ERROR` | Falha do backend (5xx/resposta inválida) |
| 19 | `WORKSPACE_READY` | Workspace de 4 áreas ativo para o ciclo resolvido |

### 10.2 Transições principais

```
BOOT_LOADING ──sessão ok──▶ CONNECTED_NO_CONVERSATION
BOOT_LOADING ──sem sessão──▶ NO_SESSION
NO_SESSION ──conectar/sessão capturada──▶ CONNECTED_NO_CONVERSATION
CONNECTED_NO_CONVERSATION ──conversation_changed──▶ (grupo/self) NON_LEAD_CONVERSATION
                                                  ▶ (sem trusted phone) NO_CONTACT_EVIDENCE
                                                  ▶ (trusted phone) RESOLVING
NO_CONTACT_EVIDENCE ──trusted phone disponível──▶ RESOLVING
RESOLVING ──NOT_FOUND──▶ NOT_FOUND ──(can_create_lead)──▶ LEAD_CREATE_READY
RESOLVING ──OWNED_BY_ME / IN_POOL / OWNED_BY_OTHER / CLOSED_CYCLE──▶ estado correspondente
RESOLVING ──DOMAIN_ERROR──▶ RESOLUTION_ERROR
RESOLVING ──transporte──▶ NETWORK_ERROR
RESOLVING ──backend──▶ BACKEND_ERROR
RESOLVING ──AUTH_ERROR──▶ NO_SESSION
{RESOLUTION_ERROR, NETWORK_ERROR, BACKEND_ERROR} ──retry──▶ RESOLVING
estado comercial com ciclo resolvido e capability de workspace ──▶ WORKSPACE_READY
qualquer estado ──conversation_changed──▶ reset (§20) ──▶ reavaliação a partir de CONNECTED_NO_CONVERSATION
qualquer estado ──troca de sessão/empresa──▶ BOOT_LOADING (reset total)
```

`WORKSPACE_READY` é um estado **sobreposto** ao estado comercial: o estado
comercial (`OWNED_BY_ME`, etc.) continua visível no cabeçalho/card do
contato e o workspace é exibido abaixo. Quais estados comerciais abrem o
workspace é decidido pelo Core a partir de `capabilities`/`flags` do
Domain Resolution ViewModel — nunca pelo adapter. A matriz exata por
status é **UNKNOWN / TO BE VERIFIED** (§31, questão Q2).

### 10.3 Status de domínio sem estado canônico dedicado

A branch congelada exibe rótulos para `LEAD_WITHOUT_CYCLE`, `SOFT_DELETED`,
`MULTIPLE_MATCHES`; o WhatsApp na base os trata pelo ramo genérico
(`user_message` + "Abrir vínculo"). O mapeamento canônico desses status é
**UNKNOWN / TO BE VERIFIED** (§31, Q1). Até decisão, o Core os trata de
forma única em todos os canais e nunca por rótulo definido em adapter.

---

## 11. Lead creation contract

### 11.1 Pré-condições (Decisão do Controle — telefone)

SEM TELEFONE CONFIÁVEL: não criar lead; não inferir telefone; não usar
`subscriber_id`; não usar `wa_id` como telefone; não inventar dado. Estado
`NO_CONTACT_EVIDENCE`, seller-facing conceitual "Identificando contato..."
(ou equivalente definido pela view canônica).

Com telefone confiável: o Core pode resolver. Se a resolução retornar
`NOT_FOUND`, o Core oferece criação de lead:

```
trusted phone → resolve → NOT_FOUND → Novo contato → CREATE → re-resolve → workspace
```

### 11.2 Máquina de estados

```
NOT_FOUND
  ↓
LEAD_CREATE_READY
  ↓ vendedor confirma
CREATING_LEAD
  ↓ CREATE success
CREATED_RESOLVING
  ↓ resolve success
OWNED_BY_ME / estado comercial resultante
```

- Retries de re-resolve esgotados → `CREATED_UNRESOLVED`.
  - Mostra "Atualizar vínculo" (ou equivalente canônico).
  - A ação é **RESOLVE novamente**. **NUNCA CREATE novamente.**
- Backend responde `active_lead_conflict` ou `concurrent_create_conflict`
  → `CREATED_RESOLVING` (nunca segundo CREATE).
- Falha real de CREATE (qualquer outro erro) → volta a `LEAD_CREATE_READY`
  com erro visível no formulário e botão habilitado.
- Qualquer RESOLVE bem-sucedido (automático, retry de vínculo ou refresh
  global) com status ≠ `NOT_FOUND` encerra a pendência de criação.
- Anti-duplo-clique: no máximo um CREATE em voo por `conversation_key`;
  cliques extras são no-op (`already_in_flight`).
- Conversa mudou durante CREATE: o resultado não altera a UI da conversa
  atual (`conversation_changed` / `applied: false`).
- Política de re-resolve: número finito de tentativas com backoff curto
  (base: `LEAD_CREATION_RESOLVE_RETRY_DELAYS_MS = [400, 900, 1600]`),
  revalidando conversa e telefone a cada tentativa. Nunca polling
  indefinido.

Evidência da implementação a extrair (base `b5d877`):
`content-script.js#createLeadForCurrentConversation`,
`#resolveAfterLeadCreation`, `#retryLeadLinkAfterCreation`,
`#getLeadActionButton`, `lead-automation.js`.

### 11.3 Dados de criação

| Campo | Regra |
|---|---|
| Nome | Obrigatório. Pode ser sugerido por display name **confiável**. Se o display name parecer telefone ou não existir, o usuário preenche. |
| Telefone | Obrigatório para create por conversa. Vem de trusted contact evidence do adapter. **Readonly** na UI. Nunca inferido de `subscriber_id`/`wa_id`. |
| E-mail | Opcional. Pode receber sugestão do enrichment. |
| CPF/CNPJ | Opcional. Pode receber sugestão do enrichment. |

O rótulo do campo telefone não carrega nome de plataforma fixo (a base usa
"WhatsApp" em `lead-automation.js`); se o nome do canal aparecer, vem de
`platformDisplayName`.

---

## 12. Workspace contract

`WORKSPACE_READY` possui **EXATAMENTE** quatro áreas canônicas:

| Ordem | Id | Rótulo |
|---|---|---|
| 1 | `now` | AGORA |
| 2 | `message` | MENSAGEM |
| 3 | `analysis` | ANÁLISE |
| 4 | `client` | CLIENTE |

- Essa lista existe **UMA VEZ** no Core (`SELLER_AREAS`).
- Adapter não define abas, não adiciona quinta área, não remove área e não
  decide qual conteúdo entra em cada área.
- Área ativa inicial e após cada `conversation_changed`: `now`.
- Navegação por teclado (setas/Home/End) e ARIA são do Core.

Evidência reaproveitável: `companion-workspace-runtime.js` (@24f25c7),
classificado **REUSE** pela auditoria.

---

## 13. AGORA contract

Responsabilidade conceitual do Core:

- decision state (view model canônico de decisão);
- prioridade;
- seller attention (incluindo o sinal no painel recolhido e
  "Contato ainda não cadastrado" para NOT_FOUND);
- próxima ação;
- sinais comerciais persistidos;
- estados `loading`, `empty`, `error`, `stale`.

Core decide. Adapter não interpreta.

Contexto de validação da resposta: `company_id`, `cycle_id`,
`conversation_key`, request sequence (§20).

---

## 14. MENSAGEM contract

Core é responsável por:

- eligibility (sessão, conversa comercial, ciclo resolvido, resumo do lead
  pronto para o mesmo ciclo/conversa);
- intent;
- presets;
- seller instruction;
- generation;
- generated result;
- copy (incluindo copiar para clipboard);
- stale guard;
- loading;
- errors;
- feedback (tradução de `{applied, reason}` do adapter);
- action state.

Adapter é responsável **apenas** por:

```
composer.getState()        → getComposerState()
composer.applyMessage(text) → applyMessage(text)
```

Label com nome de plataforma: o Core recebe `platformDisplayName` e compõe
"Inserir no WhatsApp" / "Inserir no ManyChat". Isso NÃO autoriza UI
paralela.

---

## 15. ANÁLISE contract

**Política ÚNICA** no Core para todos os canais.

Estados mínimos:

| Estado | Significado |
|---|---|
| `idle` | Nenhuma análise para o contexto atual |
| `loading` | Disparo em voo (antes de ter job) |
| `queued` | Job aceito, aguardando |
| `processing` | Job em execução |
| `ready` | View model de análise pronto para o contexto atual |
| `failed` | Job falhou |
| `superseded` | Job substituído por conteúdo mais novo |
| `timeout` | Polling excedeu o limite |
| `network_error` | Falha de transporte no disparo/polling |
| `outdated` | Análise pronta refere-se a conteúdo anterior da conversa |

Estado auxiliar: `automatic_scheduled` (análise automática agendada).

Pertencem ao Core: debounce, automatic analysis, polling, watchdog, retry,
fingerprint, stale.

Proibido:

- ManyChat analisar "a cada captura" por conta própria (padrão da branch
  congelada: `handleCaptureResult → requestAnalysis`);
- WhatsApp ter política diferente.

Parâmetros atuais da base (referência, não obrigação numérica):
`AUTOMATIC_ANALYSIS_DELAY_MS = 8000`, `ANALYSIS_REQUEST_WATCHDOG_MS =
60000`, polling `[1500, 2000, 3000, 4000, 5000]`, timeout total `240000`.
Os valores finais são definidos uma vez no Core.

---

## 16. CLIENTE contract

CLIENTE possui **uma única composição e um único controller**, que inclui
conceitualmente:

- client context;
- commercial relationship (inclui campos derivados do relógio, recalculados
  sem rede);
- lead summary (quando a composição final determinar a área de exibição);
- seller information;
- customer view model (com fallback para última leitura comercial válida do
  mesmo contexto);
- enrichment;
- conversation registration (quando a composição final determinar).

Nenhum layout novo é definido nesta fase — apenas autoridade e estados:
`idle`, `loading`, `ready`, `empty`, `error`, `stale`.

---

## 17. Lead Summary contract

Controller **único**. Estados/operações:

| Operação/estado | Regra |
|---|---|
| `load` → `loading` | Uma carga em voo por contexto; dedupe |
| `ready` | Dados para o mesmo `cycle_id`/`conversation_key` |
| `save` → `saving` | Compare-and-set com versão esperada |
| `conflict` | Versão divergente no backend; vendedor recarrega |
| `error` | Falha de load ou save; mensagem seller-facing do Core |
| `retry` | Recarrega pelo mesmo controller |
| CAS/stale | Resposta só aplica se o contexto ainda for o de origem (§20) |

Não pode existir caminho WhatsApp + caminho ManyChat. Orientação de método
(method guidance) derivada do resumo pertence ao mesmo controller/fluxo
(nunca um wrapper por monkey-patch — ver §26).

---

## 18. Conversation Registration contract

Controller **único**. Estados:

| Estado | Significado | Equivalente na base |
|---|---|---|
| `idle` | Nada iniciado | `idle` |
| `preview` | Prévia gerada/carregando | `previewing` / `preview_ready` |
| `confirming` | Confirmação em voo | `saving` |
| `success` | Registrado (inclui já registrado) | `success` |
| `stale` | Token/prévia inválidos por mudança de contexto | `stale` |
| `error` | Falha | `error` |

Adapter fornece: `conversation_key` e mensagens/evidence necessárias.
Estado indexado por `cycle_id + conversation_key`.

---

## 19. Lead Enrichment contract

### 19.1 Campos esperados (8)

`email`, `cpf`, `cnpj`, `birth_date`, `profession`, `cep`, `address`,
`phone_mobile`.

Evidência: a extração (`lead-enrichment.js`) detecta os 8 (endereço como
`address_raw`); a lista confirmável/gravável atual
(`LEAD_ENRICHMENT_CONFIRMABLE_FIELDS` e
`LEAD_ENRICHMENT_UPDATE_FIELDS` @24f25c7) contém 7 — **sem** `address`.
Política de escrita de `address`: **UNKNOWN / TO BE VERIFIED** (§31, Q5).

### 19.2 Regras canônicas

- detectar candidato;
- normalizar;
- comparar;
- `same` → ocultar;
- `missing` → confirmável;
- `different` → confirmável conforme política;
- confirmação humana obrigatória;
- ignore (por candidato, com chave que embute o contexto);
- apply;
- stale protection;
- CAS (valor atual esperado);
- evidence message ids.

### 19.3 Telefone

O raw current phone pode permanecer server-side. Core/content recebe
apenas semântica suficiente: `same`, `missing`, `different_private`. Não
vazar valor atual desnecessariamente.

### 19.4 Unicidade

Controller único no Core. Hoje existem dois contratos (WhatsApp:
`OWNED_BY_ME` + `lead.id` + `APPLY_LEAD_ENRICHMENT`; ManyChat @24f25c7:
`cycle_id` + `LOAD_LEAD_ENRICHMENT_CONTEXT` +
`APPLY_MANYCHAT_LEAD_ENRICHMENT`). A reconstrução converge para um único
contrato de Core; rotas privilegiadas podem diferir apenas por
privacidade/autorização (§24).

---

## 20. Conversation Boundary / stale contract

### 20.1 Regra A → B

Quando a conversa muda, o adapter **emite** `conversation_changed`.
O Core:

- encerra o contexto anterior;
- invalida callbacks stale;
- cancela/ignora timers aplicáveis (análise automática, polling,
  watchdog, refresh de client context, retries de criação);
- reseta active area para AGORA;
- isola drafts;
- isola loading;
- isola errors;
- isola analysis;
- isola client state;
- isola enrichment;
- isola registration;
- impede A de escrever em B.

Quando volta B → A: somente estado explicitamente persistível/reconstruível
pode reaparecer (ex.: dados recarregados do backend, cache de resolução
permitido). Nenhum DOM compartilhado pode deixar conteúdo de B em A — a
primeira renderização após uma fronteira é forçada, ignorando proteções de
estabilidade visual.

### 20.2 Stale async contract

Todo controller assíncrono do Core possui contexto suficiente para validar
a resposta antes de aplicar:

- `company_id` quando aplicável;
- `cycle_id` quando aplicável;
- `conversation_key`;
- request sequence / operation token.

Uma resposta assíncrona só altera o state se ainda pertencer ao contexto
que a iniciou; caso contrário é `STALE_RESULT` e é descartada.

Cache de resolução: falhas transitórias (`NO_COMPANION_SESSION`,
`INVALID_COMPANION_TOKEN`, `NETWORK_ERROR`, status não reconhecido) nunca
são cacheadas como resolução da identidade; só resultados de domínio.

---

## 21. Session contract

- O estado seller-facing de sessão pertence ao Core.
- O mecanismo de descobrir/capturar sessão (hash, bridge da página Yolen,
  storage do background) pertence à infraestrutura de transporte.
- `NO_SESSION` produz a MESMA decisão seller-facing em qualquer canal
  (mesma copy, mesmo CTA "Conectar Yolen").
- Troca de empresa ou de sessão invalida todo estado comercial carregado
  (inclusive view models com `company_id` divergente).

---

## 22. Mount / renderer boundary

| Adapter | Core |
|---|---|
| Fornece o lugar físico onde o painel pode ser montado (`getMountPoint()`), visibilidade e sinal de remoção/recriação | Produz shell, abas, conteúdo, estado, delegação de eventos do painel, colapso, preferências de exibição |

Não deve existir `manychatPanelHtml` / `whatsappPanelHtml` como duas
implementações comerciais. Pode existir `WhatsAppMountAdapter` /
`ManyChatMountAdapter` (posição, largura reservada, visibilidade).

O renderer opera só sobre o DOM do painel Yolen recebido por interface.

---

## 23. Privacy / PII contract

| Dado | Regra |
|---|---|
| Telefone da conversa (evidence) | Só em memória, no ciclo de resolução/criação da conversa atual; readonly na UI de criação |
| Telefone cadastrado no lead | Server-side; o content recebe apenas semântica (`same`/`missing`/`different_private`) |
| `lead_id` | Não cruza para o content apenas para ser devolvido; backend deriva por `cycle_id` ou identificador autorizado |
| `subscriber_id` / `wa_id` / JID | Identificadores de plataforma; nunca tratados como telefone; nunca exibidos |
| Payload de resolução | Allowlist; nenhum spread de payload bruto |
| Mensagens / áudio | Em memória, com limite de retenção; nunca persistidos no browser |
| Rascunhos de criação | Não persistidos além do runtime; isolados por conversa |
| Storage do browser | Apenas sessão e preferências de UI; nenhuma PII por conveniência |

A privacidade de telefone do ManyChat (sanitização em background e no
runtime; evidência de DOM fail-closed) é preservada.

---

## 24. Backend boundary

- O backend não duplica regra comercial por canal quando a operação é
  conceitualmente a mesma.
- Preferência: **shared server core**, com endpoints/adapters finos somente
  quando necessário por privacidade, autorização, exposição de payload ou
  segurança de fronteira.
- Exemplo válido: Lead Enrichment ManyChat — a rota privilegiada pode
  diferir (`apply-manychat-lead-enrichment` @24f25c7), MAS a regra de
  escrita converge para core server-side compartilhado
  (`lead-enrichment-apply-core.ts` @24f25c7).
- Nenhum endpoint é alterado nesta fase.
- Ações privilegiadas do background sem consumidor (ex.:
  `SEARCH_LINKABLE_LEADS`, `FIRST_LINK_EXTERNAL_IDENTITY` após a remoção do
  seletor manual) devem ser reavaliadas em fase própria; não podem ser
  base para nova UI.

---

## 25. Manifest vs Test Harness rule

> "O harness de integração deve reproduzir a mesma ordem e o mesmo conjunto
> de módulos do manifest/runtime real, salvo mocks explicitamente documentados."

- Módulo testado mas ausente do manifest = **architecture gate failure**.
- Módulo presente no harness ManyChat mas ausente no manifest =
  **architecture gate failure**.
- Ordem diferente que altere monkey-patches/globals = **architecture gate
  failure**.

Divergências conhecidas (não corrigidas nesta fase; FASE 3 cria as travas):

- `lead-method-guidance-runtime.js` carregado por
  `tests/e3-test-support/load-content-script.mjs`, nunca presente no
  manifest;
- `companion-reasoning-view.js` carregado por
  `load-manychat-runtime.mjs` (@24f25c7), ausente da lista ManyChat do
  manifest;
- ordem de carga do harness do content script diferente da ordem do
  manifest.

---

## 26. Dependency composition rule

A arquitetura alvo **NÃO** depende de monkey-patch para composição de
controllers do Core. Preferência obrigatória: **composição explícita por
dependências/interfaces**.

Padrões conhecidos na base (não refatorados nesta fase):

- `window.YolenCompanionApi` embrulhado em cadeia
  (`loadLeadSummary` por `lead-summary-runtime-cache` e
  `seller-message-runtime`; `resolveLead` por
  `lead-resolution-runtime-cache` e `panel-stability-runtime`;
  `analyzeConversation` por `phase16-9-runtime-guard`);
- dependência de ordem do manifest;
- globals sobrescritos (`companion-reasoning-view.js` redefine
  `YolenCompanionSellerInformationView`);
- `Element.prototype.innerHTML` interceptado
  (`panel-stability-runtime.js`, `editable-field-stability-runtime.js`);
- nós sintéticos injetados no DOM da plataforma
  (`phase16-9-runtime-guard.js`) — no alvo, qualquer normalização de
  mensagem de anexo é do adapter e não escreve no DOM da plataforma
  (**UNKNOWN / TO BE VERIFIED** se existe alternativa sem escrita — ver
  §31, Q6).

---

## 27. Platform differences allowed

Somente diferenças inerentes à plataforma, e toda diferença permitida deve
estar declarada na matriz de paridade:

- método de obter telefone;
- método de identificar conversa;
- método de obter áudio;
- seletor do composer;
- evento físico de input;
- texto de label que inclui o nome da plataforma (`platformDisplayName`);
- capability realmente indisponível (o Core apresenta o mesmo estado
  canônico de indisponibilidade).

---

## 28. Platform differences forbidden

- uma plataforma mostrar formulário e a outra somente texto;
- uma plataforma oferecer uma ação e a outra não quando a capability
  necessária existe;
- copy comercial contraditória;
- política de análise diferente;
- regra de retry diferente;
- state machine diferente;
- loader diferente por arquitetura paralela;
- cliente enriquecido em um canal e não no outro por falta de wiring;
- fifth tab / missing tab;
- regra de summary diferente;
- regra de enrichment diferente.

---

## 29. Prohibited adapter patterns

### PROIBIDO NO ADAPTER

Exemplos objetivos (nomes ilustrativos — qualquer equivalente é proibido):

- `renderSellerState()`
- `decideNotFound()`
- `decidePool()`
- `decideOwnership()`
- `decideClosedCycle()`
- `buildLeadCreationUi()`
- `buildAgora()`
- `buildMessageArea()`
- `buildAnalysisArea()`
- `buildClientArea()`
- `buildLeadSummaryUi()`
- `buildEnrichmentUi()`
- `decideCommercialError()`
- `createCommercialCopy()`

Também proibido no adapter:

- tabela de rótulos por status comercial (ex.: `STATUS_LABELS` de
  `manychat-capture-bootstrap.js`);
- decidir hidratação de view models a partir de `resolution.ready`;
- roteador de cliques de ações seller-facing;
- política de análise (debounce/polling/disparo por captura);
- estado por conversa de view models comerciais;
- mapeamento `{applied, reason}` → texto seller-facing.

**Se um arquivo `manychat-*` ou `whatsapp-adapter` futuro precisar tomar
uma dessas decisões, a arquitetura está sendo violada.**

---

## 30. Required architecture gates for Fase 3

A FASE 3 DEVE implementar exatamente as travas abaixo (automatizadas,
executadas no gate do projeto):

| Gate | Trava |
|---|---|
| A1 | Core não contém strings/seletores de plataforma (hosts, seletores DOM, JID, `subscriber_id`, `wa_id`, React Fiber, classes WhatsApp/ManyChat). |
| A2 | Adapter não contém branch seller-facing por status comercial (`NOT_FOUND`, `OWNED_BY_*`, `IN_POOL`, `CLOSED_CYCLE`, etc.). |
| A3 | `SELLER_AREAS` definida uma única vez. |
| A4 | Lead creation state machine definida uma única vez. |
| A5 | Analysis policy definida uma única vez. |
| A6 | Lead summary controller único. |
| A7 | Registration controller único. |
| A8 | Enrichment controller único. |
| A9 | Manifest e test harness carregam a mesma composição efetiva. |
| A10 | No runtime seller-facing paralelo ManyChat. |
| A11 | No runtime seller-facing paralelo WhatsApp. |
| A12 | Adapter implementa apenas contrato permitido (§6, §7). |
| A13 | Core não importa `manychat-*`. |
| A14 | Core não importa `whatsapp-*`. |
| A15 | ManyChat feature flag continua fail-closed em canais normais. |
| A16 | A → B isolation continua obrigatória. |
| A17 | Privacidade do telefone ManyChat preservada. |
| A18 | No `subscriber_id`/`wa_id` as phone. |

Total: **18 gates**.

---

## 31. Stop conditions

Qualquer fase posterior DEVE parar e reportar BLOCKED quando:

- precisar colocar decisão seller-facing em adapter;
- precisar portar uma função de um canal para outro em vez de movê-la ao
  Core;
- precisar que o content ManyChat receba payload bruto de lead;
- precisar inferir telefone de identificador de plataforma;
- precisar alterar arquivos fora do escopo autorizado da fase;
- encontrar contradição entre este contrato e a matriz de paridade;
- depender de uma das questões abaixo ainda não decididas.

Questões abertas (**UNKNOWN / TO BE VERIFIED** — decisão do Controle ou
verificação em fase própria):

- **Q1.** Mapeamento canônico de `LEAD_WITHOUT_CYCLE`, `SOFT_DELETED`,
  `MULTIPLE_MATCHES` (hoje: genérico no WhatsApp, rótulos próprios no
  ManyChat congelado).
- **Q2.** Quais estados comerciais abrem `WORKSPACE_READY`
  (`OWNED_BY_OTHER`, `IN_POOL`, `CLOSED_CYCLE`) — deve derivar de
  `capabilities`/`flags` do Domain Resolution ViewModel; matriz exata não
  comprovada.
- **Q3.** Lista exata de campos de display autorizados no Domain Resolution
  ViewModel por canal (lead name, owner_name, cycle status no ManyChat).
- **Q4.** Capabilities ManyChat UNKNOWN: display name confiável,
  interceptação de envio, pedir detalhes de contato, classificação
  grupo/self, deleção/edição, última mensagem enviada.
- **Q5.** Política de escrita de `address` no enrichment (detectado, não
  confirmável hoje).
- **Q6.** Alternativa sem escrita no DOM da plataforma para mensagens de
  anexo (`phase16-9-runtime-guard.js`).

---

## 32. Definition of Done

A reconstrução cumpre este contrato quando:

1. Existe um único Core que implementa todos os estados do §10 e todos os
   contratos §11–§21.
2. `whatsapp-adapter` e `manychat-adapter` implementam apenas §6/§7.
3. Nenhum código seller-facing paralelo existe em arquivo de canal
   (`manychat-seller-panel-runtime.js`, `renderStatus`/`STATUS_LABELS` e
   equivalentes foram removidos ou esvaziados de decisão de produto).
4. Os 18 gates do §30 estão implementados e verdes.
5. Todos os cenários de `COMPANION_STATE_PARITY_MATRIX.md` têm cobertura
   automatizada conforme exigido e aceite ao vivo nos cenários marcados.
6. O hardening listado na auditoria (sanitização, evidência de telefone,
   identidade segura, chaves de mensagem com escopo, stale guards, CAS,
   kill switch) está preservado.
7. Manifest e harness têm a mesma composição efetiva.
8. Nenhum controller do Core é composto por monkey-patch.
9. As questões Q1–Q6 do §31 foram decididas ou explicitamente mantidas
   fora de escopo pelo Controle.
