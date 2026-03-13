# 🚀 FASE 2 - RESUMO EXECUTIVO

## Objetivo Final
Migrar o sistema de `leads` diretos para usar `sales_cycles` como fonte de verdade, mantendo histórico completo de eventos.

## ✅ O que foi entregue

### 1️⃣ SQL - RPCs (7 funções)
📁 `supabase/migrations/002_phase2_rpcs_sales_cycles.sql`

```sql
rpc_move_cycle_stage()          # Move entre estágios + registra evento
rpc_assign_cycle_owner()         # Admin atribui ciclo a vendedor
rpc_set_next_action()            # Define próxima ação
rpc_get_user_sales_cycles()     # Retorna ciclos do usuário
rpc_get_pool_cycles()            # Admin vê ciclos não atribuídos
rpc_close_cycle_won()            # Fecha como ganho
rpc_close_cycle_lost()           # Fecha como perdido
```

**Execução**: Copiar SQL completo → Supabase SQL Editor → Run

### 2️⃣ TypeScript Types
📁 `app/types/sales_cycles.ts`

```typescript
LeadStatus              # 'novo' | 'contato' | 'respondeu' | 'negociacao' | 'ganho' | 'perdido'
SalesCycle            # Modelo de ciclo
CycleEvent            # Modelo de evento
RpcCycleResponse      # Retorno das RPCs
UserCycle             # DTO para lista de vendedor
PoolCycle             # DTO para pool admin
```

### 3️⃣ Services Layer
📁 `app/lib/services/sales-cycles.ts`

```typescript
moveCycleStage()        # Chama RPC + trata resposta
assignCycleOwner()      # Chama RPC de atribuição
setNextAction()         # Chama RPC de ação
closeCycleWon()         # Chama RPC + registra valor
closeCycleLost()        # Chama RPC + registra motivo
getUserSalesCycles()    # Busca ciclos do usuário
getPoolCycles()         # Busca ciclos não atribuídos
getCycleEvents()        # Busca histórico de eventos
getSalesCycleWithLead() # Busca ciclo com dados do lead
```

### 4️⃣ API Routes
📁 `app/api/sales-cycles/route.ts` (POST, PUT, PATCH)
📁 `app/api/sales-cycles/close/route.ts` (POST com action=won|lost)

Endpoints já tipados e com tratamento de erro completo.

## 📋 PASSO-A-PASSO DE IMPLEMENTAÇÃO

### Dia 1: Backend Setup (2-3 horas)

**Passo 1**: Executar Migration Phase 2
```bash
1. Supabase Dashboard → SQL Editor
2. Copiar 002_phase2_rpcs_sales_cycles.sql
3. Run query
4. Verificar: Testar RPC no SQL Editor
```

**Passo 2**: Criar arquivos TypeScript
```bash
1. Copiar types_sales_cycles.ts → app/types/sales_cycles.ts
2. Copiar services_sales_cycles.ts → app/lib/services/sales-cycles.ts
3. npm run build (verificar tipos)
```

**Passo 3**: Criar API routes
```bash
1. Copiar api_sales_cycles_route.ts → app/api/sales-cycles/route.ts
2. Copiar api_sales_cycles_close_route.ts → app/api/sales-cycles/close/route.ts
3. npm run dev
4. Testar: curl -X POST http://localhost:3000/api/sales-cycles ...
```

### Dia 2: Frontend - Pool (2 horas)

**Arquivo**: `app/pool/PoolClient.tsx`

```typescript
// ANTES (leads diretos):
const { data: leadsData } = await supabase
  .from('leads')
  .select('*')
  .eq('status', 'novo')
  .is('owner_id', null)

// DEPOIS (sales_cycles):
const poolCycles = await getPoolCycles(100, 0)

// Mudar card para ciclo ao invés de lead
// Botão "Encaminhar" → assignCycleOwner()
```

**Checklist**:
- [ ] Atualizar query para `rpc_get_pool_cycles()`
- [ ] Mudar renderização: `poolCycles.map()` ao invés de `leads.map()`
- [ ] Botão "Encaminhar" chama `assignCycleOwner()`
- [ ] Testar: Login como admin → pool carrega ciclos

### Dia 3: Frontend - Kanban (3-4 horas)

**Arquivo**: `app/leads/components/SellerKanban.tsx` (ou novo `SalesCyclesKanban.tsx`)

```typescript
// Estrutura:
const { cycles, loading, refetch } = useSalesCycles()

// Renderizar colunas por status
const statusColumns: LeadStatus[] = ['novo', 'contato', 'respondeu', 'negociacao', 'ganho', 'perdido']

statusColumns.forEach(status => {
  const cyclesInStatus = cycles.filter(c => c.cycle_status === status)
  // renderizar cards com drag-drop
})

// Drag & drop → moveCycleStage()
// Fechar modal → closeCycleWon() ou closeCycleLost()
// Botão next_action → setNextAction()
```

**Biblioteca**: Use a mesma `@hello-pangea/dnd` que já está no projeto

**Checklist**:
- [ ] Criar hook `useSalesCycles()`
- [ ] Atualizar query para `getUserSalesCycles()`
- [ ] Implementar drag-drop
- [ ] Testar: Mover ciclo → evento criado

### Dia 4: Frontend - Lead Detail + Criação (2 horas)

**Arquivo 1**: `app/leads/[id]/page.tsx`

