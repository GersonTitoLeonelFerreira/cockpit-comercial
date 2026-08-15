# Auditoria de coerência ponta a ponta

Data de referência: 14/08/2026

Escopo: Dashboard, Simulador de Meta, Cockpit/Kanban, Gestão de Faturamento, Relatórios gerenciais e operacionais.

## Objetivo

Garantir que todas as telas usem a mesma competência, calendário operacional, fonte financeira, regra de ganho, escopo de empresa e escopo de responsável. A auditoria também procurou limites silenciosos de consulta, datas calculadas no fuso errado e indicadores derivados de fontes incompatíveis.

## Contrato canônico adotado

| Informação | Fonte/regra única |
|---|---|
| Empresa ativa | Cookie `cockpit_active_company_id`, sempre validado contra `company_memberships` |
| Oportunidade atual | `v_pipeline_items`, excluindo ganho, perdido e cancelado nos indicadores de carteira ativa |
| Estado operacional | `sales_cycles.status` |
| Ganho operacional | `sales_cycles.status = 'ganho'`, com competência por `revenue_seller_ref_date → won_at → closed_at` nos indicadores mensais |
| Faturamento oficial | `v_revenue_daily_seller + v_revenue_daily_extra` ou RPC oficial de resumo |
| Ticket médio | Faturamento oficial de vendedor dividido pelo volume de ganhos; ajustes extras da empresa não aumentam artificialmente o ticket |
| Meta | `revenue_goals`, no mesmo escopo e período do faturamento |
| Dias de execução | `execution_day_calendars.work_days + execution_day_overrides` |
| Ritmo diário necessário | `max(meta - realizado, 0) / dias de execução restantes` |
| Data corrente | Dia civil de `America/Sao_Paulo`, sem depender do UTC do servidor ou do navegador |
| Histórico de atividade | `cycle_events.occurred_at` |

Ganho operacional e faturamento são conceitos relacionados, mas não idênticos. Um ciclo pode estar corretamente marcado como ganho e ainda ter uma pendência financeira. Por isso, volume vem do estado do ciclo e dinheiro vem da fonte financeira reconciliada.

## Divergências confirmadas e correções

| Área | Divergência encontrada | Impacto | Correção aplicada |
|---|---|---|---|
| Simulador x Cockpit | Cada tela calculava dias restantes e ritmo por uma implementação própria | Simulador mostrava 15 dias e R$ 5.688,82/dia; Cockpit mostrava 12 dias e R$ 7.111,02/dia | Criado cálculo compartilhado de ritmo, usando o calendário configurado |
| Relatórios gerais | Dias eram considerados sempre de segunda a sexta | Relatório divergia quando sábado ou exceções estavam habilitados | Relatório passou a ler o calendário operacional da competência |
| Relatórios de desempenho | Faturamento era somado diretamente de `sales_cycles.won_total` | Ajustes feitos na Gestão de Faturamento desapareciam dos relatórios | Dia, semana, mês, radar e produto passaram a usar as visões financeiras oficiais |
| Produto | Ajustes oficiais sem venda/produto não eram conciliados | Total por produto podia não fechar com o total da empresa | Diferença oficial é exibida em “Sem produto vinculado”, sem atribuição artificial |
| Simulador | Existia uma segunda implementação local de métricas e consulta sujeita a 1.000 ciclos | Ganhos/trabalhados podiam divergir do Dashboard e misturar períodos | Simulador passou a usar a mesma RPC oficial do Dashboard |
| Dashboard | Funil e carteira usavam consultas limitadas a 1.000 linhas; escopo de vendedor não era aplicado a dois totais | Empresas maiores podiam ter totais menores que o real; vendedor podia receber número da empresa | Consultas paginadas, contagem exata e escopo explícito por responsável |
| Kanban | Totais das colunas eram obtidos por listas sujeitas ao limite padrão de 1.000 linhas | Cabeçalho da coluna podia subcontar oportunidades | Contagem `exact` independente para cada etapa, com os mesmos filtros da visualização |
| Filtros do Kanban | Lista de grupos era inferida somente da primeira página de oportunidades | Grupos válidos podiam não aparecer no filtro | Leitura paginada de todos os grupos em uso |
| Vocação operacional | Algumas consultas usavam `cycle_events.created_at`, coluna que não representa o momento oficial do evento; ganhos sem valor eram descartados | Dia/semana/mês de vocação podiam ficar errados e divergir do volume oficial de ganhos | Uso de `occurred_at`, paginação e mesma definição operacional de ganho |
| Radar | Janelas chamadas de 7 e 14 dias tinham um dia a mais; pipeline podia ser aproximado | Tendência recente e pressão de carteira ficavam distorcidas | Janelas inclusivas corrigidas e contagem exata na visão operacional |
| Datas | Algumas páginas derivavam “hoje” em UTC ou no fuso do navegador | Virada do dia podia mudar competência e período no servidor | Centralizada a data civil de São Paulo |
| Score de aderência | Esperado diário considerava apenas segunda a sexta | Aderência ignorava sábados e exceções configuradas | Esperado passou a usar todos os calendários que cruzam o intervalo analisado |
| Dashboard legado | `/dashboard/sales` mantinha uma segunda leitura do mesmo negócio | Risco de duas telas exibirem regras diferentes | Rota legada redirecionada para o Dashboard oficial |

