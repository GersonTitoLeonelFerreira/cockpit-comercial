import {
  IconArrowRight,
  IconBrain,
  IconCircleCheck,
  IconTarget,
  IconZap,
} from '../icons/UiIcons'
import styles from './ProductStoryVisuals.module.css'

function WindowHeader({ label }: { label: string }) {
  return (
    <div className={styles.windowHeader}>
      <span className={styles.windowDots} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>{label}</span>
      <span className={styles.liveBadge}>Em acompanhamento</span>
    </div>
  )
}

export function IntelligenceHeroVisual({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`${styles.visualShell} ${compact ? styles.visualCompact : ''}`}
      role="img"
      aria-label="Representação do Yolen conectando conversa, inteligência comercial, próxima ação e meta"
    >
      <WindowHeader label="Inteligência Yolen" />

      <div className={styles.heroCanvas}>
        <section className={styles.conversationPanel}>
          <span className={styles.panelKicker}>Conversa em análise</span>
          <div className={styles.messageCustomer}>
            Quero entender qual opção faz mais sentido para mim.
          </div>
          <div className={styles.messageSeller}>
            Claro. O que é mais importante para você neste momento?
          </div>
          <div className={styles.messageCustomer}>
            Preciso avaliar com meu sócio antes de decidir.
          </div>
          <div className={styles.contextLine}>
            <span /> Contexto preservado na oportunidade
          </div>
        </section>

        <section className={styles.intelligencePanel}>
          <div className={styles.aiOrb} aria-hidden="true">
            <IconBrain size={24} />
          </div>
          <div>
            <span className={styles.panelKicker}>Leitura comercial</span>
            <strong>O Copiloto entendeu o momento da venda</strong>
          </div>
          <div className={styles.signalGrid}>
            <span>Interesse identificado</span>
            <span>Decisor adicional</span>
            <span>Próximo passo necessário</span>
          </div>
          <div className={styles.confidenceRow}>
            <span>Confiança da análise</span>
            <strong>Alta</strong>
          </div>
        </section>

        <section className={styles.actionPanel}>
          <span className={styles.panelKicker}>Melhor próxima abordagem</span>
          <strong>Avance com contexto, não com uma mensagem genérica.</strong>
          <p>Retome a necessidade, envolva o decisor e combine um próximo compromisso.</p>
          <div className={styles.suggestedAction}>
            <IconZap size={15} />
            Próxima ação sugerida
            <IconArrowRight size={14} />
          </div>
          <div className={styles.humanReview}>
            <IconCircleCheck size={15} />
            O vendedor revisa antes de aplicar
          </div>
        </section>
      </div>

      <div className={styles.heroMetrics}>
        <div>
          <span>Meta do período</span>
          <strong>64%</strong>
          <i><b style={{ width: '64%' }} /></i>
        </div>
        <div>
          <span>Ritmo necessário</span>
          <strong>R$ 6.785/dia</strong>
        </div>
        <div>
          <span>Leitura gerencial</span>
          <strong className={styles.positive}>No ritmo</strong>
        </div>
      </div>
    </div>
  )
}

export function CopilotStoryVisual() {
  return (
    <div className={styles.storyVisual} role="img" aria-label="Benefícios da análise comercial do Copiloto Yolen">
      <div className={styles.storyTopline}>
        <span><IconBrain size={17} /> Copiloto Comercial</span>
        <em>Disponível</em>
      </div>
      <div className={styles.coachingSummary}>
        <span>Leitura da conversa</span>
        <strong>O cliente demonstrou interesse, mas ainda precisa envolver outro decisor.</strong>
      </div>
      <div className={styles.coachingColumns}>
        <div>
          <span>O que foi bem conduzido</span>
          <strong>Diagnóstico da necessidade</strong>
        </div>
        <div>
          <span>O que pode melhorar</span>
          <strong>Confirmar prazo de decisão</strong>
        </div>
      </div>
      <div className={styles.messageSuggestion}>
        <span>Mensagem sugerida</span>
        <p>“Posso organizar as opções para vocês compararem juntos. Quando conseguimos retomar?”</p>
      </div>
      <div className={styles.storyFooter}>
        <span>Resumo</span><span>Objeções</span><span>Próxima abordagem</span><span>Coaching</span>
      </div>
    </div>
  )
}

export function GoalStoryVisual() {
  return (
    <div className={styles.storyVisual} role="img" aria-label="Simulador Yolen transformando meta financeira em plano de execução">
      <div className={styles.storyTopline}>
        <span><IconTarget size={17} /> Plano executivo da meta</span>
        <em className={styles.attentionBadge}>Ritmo exige atenção</em>
      </div>
      <div className={styles.goalNumbers}>
        <div><span>Meta</span><strong>R$ 245.000</strong></div>
        <div><span>Realizado</span><strong>R$ 156.794</strong></div>
        <div><span>Gap</span><strong>R$ 88.206</strong></div>
      </div>
      <div className={styles.goalProgress}>
        <div><span>Progresso financeiro</span><strong>64%</strong></div>
        <i><b style={{ width: '64%' }} /></i>
      </div>
      <div className={styles.goalAction}>
        <div><span>Oportunidades por dia útil</span><strong>18</strong></div>
        <div><span>Vendas estimadas por dia</span><strong>3,6</strong></div>
        <div><span>Dias de execução</span><strong>13</strong></div>
      </div>
      <div className={styles.decisionCard}>
        <IconZap size={16} />
        <p><strong>Decisão recomendada:</strong> priorizar oportunidades com maior probabilidade e remover gargalos diariamente.</p>
      </div>
    </div>
  )
}

export function ManagementStoryVisual() {
  return (
    <div className={styles.storyVisual} role="img" aria-label="Gestão Yolen conectando faturamento, produtos e inteligência gerencial">
      <div className={styles.storyTopline}>
        <span><IconTarget size={17} /> Resultado e inteligência gerencial</span>
        <em>Período atual</em>
      </div>
      <div className={styles.revenueTotal}>
        <span>Faturamento acompanhado</span>
        <strong>R$ 156.793,85</strong>
        <small>Vendas registradas por produto, vendedor e dia</small>
      </div>
      <div className={styles.productBars}>
        <div><span>Plano Premium</span><i><b style={{ width: '82%' }} /></i><strong>42%</strong></div>
        <div><span>Plano Anual</span><i><b style={{ width: '61%' }} /></i><strong>31%</strong></div>
        <div><span>Upgrade</span><i><b style={{ width: '34%' }} /></i><strong>17%</strong></div>
      </div>
      <div className={styles.insightRow}>
        <div><span>Principal atenção</span><strong>Negociações sem próxima ação</strong></div>
        <div><span>Melhor alavanca</span><strong>Follow-up com compromisso definido</strong></div>
      </div>
    </div>
  )
}