```typescript
// Ao carregar detalhe de lead, buscar ciclos ativos:
const cycles = await getSalesCycleWithLead(leadId)

// Mostrar:
// - Ciclo atual (status, próxima ação, etc)
// - Timeline de eventos (cycle_events)
// - Botões: mover, fechar, ação
```

**Arquivo 2**: `app/leads/components/LeadForm.tsx` (criar novo)

```typescript
// Ao salvar novo lead, criar automaticamente sales_cycle:
const { data: newLead } = await supabase.from('leads').insert(...).select().single()
const { data: cycle } = await supabase.from('sales_cycles').insert({
  company_id,
  lead_id: newLead.id,
  owner_user_id: userId,
  status: 'novo'
}).select().single()

// Registrar evento:
await supabase.from('cycle_events').insert({
  company_id,
  cycle_id: cycle.id,
  event_type: 'cycle_created',
  created_by: userId,
  metadata: { lead_id: newLead.id }
})
```

**Checklist**:
- [ ] Mostrar ciclo ativo no detalhe do lead
- [ ] Mostrar timeline de eventos
- [ ] Auto-criar ciclo ao criar lead
- [ ] Testar: Criar lead → ciclo criado automaticamente

### Dia 5: Testing + Deploy (2-3 horas)

```typescript
// Unit Tests (com Vitest/Jest)
describe('Sales Cycles', () => {
  it('deve mover ciclo de estágio', async () => {
    const result = await moveCycleStage({...})
    expect(result.status).toBe('contato')
  })
})

// E2E Tests (com Playwright/Cypress)
test('Vendedor move ciclo via Kanban', async () => {
  await page.goto('/leads')
  await page.drag('.cycle-card', '.column-contato')
  // Verificar que evento foi criado
})
```

## 🎯 Ordem de Prioridade

**CRÍTICO (Dia 1-2)**:
1. [ ] Migration Phase 2 (RPC Functions)
2. [ ] Types + Services
3. [ ] API Routes
4. [ ] Pool atualizada

**IMPORTANTE (Dia 3-4)**:
5. [ ] Kanban atualizado
6. [ ] Auto-criar ciclo ao lead
7. [ ] Timeline de eventos

**NICE-TO-HAVE (Dia 5)**:
8. [ ] Tests
9. [ ] Otimizações
10. [ ] Documentação

## ⚠️ Pontos de Atenção

### 1. Compatibilidade com Leads Existentes
```sql
-- Migração de leads para ciclos (admin pode fazer depois):
INSERT INTO public.sales_cycles (
  company_id, lead_id, owner_user_id, status, created_at
)
SELECT 
  l.company_id, l.id, l.owner_id, 
  CASE l.status WHEN 'novo' THEN 'novo' WHEN 'contato' THEN 'contato' ... END,
  l.created_at
FROM public.leads l
WHERE NOT EXISTS (
  SELECT 1 FROM public.sales_cycles WHERE lead_id = l.id
);
```

### 2. RLS Security
- ✅ Todas RPCs validam `company_id` automaticamente
- ✅ Vendedor não consegue ver ciclos de outros
- ✅ Apenas admin pode atribuir

### 3. Performance
- ✅ Índices já criados na Phase 1
- ✅ Queries com `limit 100` default
- ✅ Use `offset` para pagination

## 🧪 Testing Queries

```sql
-- Testar RPC no Supabase SQL Editor
SELECT * FROM public.rpc_move_cycle_stage(
  '{{ cycle_id }}'::uuid,
  'contato'::public.lead_status,
  '{}'::jsonb
);

-- Verificar eventos criados
SELECT * FROM public.cycle_events 
WHERE cycle_id = '{{ cycle_id }}'
ORDER BY occurred_at DESC;
```

## 📞 Troubleshooting

**Erro**: "Ciclo não encontrado"
→ Verificar: `company_id` correto, ciclo existe em `sales_cycles`

**Erro**: "Acesso negado"
→ Verificar: Usuário é owner do ciclo OU admin

**Erro**: "RPC não existe"
→ Verificar: Migration Phase 2 foi executada

## 📊 Métricas de Sucesso

✅ **Fase 2 Completa quando**:
- [ ] Admin consegue ver e distribuir POOL
- [ ] Vendedor vê ciclos via Kanban
- [ ] Mover ciclo cria evento automaticamente
- [ ] Criar lead cria ciclo automaticamente
- [ ] Histórico completo de eventos visível

## 🚀 Deploy Checklist

```bash
# Antes de fazer merge:
[ ] npm run build (sem erros)
[ ] npm run lint (sem warnings)
[ ] Testar localmente com banco de dev
[ ] Verificar RLS policies (Supabase dashboard)
[ ] Testar com diferentes roles (admin, seller)
[ ] Backup do banco antes de migration
```

## 📚 Documentação Relacionada

- Arquitetura Phase 1: `001_phase1_base_tables_PRODUCTION_SAFE_FIXED.sql`
- Types: Verificar `app/types/sales_cycles.ts`
- Serviços: Usar funções de `app/lib/services/sales-cycles.ts`

---

**Status**: 🟢 Pronto para implementação  
**Tempo Estimado**: 10-12 horas (2-3 dias)  
**Data Recomendada de Início**: 2026-03-06  
**Data Conclusão Esperada**: 2026-03-10