## Validação da competência atual

Empresa validada: Engenharia do Corpo Joinville

Competência: 01/08/2026 a 31/08/2026

Data de corte: 14/08/2026

| Indicador canônico | Valor validado |
|---|---:|
| Meta | R$ 245.000,00 |
| Faturamento oficial | R$ 159.667,70 |
| Gap | R$ 85.332,30 |
| Dias de execução no período | 26 |
| Dias de execução decorridos | 12 |
| Dias de execução restantes | 15 |
| Ritmo diário necessário | R$ 5.688,82 |

Esse conjunto deve aparecer igual no Simulador, Cockpit e contexto financeiro dos Relatórios. O dia atual é incluído tanto na leitura decorrida quanto na capacidade restante, pois ainda é um dia disponível para execução; portanto, esses dois números não devem ser somados para reconstruir o total do período.

## Integridade dos dados

As verificações no banco da empresa ativa encontraram:

| Verificação | Resultado |
|---|---:|
| Ciclos ligados a empresa diferente do lead | 0 |
| Eventos ligados a empresa diferente do ciclo | 0 |
| Leads com mais de um ciclo aberto | 0 |
| Ganhos sem data de ganho | 0 |
| Valores ganhos negativos | 0 |
| Ganhos sem valor comercial preenchido | 3 |
| Ciclos fechados com texto antigo de próxima ação | 4 |

Os sete registros históricos pendentes não foram alterados automaticamente. Os três ganhos precisam ter o valor confirmado pelo negócio; inventar ou copiar um valor poderia corromper o faturamento. Os quatro ciclos fechados não entram na carteira ativa, mas o texto residual deve ser revisado em uma rotina de saneamento aprovada.

## Verificações automatizadas

- 12 testes de calendário, fuso, ritmo e reconciliação financeira.
- 6 testes de prioridade do Cockpit/Kanban.
- Verificação sintática dos serviços TypeScript alterados.
- `git diff --check` sem erros de whitespace.
- Varredura sem uso residual de `cycle_events.created_at` nos serviços auditados.
- Varredura sem fórmula paralela de segunda a sexta nos relatórios corrigidos.

O build da Vercel é a barreira final de tipos, integração Next.js e geração das rotas, pois o ambiente local da auditoria não possui as dependências instaladas.

## Critérios permanentes de aceite

1. Para a mesma empresa, responsável e competência, Meta, Realizado, Gap, Dias restantes e Ritmo diário devem ser idênticos em todas as telas.
2. Ajuste salvo na Gestão de Faturamento deve aparecer no Dashboard, Simulador, Cockpit e relatórios financeiros.
3. Volume de ganhos não deve desaparecer por falta de valor; a pendência financeira deve ser tratada separadamente.
4. Nenhuma contagem gerencial pode depender da primeira página de 1.000 registros.
5. Todo relatório deve declarar período, empresa, responsável e fonte da métrica.
6. Toda leitura de “hoje” deve usar `America/Sao_Paulo`.
7. Alterações no calendário operacional devem repercutir no ritmo e na aderência sem fórmulas duplicadas.
