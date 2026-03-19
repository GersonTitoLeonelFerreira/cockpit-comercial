# 📊 Documentação Completa - Sistema de Dashboard de Vendas

**Data:** 13/03/2026  
**Versão:** 1.0.0  
**Status:** ✅ Produção

---

## 📑 Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura](#arquitetura)
3. [Banco de Dados](#banco-de-dados)
4. [Componentes React](#componentes-react)
5. [Hooks Custom](#hooks-custom)
6. [Serviços](#serviços)
7. [Como Usar](#como-usar)
8. [Querys SQL](#querys-sql)
9. [Troubleshooting](#troubleshooting)

---

## 🎯 Visão Geral

Sistema completo de dashboard de vendas com:

✅ **5 Views SQL** para relatórios  
✅ **5 Funções PL/pgSQL** para operações  
✅ **3 Triggers** para auditoria automática  
✅ **Row Level Security (RLS)** para segurança  
✅ **6 Componentes React** para UI  
✅ **1 Hook Custom** para gerenciamento de estado  
✅ **3 Gráficos Interativos** com Recharts  

---

## 🏗️ Arquitetura

```
Supabase (PostgreSQL)
    ↓
Views SQL (vw_sales_funnel, etc)
    ↓
Services (sales-analytics.ts)
    ↓
Hooks (useKPIsAndAnalytics)
    ↓
Components (KPICards, PerformanceTable, etc)
    ↓
React/Next.js Frontend
```

---

## 💾 Banco de Dados

### Views Criadas

#### 1. `vw_sales_cycles_complete`
**Uso:** Ver todos os dados de um deal em um único lugar

```sql
SELECT * FROM vw_sales_cycles_complete WHERE id = 'SALES_CYCLE_ID';
```

**Retorna:**
- Dados básicos do deal
- Status atual
- Informações de ganho/perda
- Dias em ciclo
- Resultado final

---

#### 2. `vw_sales_funnel`
**Uso:** Entender o funil de vendas

```sql
SELECT * FROM vw_sales_funnel;
```

**Retorna:**
- Status do deal
- Total de deals por status
- Deals ganhos/perdidos
- Taxa de conversão
- Valor médio
- Receita total

---

#### 3. `vw_sales_performance_by_owner`
**Uso:** Comparar performance dos vendedores

```sql
SELECT * FROM vw_sales_performance_by_owner 
ORDER BY taxa_conversao_pct DESC;
```

**Retorna:**
- Email do vendedor
- Total de deals
- Deals ganhos/perdidos
- Taxa de conversão (%)
- Receita total
- Dias médio do ciclo

---

#### 4. `vw_sales_monthly_analysis`
**Uso:** Análise de tendências mensais

```sql
SELECT * FROM vw_sales_monthly_analysis 
ORDER BY mes DESC;
```

**Retorna:**
- Mês
- Total de deals criados
- Deals ganhos/perdidos
- Taxa de conversão mensal
- Receita total
- Receita média por deal

---

#### 5. `vw_sales_lost_analysis`
**Uso:** Entender motivos de perda

```sql
SELECT * FROM vw_sales_lost_analysis 
ORDER BY total DESC;
```

**Retorna:**
- Motivo da perda
- Total de deals perdidos
- Percentual (%)
- Dias até perda

---

### Funções PL/pgSQL Criadas

#### 1. `fn_mark_deal_won()`
Marca um deal como ganho

```typescript
await supabase.rpc('fn_mark_deal_won', {
  p_sales_cycle_id: 'deal-id',
  p_won_owner_user_id: 'user-id',
  p_won_total: 15000,
  p_won_items: 1,
  p_won_note: 'Notas opcionais'
});
```

---

#### 2. `fn_mark_deal_lost()`
Marca um deal como perdido

```typescript
await supabase.rpc('fn_mark_deal_lost', {
  p_sales_cycle_id: 'deal-id',
  p_lost_reason: 'Motivo da perda',
  p_lost_owner_user_id: 'user-id'
});
```

---

#### 3. `fn_pause_deal()`
Pausa um deal

```typescript
await supabase.rpc('fn_pause_deal', {
  p_sales_cycle_id: 'deal-id',
  p_paused_reason: 'Motivo da pausa'
});
```

---

#### 4. `fn_resume_deal()`
Retoma um deal pausado

```typescript
await supabase.rpc('fn_resume_deal', {
  p_sales_cycle_id: 'deal-id',
  p_new_status: 'contato'
});
```

---

#### 5. `fn_cancel_deal()`
Cancela um deal

```typescript
await supabase.rpc('fn_cancel_deal', {
  p_sales_cycle_id: 'deal-id',
  p_canceled_reason: 'Motivo do cancelamento'
});
```

---

### Auditoria Automática

Cada mudança em `sales_cycles` é registrada em `audit_sales_cycles`:

- **Quem** mudou (user_id)
- **Quando** mudou (timestamp)
- **O quê** mudou (campo específico)
- **De** qual valor
- **Para** qual valor

**Ver histórico de um deal:**

```sql
SELECT * FROM vw_audit_sales_cycles_history 
WHERE sales_cycle_id = 'deal-id'
ORDER BY changed_at DESC;
```

---

## ⚛️ Componentes React

### 1. `KPICards`
**Localização:** `app/components/dashboard/KPICards.tsx`

Mostra 5 KPIs principais em cards:
- Total de Deals
- Deals Ganhos
- Deals Perdidos
- Receita Total
- Taxa de Conversão

**Uso:**
```typescript
import { KPICards } from '@/app/components/dashboard/KPICards'

export function Dashboard() {
  return <KPICards />
}
```

---

### 2. `PerformanceTable`
**Localização:** `app/components/dashboard/PerformanceTable.tsx`

Tabela comparativa de performance dos vendedores

**Colunas:**
- Vendedor (email)
- Total Deals
- Ganhos
- Taxa %
- Receita
- Ciclo (dias)

---

### 3. `UpcomingDeals`
**Localização:** `app/components/dashboard/UpcomingDeals.tsx`

Lista de deals que vencem nos próximos 7 dias

**Mostra:**
- Lead ID
- Status
- Owner (vendedor)
- Próxima ação
- Dias restantes (com alerta se urgente)

---

### 4. `SalesFunnelChart`
**Localização:** `app/components/dashboard/SalesFunnelChart.tsx`

Gráfico de barras do funil de vendas

**Dependências:**
```bash
npm install recharts
```

---

### 5. `MonthlyRevenueChart`
**Localização:** `app/components/dashboard/MonthlyRevenueChart.tsx`

Gráfico combinado (linha + barras) de receita mensal

---

### 6. `LostAnalysisChart`
**Localização:** `app/components/dashboard/LostAnalysisChart.tsx`

Gráfico de pizza com motivos de perda

---

## 🎣 Hooks Custom

### `useKPIsAndAnalytics()`
**Localização:** `app/hooks/useKPIsAndAnalytics.ts`

Hook que gerencia todos os dados de analytics

**Uso:**
```typescript
'use client'

import { useKPIsAndAnalytics } from '@/app/hooks/useKPIsAndAnalytics'

export function MyComponent() {
  const { funnel, performance, loading, error } = useKPIsAndAnalytics()

  if (loading) return <div>Carregando...</div>
  if (error) return <div>Erro: {error}</div>

  return (
    <div>
      {/* Seu código aqui */}
    </div>
  )
}
```

---

## 🔗 Serviços

### `sales-analytics.ts`
**Localização:** `app/lib/services/sales-analytics.ts`

Funções que chamam as views do Supabase

#### Funções Disponíveis

```typescript
// Retorna dados do funil
export async function getSalesFunnel(): Promise<any[]>

// Retorna performance por vendedor
export async function getPerformanceByOwner(): Promise<any[]>

// Retorna análise mensal
export async function getMonthlySalesAnalysis(): Promise<any[]>

// Retorna motivos de perda
export async function getLostAnalysis(): Promise<any[]>

// Retorna um deal completo
export async function getSalesCycleComplete(cycleId: string): Promise<any>

// Retorna histórico de auditoria
export async function getCycleAuditHistory(cycleId: string): Promise<any[]>

// Retorna deals que vencem nos próximos N dias
export async function getUpcomingDeals(daysAhead?: number): Promise<any[]>
```

---

## 📖 Como Usar

### Criar uma página de Dashboard

**Arquivo:** `app/dashboard/page.tsx`

```typescript
'use client'

import { KPICards } from '@/app/components/dashboard/KPICards'
import { PerformanceTable } from '@/app/components/dashboard/PerformanceTable'
import { UpcomingDeals } from '@/app/components/dashboard/UpcomingDeals'
import { SalesFunnelChart } from '@/app/components/dashboard/SalesFunnelChart'
import { MonthlyRevenueChart } from '@/app/components/dashboard/MonthlyRevenueChart'
import { LostAnalysisChart } from '@/app/components/dashboard/LostAnalysisChart'

export default function DashboardPage() {
  return (
    <div className="space-y-6 p-6">
      {/* KPIs */}
      <KPICards />

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SalesFunnelChart />
        <MonthlyRevenueChart />
      </div>

      {/* Performance */}
      <PerformanceTable />

      {/* Próximos e Perdas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <UpcomingDeals />
        <LostAnalysisChart />
      </div>
    </div>
  )
}
```

---

## 🔍 Querys SQL Prontas

### Query 1: Top 10 deals com maior valor

```sql
SELECT 
  sc.id,
  sc.lead_id,
  u.email as owner,
  sc.status,
  sc.won_total as valor,
  sc.won_at,
  EXTRACT(DAY FROM (sc.won_at - sc.created_at)) as dias_para_ganhar
FROM public.sales_cycles sc
LEFT JOIN auth.users u ON sc.owner_user_id = u.id
WHERE sc.won_total IS NOT NULL
ORDER BY sc.won_total DESC
LIMIT 10;
```

---

### Query 2: Deals que vencem nos próximos 7 dias

```sql
SELECT 
  sc.id,
  sc.lead_id,
  u.email as owner,
  sc.status,
  sc.next_action,
  sc.next_action_date,
  EXTRACT(DAY FROM (sc.next_action_date - NOW())) as dias_restantes
FROM public.sales_cycles sc
LEFT JOIN auth.users u ON sc.owner_user_id = u.id
WHERE sc.status IN ('novo', 'contato', 'respondeu', 'negociacao')
  AND sc.next_action_date IS NOT NULL
  AND sc.next_action_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
ORDER BY sc.next_action_date ASC;
```

---

### Query 3: Motivos mais comuns de perda

```sql
SELECT 
  lost_reason,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM public.sales_cycles WHERE lost_at IS NOT NULL), 2) as percentual,
  ROUND(AVG(EXTRACT(DAY FROM (lost_at - created_at))), 1) as dias_medio
FROM public.sales_cycles
WHERE lost_at IS NOT NULL
GROUP BY lost_reason
ORDER BY total DESC;
```

---

### Query 4: Vendedor com melhor taxa de conversão

```sql
SELECT 
  u.email,
  COUNT(*) as total_deals,
  COUNT(CASE WHEN sc.won_at IS NOT NULL THEN 1 END) as deals_ganhos,
  ROUND(100.0 * COUNT(CASE WHEN sc.won_at IS NOT NULL THEN 1 END) / COUNT(*), 2) as taxa_conversao_pct,
  COALESCE(SUM(sc.won_total), 0) as receita_total,
  ROUND(AVG(EXTRACT(DAY FROM (COALESCE(sc.won_at, NOW()) - sc.created_at))), 1) as dias_medio_ciclo
FROM public.sales_cycles sc
LEFT JOIN auth.users u ON sc.owner_user_id = u.id
WHERE sc.owner_user_id IS NOT NULL
GROUP BY u.id, u.email
ORDER BY taxa_conversao_pct DESC;
```

---

### Query 5: Deals em negociação há mais de 30 dias

```sql
SELECT 
  sc.id,
  sc.lead_id,
  u.email as owner,
  sc.status,
  sc.stage_entered_at,
  EXTRACT(DAY FROM (NOW() - sc.stage_entered_at)) as dias_neste_status,
  sc.next_action,
  sc.next_action_date
FROM public.sales_cycles sc
LEFT JOIN auth.users u ON sc.owner_user_id = u.id
WHERE sc.status = 'negociacao'
  AND EXTRACT(DAY FROM (NOW() - sc.stage_entered_at)) > 30
ORDER BY sc.stage_entered_at ASC;
```

---

### Query 6: Receita por mês (Últimos 6 meses)

```sql
SELECT 
  DATE_TRUNC('month', sc.won_at)::date as mes,
  COUNT(*) as deals_ganhos,
  COALESCE(SUM(sc.won_total), 0) as receita_total,
  ROUND(AVG(sc.won_total), 2) as ticket_medio,
  COALESCE(SUM(sc.won_items), 0) as items_totais
FROM public.sales_cycles sc
WHERE sc.won_at IS NOT NULL
  AND sc.won_at >= NOW() - INTERVAL '6 months'
GROUP BY DATE_TRUNC('month', sc.won_at)
ORDER BY mes DESC;
```

---

## 🐛 Troubleshooting

### Problema: "Módulo não tem nenhum membro exportado"

**Solução:**
1. Verifique se o arquivo existe
2. Verifique se as funções têm `export async function`
3. Reinicie o TypeScript: `Ctrl+Shift+P` → "TypeScript: Restart TS Server"

---

### Problema: Dados carregando mas não aparecem

**Solução:**
1. Verifique as views no Supabase
2. Verifique se a autenticação está funcionando
3. Verifique o console do navegador para erros

---

### Problema: "RLS policy violation"

**Solução:**
1. Verifique se o usuário tem permissão
2. Verifique as policies criadas
3. Verifique se o usuário está logado

---

## 📋 Checklist de Implantação

- [x] Views SQL criadas no Supabase
- [x] Funções PL/pgSQL criadas
- [x] Triggers de auditoria criados
- [x] RLS ativado e policies configuradas
- [x] Arquivo `sales-analytics.ts` criado
- [x] Hook `useKPIsAndAnalytics.ts` criado
- [x] 6 Componentes React criados
- [x] Recharts instalado
- [x] 3 Gráficos interativos criados
- [ ] Página de dashboard integrada
- [ ] Testes em produção

---

## 🎓 Próximos Passos

1. **Integração com seu app** - Adicione os componentes em suas páginas
2. **Customização de cores** - Ajuste as cores dos cards e gráficos
3. **Filtros** - Adicione filtros por período, vendedor, etc
4. **Exports** - Crie botão para exportar dados em PDF/Excel
5. **Alertas** - Configure notificações para deals urgentes
6. **Mobile** - Otimize para mobile

---

## 📁 Estrutura de Arquivos Criados

```
cockpit-comercial/
├── app/
│   ├── components/
│   │   └── dashboard/
│   │       ├── KPICards.tsx
│   │       ├── PerformanceTable.tsx
│   │       ├── UpcomingDeals.tsx
│   │       ├── SalesFunnelChart.tsx
│   │       ├── MonthlyRevenueChart.tsx
│   │       └── LostAnalysisChart.tsx
│   ├── hooks/
│   │   └── useKPIsAndAnalytics.ts
│   ├── lib/
│   │   └── services/
│   │       └── sales-analytics.ts
│   └── dashboard/
│       └── page.tsx (você criar)
└── DOCUMENTACAO_DASHBOARD.md (este arquivo)
```

---

## 📊 Resumo Final

**Total de Arquivos Criados:** 10  
**Total de Componentes:** 6  
**Total de Hooks:** 1  
**Total de Serviços:** 1  
**Total de Querys:** 10+  
**Total de Views:** 5  
**Total de Funções:** 5  
**Total de Triggers:** 3  

---

**✅ Tudo pronto para usar!**

Integre os componentes em suas páginas e aproveite o dashboard! 🚀
