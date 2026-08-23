# Checklist Firefox 12A — revalidação manual da arquitetura progressiva

## Papel deste documento

Roteiro manual para quem revalidar a extensão no Firefox real (não jsdom)
depois que os PRs A/B/C forem mergeados. Não substitui os testes
automatizados desta frente — cobre o que só se observa em uso real (tempo
de resposta percebido, comportamento visual, DevTools). Baseado no roteiro
já usado nas fases anteriores (PHASE_4_RELIABLE_CAPTURE_VALIDATION.md) e nas
condições de corrida documentadas em `RACE_CONDITIONS_MATRIX.md`.

## Pré-requisitos

- [ ] Extensão carregada no Firefox a partir de `app/extension/yolen-companion`
      (modo desenvolvedor / `about:debugging`).
- [ ] Sessão autenticada em uma empresa de teste (nunca empresa real de
      cliente).
- [ ] Console do Firefox aberto para observar `chrome.runtime.sendMessage`
      (ou o equivalente instrumentado, se a Frente Principal expuser logs de
      job) durante toda a sessão.
- [ ] Duas conversas de teste distintas disponíveis no WhatsApp Web de teste
      (conversa A e conversa B), com histórico suficiente para gerar análise.
- [ ] Confirmar qual `COMPANION_STATEFUL_MODE`/allowlist está ativo no
      ambiente de teste antes de começar (não assumir).

## Bloco 1 — Tempo até primeiro valor (TTFV)

- [ ] Enviar mensagem em uma conversa comercial de teste e cronometrar, a
      olho, do fim do silêncio (~8s) até a leitura rápida aparecer na tela.
- [ ] Confirmar que o vendedor **não fica bloqueado** esperando durante esse
      intervalo (consegue digitar, trocar de aba, etc. normalmente).
- [ ] Registrar o tempo observado — sem comparar contra um número de PASS
      pré-definido (ver `LATENCY_MEASUREMENT_CRITERIA.md`); o objetivo aqui é
      coletar dado real, não aprovar/reprovar por instinto.

## Bloco 2 — Análise profunda não bloqueia

- [ ] Confirmar visualmente que existe alguma indicação de "análise profunda
      em andamento" sem travar a interface do vendedor.
- [ ] Enquanto a análise profunda roda, tentar: digitar uma mensagem, trocar
      de aba do navegador, rolar a conversa. Nenhuma dessas ações deve travar
      ou ficar lenta por causa do job em background.
- [ ] Cronometrar o tempo até o resultado profundo aparecer (TTDA) —
      novamente, só registrar, não julgar contra um número mágico.

## Bloco 3 — Troca de conversa durante processamento (cenários B/C/E da matriz)

- [ ] Disparar análise na conversa A (deixar rodando).
- [ ] Antes do resultado profundo de A chegar, trocar para a conversa B.
- [ ] Confirmar que **nenhum dado de A aparece na tela de B** — nem o texto,
      nem um estado "revertido"/confuso causado por contaminação de estado
      (ver o achado documentado em `RACE_CONDITIONS_MATRIX.md`, cenário B).
- [ ] Trocar B → C → A rapidamente (cenário E) e confirmar que, ao voltar
      para A, só aparece estado pertencente a A (nunca de B ou C, nem um
      resultado de A anterior à troca que já estava obsoleto).
- [ ] Se qualquer contaminação for observada: **BLOCKER**, registrar prints
      de tela + horário exato + qual conversa/empresa de teste, e reportar ao
      Controle Mestre antes de continuar o checklist.

## Bloco 4 — Refresh e reload (cenários F/G da matriz)

- [ ] Disparar análise profunda na conversa A, dar F5 na aba do WhatsApp Web
      antes do resultado chegar. Confirmar que nenhum estado de outra
      conversa aparece após o reload.
- [ ] Recarregar a extensão (`about:debugging` → Reload) com um job em
      andamento. Confirmar o mesmo.
- [ ] Documentar o comportamento observado mesmo se for "o job simplesmente
      se perde, sem re-sincronizar" — isso pode ser aceitável, mas precisa
      estar documentado como decisão, não descoberto por acidente.

## Bloco 5 — Non-commercial (seção 8 do mandato)

- [ ] Abrir uma conversa pessoal de teste (sem conteúdo comercial).
- [ ] Confirmar: nenhuma análise profunda desnecessária (quando a política
      determinar isso), nenhum coaching, nenhum método, nenhuma sugestão de
      Agenda/CRM, nenhuma mensagem sugerida, nenhuma ação comercial.
- [ ] Alternar a mesma conversa entre pessoal → comercial → pessoal.
      Confirmar que o histórico comercial anterior pode continuar visível,
      mas a sessão pessoal não gera nova evidência comercial.

## Bloco 6 — Duplicação (seção 10 do mandato)

- [ ] Clicar duas vezes rapidamente em "Analisar agora" (duplo clique).
      Confirmar que não aparecem duas intervenções seller-facing
      equivalentes.
- [ ] Forçar uma falha de rede (DevTools → Network → offline) durante uma
      análise e reconectar. Confirmar que o retry não duplica o resultado
      exibido.

## Bloco 7 — Erros (seção 11 do mandato)

- [ ] Simular indisponibilidade do backend (bloquear a URL da API via
      DevTools) e confirmar que a extensão mostra um erro claro, sem
      apresentar resultado de outra conversa como fallback.
- [ ] Fechar/encerrar a conversa (ciclo) durante o processamento e confirmar
      que o resultado, se chegar, não é aplicado a um ciclo já encerrado.

## Registro de resultado

Para cada bloco, registrar: `PASS`, `PASS COM RESSALVA`, `FAIL` ou
`BLOCKER` (conforme a classificação de `RACE_CONDITIONS_MATRIX.md` e
`ISOLATION_MATRIX.md`), com evidência (print de tela, horário, build/commit
testado). Qualquer `BLOCKER` interrompe a revalidação até o Controle Mestre
decidir o próximo passo — não continuar testando os blocos seguintes como se
nada tivesse acontecido.
