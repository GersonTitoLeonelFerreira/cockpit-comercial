# ManyChat — resultado live do export seguro do relatório MAIN world

Estado: PASS live do fallback de exportação. O relatório seguro foi baixado com sucesso pelo Firefox e lido localmente sem expor valores brutos de identidade.

## Evidência executada

Validação autenticada real em `app.manychat.com`, usando o pacote Firefox gerado da branch `chatgpt/manychat-report-copy-fallback`.

O fluxo A → B → A foi repetido e o terceiro clique produziu o arquivo:

`yolen-manychat-mainworld-identity-report.json`

O arquivo foi localizado em `~/Downloads` e lido pelo terminal.

## Resultado do relatório

O relatório final informou:

- `schema_version = yolen-manychat-mainworld-identity-result-v1`;
- `platform = manychat`;
- `react_fiber_found = true`;
- `proven_locator_count = 91`;
- `pass = true`;
- `stage = returned_to_baseline_evaluated`.

Entre as famílias de locators provadas aparecem, repetidas em diferentes níveis da árvore React:

- `subscriberId`;
- `thread.user_id`;
- `thread.user.user_id`;
- `user.user_id`;
- `thread.user.wa_id`;
- `user.wa_id`;
- `thread.last_lc_event.user_id`;
- `data.user_id`.

## Privacidade

O relatório confirmou:

- `raw_identity_value_exposed = false`;
- `hashes_exposed = false`;
- `raw_message_text_exposed = false`;
- `persisted = false`;
- `network_sent = false`.

Nenhum valor bruto de `subscriberId`, `user_id`, `wa_id`, telefone ou texto de mensagem foi exportado.

## Correção validada

O exporter foi ajustado para observar o clique na fase de bubble, depois do handler principal do probe gravar o relatório final no botão. O teste de regressão correspondente foi incluído.

A suíte local executada antes do teste live terminou com:

- 12 testes executados;
- 12 aprovados;
- 0 falhas;
- pacotes Chrome dev/prod gerados;
- pacotes Firefox dev/prod gerados.

## Próximo gate

Os 91 locators provam estabilidade, mas não autorizam escolher arbitrariamente um deles como identidade produtiva.

O próximo gate deve reduzir essas ocorrências a famílias semânticas e validar, sem expor valores brutos:

1. quais locators representam o mesmo valor interno;
2. se `subscriberId` e `user_id` são equivalentes ou identidades distintas;
3. se `wa_id` é uma identidade WhatsApp distinta e utilizável;
4. qual chave é adequada para um namespace determinístico da Yolen.

Até esse gate passar, continuam desligados resolução automática de lead, associação automática com `cycle_id`, persistência geral de mensagens ManyChat e reasoning produtivo.