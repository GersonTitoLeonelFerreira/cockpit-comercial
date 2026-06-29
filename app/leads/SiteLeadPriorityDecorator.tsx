'use client'

import * as React from 'react'

type SitePriorityLead = {
  id: string
  name: string
  phone: string | null
  email: string | null
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function onlyDigits(value: string | null) {
  return (value ?? '').replace(/\D/g, '')
}

function cardMatchesLead(card: HTMLElement, lead: SitePriorityLead) {
  const text = normalizeText(card.textContent ?? '')
  const name = normalizeText(lead.name)

  if (!name || !text.includes(name)) return false

  const phone = onlyDigits(lead.phone)
  if (phone) {
    return onlyDigits(card.textContent ?? '').includes(phone)
  }

  const email = normalizeText(lead.email ?? '')
  return Boolean(email && text.includes(email))
}

function applyPriorityHighlight(leads: SitePriorityLead[]) {
  const cards = Array.from(document.querySelectorAll<HTMLElement>('[draggable="true"]'))

  for (const card of cards) {
    // Remove o elemento inserido pela versão anterior. O selo passa a ser um
    // pseudo-elemento CSS para não ser apagado pelo React ao redesenhar o card.
    card.querySelector<HTMLElement>('[data-yolen-site-priority-badge="true"]')?.remove()

    const matchedLead = leads.find((lead) => cardMatchesLead(card, lead))

    if (!matchedLead) {
      card.removeAttribute('data-yolen-site-priority')
      continue
    }

    card.setAttribute('data-yolen-site-priority', 'true')
  }
}

export default function SiteLeadPriorityDecorator() {
  const leadsRef = React.useRef<SitePriorityLead[]>([])
  const frameRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    let cancelled = false

    const scheduleApply = () => {
      if (frameRef.current !== null) return

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        applyPriorityHighlight(leadsRef.current)
      })
    }

    const loadPriorities = async () => {
      try {
        const response = await fetch('/api/leads/site-priority', { cache: 'no-store' })
        const json = (await response.json().catch(() => ({}))) as {
          ok?: boolean
          leads?: SitePriorityLead[]
        }

        if (cancelled || !response.ok || !json.ok) return

        leadsRef.current = json.leads ?? []
        scheduleApply()
      } catch {
        // O Kanban continua operando normalmente mesmo se o indicador falhar.
      }
    }

    const observer = new MutationObserver(scheduleApply)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    void loadPriorities()
    const interval = window.setInterval(() => void loadPriorities(), 15000)

    return () => {
      cancelled = true
      observer.disconnect()
      window.clearInterval(interval)

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
    }
  }, [])

  return (
    <style>{`
      [data-yolen-site-priority="true"] {
        padding-top: 29px !important;
        border-top-color: rgba(245, 158, 11, 0.82) !important;
        background:
          linear-gradient(135deg, rgba(245, 158, 11, 0.10), rgba(20, 23, 34, 0) 58%),
          #141722 !important;
        box-shadow:
          0 0 0 1px rgba(245, 158, 11, 0.22),
          0 4px 14px rgba(245, 158, 11, 0.08) !important;
      }

      [data-yolen-site-priority="true"]::before {
        content: '⚡ LEAD DO SITE · PRIORIDADE';
        position: absolute;
        top: 7px;
        left: 8px;
        display: inline-flex;
        align-items: center;
        min-height: 15px;
        padding: 1px 6px;
        border: 1px solid rgba(245, 158, 11, 0.34);
        border-radius: 999px;
        background: rgba(245, 158, 11, 0.12);
        color: #fcd34d;
        font-size: 8px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: 0.045em;
        pointer-events: none;
        white-space: nowrap;
      }
    `}</style>
  )
}
