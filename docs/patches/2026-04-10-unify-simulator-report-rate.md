# Unificação da taxa entre Simulador de Meta e Relatórios

## Arquivos envolvidos

### Frontend
- `app/dashboard/simulador-meta/page.tsx`
- `app/relatorios/gerais/page.tsx`
- `app/lib/services/simulator.ts`
- `app/lib/services/simulatorRateReal.ts`

### Banco / RPCs
- `supabase/migrations/015_version_revenue_infrastructure.sql`
- `supabase/migrations/016_unify_simulator_report_rate_source.sql` *(novo)*

## Problema raiz

Hoje o Simulador usa uma configuração operacional dinâmica:
- taxa planejada (`closeRatePercent`)
- taxa real histórica (`getCloseRateReal`)
- seletor de origem (`rateSource` = `planejada` ou `real`)

Já o Relatório Geral recalcula a taxa por conta própria a partir do consolidado real e rotula isso como se fosse a taxa usada no simulador. Isso quebra a consistência.

## Estratégia correta

Transformar `revenue_goals` na fonte única da verdade para o plano salvo:
- `goal_value`
- `ticket_medio`
- `close_rate_percent`
- `rate_source`

Assim:
1. o Simulador salva a configuração completa
2. o Relatório lê exatamente a configuração salva
3. a taxa exibida como “Aplicada no plano” fica igual à taxa do Simulador

## Observação de escopo

Este ajuste unifica o relatório **geral da empresa** com o Simulador quando ele está salvo em `Empresa (todos)`.
O relatório geral ainda não espelha um contexto por vendedor selecionado. Isso exigiria uma variação de relatório por owner.
