type CrestProps = {
  size?: number
  className?: string
  alt?: string
}

const sources = [
  { max: 40, src: '/brand/aowdee-logo-64.png' },
  { max: 120, src: '/brand/aowdee-logo-168.png' },
  { max: 299, src: '/brand/aowdee-logo-420.png' },
  { max: Number.POSITIVE_INFINITY, src: '/brand/aowdee-logo-840.png' },
] as const

export function Crest({ size = 64, className = '', alt = 'ตรา AOWDEE' }: CrestProps) {
  const src = sources.find((entry) => size <= entry.max)?.src ?? '/brand/aowdee-logo-840.png'

  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={alt}
      className={className}
      loading={size > 120 ? 'eager' : 'lazy'}
      decoding="async"
    />
  )
}
