// Marca quadrada do grupo: a imagem quando existe, senão as iniciais sobre um
// tom oklch derivado do nome (mesma técnica do Avatar), para cada grupo ter
// uma cor estável sem guardar nada no banco.

type GroupMarkProps = {
  name: string
  imageUrl?: string | null
  size?: number
  className?: string
}

export function groupTone(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return ((hash % 360) + 360) % 360
}

export function GroupMark({ name, imageUrl, size = 44, className }: GroupMarkProps) {
  const tone = groupTone(name)
  const style = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.34),
    background: imageUrl ? undefined : `oklch(0.9 0.04 ${tone})`,
    color: imageUrl ? undefined : `oklch(0.36 0.08 ${tone})`
  } as const
  const merged = className ? `group-mark ${className}` : 'group-mark'

  return (
    <span className={merged} style={style} aria-hidden>
      {imageUrl ? (
        <img src={imageUrl} alt="" referrerPolicy="no-referrer" />
      ) : (
        name.slice(0, 2).toUpperCase()
      )}
    </span>
  )
}
