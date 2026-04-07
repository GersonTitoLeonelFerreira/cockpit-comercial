import React from 'react'

type IconProps = {
  size?: number | string
  color?: string
  style?: React.CSSProperties
  className?: string
}

const defaultProps = (props: IconProps) => ({
  width: props.size ?? '1em',
  height: props.size ?? '1em',
  color: props.color ?? 'currentColor',
  style: props.style,
  className: props.className,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: props.color ?? 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export function IconCircleX(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  )
}

export function IconCircleCheck(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  )
}

export function IconLoader(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg
      {...p}
      aria-hidden="true"
      className={['animate-spin', props.className].filter(Boolean).join(' ')}
      style={props.style}
    >
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  )
}

export function IconX(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function IconWhatsApp(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true" fill={p.color} stroke="none">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.946 7.946 0 01-4.046-1.102l-.29-.173-3.005.893.893-3.005-.173-.29A7.946 7.946 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z" />
    </svg>
  )
}

export function IconClipboard(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <rect x="9" y="2" width="6" height="4" rx="1" ry="1" />
      <path d="M17 4h1a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h1" />
    </svg>
  )
}

export function IconPencil(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

export function IconArrowRightCircle(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 16 16 12 12 8" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  )
}

export function IconClock(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

export function IconAlertTriangle(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

export function IconHistory(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

export function IconLink(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

export function IconZap(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

export function IconCalendar(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

export function IconArrowRight(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

export function IconUser(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

export function IconLightbulb(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 01-1 1H9a1 1 0 01-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z" />
    </svg>
  )
}

export function IconTarget(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  )
}

export function IconBrain(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <path d="M9.5 2A2.5 2.5 0 007 4.5v.193A3.5 3.5 0 004 8a3.5 3.5 0 001.5 2.875A2.5 2.5 0 007 13.5V14a5 5 0 0010 0v-.5a2.5 2.5 0 001.5-2.625A3.5 3.5 0 0020 8a3.5 3.5 0 00-3-3.457V4.5A2.5 2.5 0 0014.5 2h-5z" />
      <line x1="12" y1="6" x2="12" y2="14" />
      <line x1="9" y1="9" x2="15" y2="9" />
    </svg>
  )
}

export function IconPhone(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  )
}

export function IconPin(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24z" />
    </svg>
  )
}

export function IconTrophy(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <polyline points="14.5 17 14.5 22 9.5 22 9.5 17" />
      <line x1="7" y1="22" x2="17" y2="22" />
      <path d="M5 9H3a1 1 0 01-1-1V7a1 1 0 011-1h2" />
      <path d="M19 9h2a1 1 0 001-1V7a1 1 0 00-1-1h-2" />
      <path d="M5 6h14v5a7 7 0 01-14 0z" />
    </svg>
  )
}

export function IconRefreshCw(props: IconProps) {
  const p = defaultProps(props)
  return (
    <svg {...p} aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  )
}
