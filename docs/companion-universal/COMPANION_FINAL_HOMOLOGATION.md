# YOLEN Companion — Homologação final de produto

Base limpa acumulada: `a514872532740951d7f72d3ab24ecddd469cfab5`

Branch: `claude/companion-final-homologation`

## Regra desta etapa

Esta etapa NÃO é uma nova reconstrução. Ela executa a Onda D do handoff pós-reconstrução:

- uso exploratório real por Gerson e depois vendedores selecionados;
- checklist de tarefas reais;
- canário ManyChat com rollback simples;
- monitoramento de criação, análise, troca de conversa e composer;
- ativação ampla somente depois de aceite operacional explícito.

Nenhum merge, deploy de produção ou rollout é autorizado por este documento.

## Matriz operacional

| Área | Prova exigida pelo handoff | Critério | Estado atual |
|---|---|---|---|
| Criação de lead | 20 tentativas controladas | 20/20 em um clique; zero duplicidade | PENDENTE DA CONTAGEM FINAL |
| ANÁLISE | 10 conversas variadas | 10/10 terminam em sucesso ou erro claro; nenhuma indefinida | PENDENTE DA BATERIA DE 10 |
| Latência | Mesmas 10 conversas | registrar fila, processamento e total; sem espera multi-minuto sem explicação | PARCIAL — live recente 35s e 24s |
| Expand/collapse | 20 ciclos | shell/cabeçalho sempre presentes; sem tela escura intermediária | PENDENTE DA CONTAGEM FINAL |
| Estabilidade AGORA | 10 min em conversa estável | nenhum card some/reaparece sem evento real | PENDENTE DA JANELA CRONOMETRADA |
| Estabilidade ANÁLISE | 10 min em conversa estável | nenhuma reanálise automática sem gatilho válido | PENDENTE DA JANELA CRONOMETRADA |
| MENSAGEM edição | 4 tamanhos + edição livre | sem travar, perder cursor ou sobrescrever rascunho | FUNCIONALMENTE CORRIGIDO; PENDENTE CHECK FINAL |
| Rótulos | todas as opções | sem truncamento que impeça compreensão | PASS LIVE |
| Linguagem | AGORA/ANÁLISE/CLIENTE | zero códigos internos/termos técnicos | PASS LIVE UX; REVALIDAR NA BATERIA |
| Empresa/marca | 5+ conversas | empresa correta; logo correta; cabeçalho estável | PASS WA/MC; PENDENTE 5+ CONVERSAS |
| Ações por aba | todas as abas | Inserir/Copiar somente em MENSAGEM | PASS LIVE UX |
| A→B→A | 10 ciclos rápidos | sem vazamento de cliente, scroll ou rascunho | PASS AUTOMATIZADO; PENDENTE CONTAGEM LIVE |

## Evidência já fechada antes desta homologação

- FNC-02: lifecycle recuperável e performance live recente em ~35s e ~24s.
- MSG-02: rótulos completos no uso real.
- ID-01: empresa correta em WhatsApp e ManyChat.
- Cabeçalho user-first: usuário principal com empresa/perfil/sessão sob expansão.
- Session identity refresh: sessão antiga com placeholder é reidratada pelo backend canônico.
- ID-02: logo oficial visível em WhatsApp e ManyChat.
- UX-01/02/03/04: pacote seller-facing previamente aceito em Firefox/ManyChat.
- FNC-03/FNC-04/MSG-01: correções P0 previamente aceitas; nesta etapa só se completa a prova quantitativa exigida pelo handoff.

## Ordem de homologação

Para minimizar trabalho manual e evitar repetir testes:

1. Fazer uma única sessão de uso real que combine:
   - 5+ conversas;
   - 10 ciclos A→B→A;
   - 20 ciclos expand/collapse;
   - verificação de marca/empresa/usuário;
   - edição livre em MENSAGEM.
2. Fazer 10 análises variadas e registrar apenas:
   - tipo da conversa;
   - resultado final;
   - tempo total;
   - se houve estado recuperável/erro claro.
3. Fazer 20 criações controladas quando houver contatos de teste adequados.
4. Manter uma conversa estável por 10 minutos para AGORA/ANÁLISE.
5. Se tudo passar, preparar plano de canário ManyChat e rollback.
6. Rollout só com autorização explícita de Gerson.

## Critério de saída

Só declarar "Companion pronto" quando:
- a matriz acima estiver integralmente PASS;
- a homologação real estiver aceita;
- o plano de canário/monitoramento/rollback estiver documentado;
- Gerson autorizar explicitamente o rollout.
