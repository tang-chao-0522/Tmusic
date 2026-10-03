export function TrackArtwork({ palette, coverUrl, className = '' }: { palette: [string, string]; coverUrl?: string | null; className?: string }) {
  return (
    <span
      className={`track-artwork ${className}`}
      style={{ '--art-a': palette[0], '--art-b': palette[1] } as React.CSSProperties}
      aria-hidden="true"
    >
      {coverUrl ? <img src={coverUrl} alt="" /> : null}
      <span className="art-moon" />
      <span className="art-horizon" />
    </span>
  )
}
