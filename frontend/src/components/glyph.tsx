export type GlyphKind = 'rose' | 'sun' | 'diamond' | 'beads' | 'ring' | 'flame'

type GlyphProps = {
  kind: GlyphKind
  size?: number
  color?: string
}

// Primitive geometric marks — circles, dots, diamonds, lines. They read as
// marks rather than illustration and pair with the oklch reaction palette.
export function Glyph({ kind, size = 12, color = 'currentColor' }: GlyphProps) {
  const s = size
  const c = color
  switch (kind) {
    case 'rose':
      return (
        <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="2.4" fill={c} />
          <circle cx="6" cy="6" r="5" fill="none" stroke={c} strokeWidth="0.8" opacity="0.45" />
        </svg>
      )
    case 'sun':
      return (
        <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="2.6" fill={c} />
          <g stroke={c} strokeWidth="0.9" strokeLinecap="round" opacity="0.7">
            <line x1="6" y1="0.5" x2="6" y2="2" />
            <line x1="6" y1="10" x2="6" y2="11.5" />
            <line x1="0.5" y1="6" x2="2" y2="6" />
            <line x1="10" y1="6" x2="11.5" y2="6" />
          </g>
        </svg>
      )
    case 'diamond':
      return (
        <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden="true">
          <rect x="3" y="3" width="6" height="6" transform="rotate(45 6 6)" fill={c} />
        </svg>
      )
    case 'beads':
      return (
        <svg width={s} height={s} viewBox="0 0 14 12" aria-hidden="true">
          <circle cx="2.5" cy="6" r="1.6" fill={c} />
          <circle cx="7" cy="6" r="2" fill={c} />
          <circle cx="11.5" cy="6" r="1.6" fill={c} />
        </svg>
      )
    case 'ring':
      return (
        <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="4" fill="none" stroke={c} strokeWidth="1.6" />
        </svg>
      )
    case 'flame':
      return (
        <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 1.2c1.6 1.8 3.4 3.4 3.4 5.8A3.4 3.4 0 0 1 6 10.8 3.4 3.4 0 0 1 2.6 7c0-1.4.8-2.4 1.6-3.3.3.7.8 1.1 1.3 1.3C5.2 3.7 5.2 2.4 6 1.2Z" fill={c} />
        </svg>
      )
    default:
      return null
  }
}
