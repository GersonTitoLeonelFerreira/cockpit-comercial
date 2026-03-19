-- Adicionar coluna para linkar fatura
ALTER TABLE public.sales_cycles
ADD COLUMN invoice_id UUID REFERENCES public.revenue_extra_sources(id) ON DELETE SET NULL;

-- Adicionar coluna para armazenar o valor manualmente preenchido
ALTER TABLE public.sales_cycles
ADD COLUMN won_value_source VARCHAR(50) DEFAULT 'manual'; -- 'manual' ou 'invoice'

-- Criar índice para performance
CREATE INDEX idx_sales_cycles_invoice_id 
ON public.sales_cycles(invoice_id) 
WHERE invoice_id IS NOT NULL;

-- Adicionar comentário
COMMENT ON COLUMN public.sales_cycles.invoice_id IS 'Referência à fatura/fonte de receita associada ao deal ganho';
COMMENT ON COLUMN public.sales_cycles.won_value_source IS 'Origem do valor: manual (preenchido manualmente) ou invoice (vem da fatura)';