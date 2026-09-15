# ManyChat — Resultado real do gate de contexto

Data: 2026-09-15

## Evidência autenticada

O probe `#yolen-context-probe` foi executado no Firefox autenticado contra uma conversa real do ManyChat, usando o fluxo A → B → A dentro do mesmo workspace.

Resultado seller-visible observado no terceiro clique:

`Yolen · canal PASS · contato estruturado não provado`

## Decisão do gate

O canal foi comprovado de forma independente pela superfície autenticada. Para a conversa observada, o canal é WhatsApp.

A identidade estruturada do contato NÃO foi comprovada pelos candidatos permitidos pelo gate. Portanto:

- `channel = whatsapp` pode avançar como evidência autenticada para esta superfície;
- `external_contact_id` continua `null` quando a única identidade disponível é a rota da conversa;
- associação automática ManyChat → lead/ciclo continua desligada;
- nenhum fallback por nome visível, texto, posição da conversa ou heurística de DOM é autorizado.

## Clipboard diagnóstico

A tentativa de copiar o relatório seguro via `navigator.clipboard` não produziu conteúdo recuperável com `pbpaste` no ambiente testado. Isso não invalida o resultado do gate porque o estado final explícito do probe foi observado diretamente na interface autenticada.

O clipboard não deve ser tratado como requisito funcional do runtime produtivo.

## Próximo passo

O próximo gate deve buscar uma fonte estruturada independente para resolver a conversa a um lead/ciclo Yolen. Se o ManyChat não expuser tal fonte de modo estável e seguro, a associação deve exigir um vínculo explícito controlado pelo Yolen em vez de inferência.

Captura automática, persistência de mensagens, reasoning e composer permanecem desligados neste ponto.
