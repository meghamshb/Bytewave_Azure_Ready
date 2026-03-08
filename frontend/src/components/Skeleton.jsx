export default function Skeleton({ height = 60, borderRadius = 12, delay = 0, style: extra = {} }) {
  return (
    <div
      className="bw-skeleton"
      style={{
        height,
        borderRadius,
        '--skel-delay': `${delay}s`,
        ...extra,
      }}
    />
  )
}
