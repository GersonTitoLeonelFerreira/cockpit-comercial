        {/* Teoria 100/20 — Planejamento Operacional */}
        {mode === 'faturamento' && (
          <Section
            title={
              <TitleWithTip
                label="📊 Teoria 100/20 — Plano de Execução Comercial"
                tipTitle="O que é a Teoria 100/20?"
                width={520}
              >
                <div style={{ display: 'grid', gap: 8 }}>
                  <div>A Teoria 100/20 parte da sua meta de faturamento e calcula o <strong>plano mínimo de execução</strong> necessário.</div>
                  <div>Se você executar 100% do plano operacional calculado, o resultado mínimo garantido é de pelo menos 20% da meta.</div>
                  <div><strong>Como funciona:</strong></div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    <li>Sua meta de faturamento ÷ ticket médio = vendas necessárias</li>
                    <li>Vendas necessárias ÷ taxa de conversão = ciclos de trabalho</li>
                    <li>Ciclos de trabalho ÷ dias úteis = esforço diário</li>
                  </ul>
                </div>
              </TitleWithTip>
            }
            description="Traduz sua meta financeira em esforço comercial diário"
          >
            {/* Ticket Médio input */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, opacity: 0.75, display: 'block', marginBottom: 4 }}>
                Ticket Médio (R$) — valor médio por venda
              </label>
              <input
                type="text"
                value={ticketMedioText}
                onChange={(e) => setTicketMedioText(e.target.value)}
                style={{
                  background: '#1a1a1a',
                  border: '1px solid #333',
                  borderRadius: 8,
                  padding: '8px 12px',
                  color: '#fff',
                  fontSize: 14,
                  width: 180,
                }}
                placeholder="Ex: 5000"
              />
            </div>

            {/* Results grid */}
            {theory10020Result && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <Card
                  title="Sua Meta de Faturamento"
                  value={toBRL(theory10020Result.meta_total)}
                  subtitle="Meta informada acima — base de todo o cálculo"
                />
                <Card
                  title={
                    <TitleWithTip label="Garantia Mínima (20%)" tipTitle="Garantia Mínima">
                      Se 100% do plano operacional abaixo for executado, esse é o faturamento mínimo garantido pela Teoria 100/20.
                    </TitleWithTip>
                  }
                  value={toBRL(theory10020Result.garantia_minima)}
                  subtitle="Piso de resultado se o plano for executado integralmente"
                  tone="neutral"
                />
                <Card
                  title="Ticket Médio Informado"
                  value={toBRL(theory10020Result.ticket_medio)}
                  subtitle="Valor médio por venda usado no cálculo"
                />
                <Card
                  title={
                    <TitleWithTip label="Vendas Necessárias (total)" tipTitle="Vendas Necessárias">
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div>Quantas vendas o plano exige para cobrir a meta inteira.</div>
                        <div><strong>Fórmula:</strong> meta ÷ ticket médio</div>
                      </div>
                    </TitleWithTip>
                  }
                  value={theory10020Result.vendas_necessarias}
                  subtitle={theory10020Result.meta_atingida
                    ? 'Meta já atingida'
                    : `Faltam ${theory10020Result.vendas_restantes} vendas para fechar o gap`}
                  tone={theory10020Result.meta_atingida ? 'good' : 'neutral'}
                />
                <Card
                  title={
                    <TitleWithTip label="Ciclos de Trabalho (total)" tipTitle="Ciclos de Trabalho">
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div>Quantos leads precisam ser trabalhados para gerar as vendas necessárias, considerando a taxa de conversão atual.</div>
                        <div><strong>Fórmula:</strong> vendas necessárias ÷ taxa de conversão</div>
                      </div>
                    </TitleWithTip>
                  }
                  value={theory10020Result.ciclos_trabalhados_necessarios}
                  subtitle={theory10020Result.meta_atingida
                    ? 'Meta já atingida'
                    : `Faltam ${theory10020Result.ciclos_restantes} ciclos para fechar o gap`}
                  tone={theory10020Result.meta_atingida ? 'good' : 'neutral'}
                />
                <Card
                  title={
                    <TitleWithTip label="Esforço Diário (ciclos/dia)" tipTitle="Esforço Diário">
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div>Quantos ciclos precisam ser trabalhados por dia útil restante para fechar o gap entre o realizado e a meta.</div>
                        <div><strong>Fórmula:</strong> ciclos restantes ÷ dias úteis restantes</div>
                        <div>Se a meta já foi atingida, o esforço diário é zero.</div>
                      </div>
                    </TitleWithTip>
                  }
                  value={theory10020Result.meta_atingida ? 0 : theory10020Result.ciclos_restantes_por_dia}
                  subtitle={`${theory10020Result.remaining_business_days} dias úteis restantes`}
                  tone={theory10020Result.meta_atingida ? 'good' : theory10020Result.ciclos_restantes_por_dia > 10 ? 'bad' : 'neutral'}
                />
              </div>
            )}

            {/* Progresso — banner contextual */}
            {theory10020Result?.meta_atingida && (
              <div style={{
                marginTop: 12,
                padding: '10px 14px',
                background: '#07140c',
                border: '1px solid #1f5f3a',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
              }}>
                ✅ Faturamento real ({toBRL(theory10020Result.total_real)}) já atingiu a meta de {toBRL(theory10020Result.meta_total)}. O plano operacional está cumprido.
              </div>
            )}

            {theory10020Result && !theory10020Result.meta_atingida && theory10020Result.meta_total > 0 && theory10020Result.ticket_medio > 0 && (
              <div style={{
                marginTop: 12,
                padding: '10px 14px',
                background: '#0c0c14',
                border: '1px solid #2a2a4a',
                borderRadius: 10,
                fontSize: 12,
                opacity: 0.85,
                lineHeight: 1.5,
              }}>
                Gap atual: <strong>{toBRL(theory10020Result.gap)}</strong> — faltam <strong>{theory10020Result.vendas_restantes}</strong> vendas e <strong>{theory10020Result.ciclos_restantes}</strong> ciclos de trabalho.
                {theory10020Result.remaining_business_days > 0
                  ? ` Ritmo necessário: ${theory10020Result.ciclos_restantes_por_dia} ciclos/dia nos próximos ${theory10020Result.remaining_business_days} dias úteis.`
                  : ' Sem dias úteis restantes no período.'}
              </div>
            )}

            {/* Warning when ticket_medio is zero */}
            {theory10020Result && theory10020Result.ticket_medio === 0 && (
              <div style={{
                marginTop: 12,
                padding: '10px 14px',
                background: '#140707',
                border: '1px solid #5f1f1f',
                borderRadius: 10,
                fontSize: 13,
                opacity: 0.9,
              }}>
                ⚠️ Informe um ticket médio válido para calcular vendas e ciclos necessários.
              </div>
            )}
          </Section>
        )