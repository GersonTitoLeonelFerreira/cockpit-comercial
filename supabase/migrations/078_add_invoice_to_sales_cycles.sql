-- Corrige a migration de invoice em sales_cycles.
-- Esta migration é idempotente porque parte dessas alterações já existe no banco.

alter table public.sales_cycles
add column if not exists invoice_id uuid references public.revenue_extra_sources(id) on delete set null;

alter table public.sales_cycles
add column if not exists won_value_source varchar(50) default 'manual';

create index if not exists idx_sales_cycles_invoice_id
on public.sales_cycles(invoice_id)
where invoice_id is not null;

comment on column public.sales_cycles.invoice_id
is 'Referência à fatura/fonte de receita associada ao deal ganho';

comment on column public.sales_cycles.won_value_source
is 'Origem do valor: manual, revenue ou invoice';