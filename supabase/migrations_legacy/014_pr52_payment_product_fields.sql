-- ==============================================================================
-- PR 5.2 — Vínculo Produto + Forma de Pagamento no Fechamento da Venda
-- ==============================================================================

-- Adicionar product_id: referência ao produto vendido (nullable)
ALTER TABLE public.sales_cycles
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;

-- Adicionar won_unit_price: valor comercial do produto principal da venda
ALTER TABLE public.sales_cycles
ADD COLUMN IF NOT EXISTS won_unit_price NUMERIC(12, 2);

-- Adicionar payment_method: meio de pagamento
-- Valores: credito, debito, pix, dinheiro, boleto, transferencia, misto, outro
ALTER TABLE public.sales_cycles
ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Adicionar payment_type: estrutura de negociação
-- Valores: avista, entrada_parcelas, parcelado_sem_entrada, recorrente, outro
ALTER TABLE public.sales_cycles
ADD COLUMN IF NOT EXISTS payment_type TEXT;

-- Adicionar entry_amount: valor de entrada (usado quando payment_type = entrada_parcelas)
ALTER TABLE public.sales_cycles
ADD COLUMN IF NOT EXISTS entry_amount NUMERIC(12, 2);

-- Adicionar installments_count: quantidade de parcelas
ALTER TABLE public.sales_cycles
ADD COLUMN IF NOT EXISTS installments_count INTEGER;

-- Adicionar installment_amount: valor de cada parcela
ALTER TABLE public.sales_cycles
ADD COLUMN IF NOT EXISTS installment_amount NUMERIC(12, 2);

-- Adicionar payment_notes: observação de pagamento (obrigatória quando payment_method = misto)
ALTER TABLE public.sales_cycles
ADD COLUMN IF NOT EXISTS payment_notes TEXT;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_sales_cycles_product_id
ON public.sales_cycles(product_id)
WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_cycles_payment_method
ON public.sales_cycles(payment_method)
WHERE payment_method IS NOT NULL;

-- Comentários descritivos
COMMENT ON COLUMN public.sales_cycles.product_id IS 'Produto principal vendido neste ciclo (referência ao catálogo)';
COMMENT ON COLUMN public.sales_cycles.won_unit_price IS 'Valor comercial do produto principal da venda';
COMMENT ON COLUMN public.sales_cycles.payment_method IS 'Meio de pagamento: credito, debito, pix, dinheiro, boleto, transferencia, misto, outro';
COMMENT ON COLUMN public.sales_cycles.payment_type IS 'Estrutura de negociação: avista, entrada_parcelas, parcelado_sem_entrada, recorrente, outro';
COMMENT ON COLUMN public.sales_cycles.entry_amount IS 'Valor de entrada quando payment_type = entrada_parcelas';
COMMENT ON COLUMN public.sales_cycles.installments_count IS 'Quantidade de parcelas';
COMMENT ON COLUMN public.sales_cycles.installment_amount IS 'Valor de cada parcela';
COMMENT ON COLUMN public.sales_cycles.payment_notes IS 'Observação de pagamento — obrigatória quando payment_method = misto';
