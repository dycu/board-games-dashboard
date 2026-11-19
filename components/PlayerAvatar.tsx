'use client'
import { useState } from 'react'

// Same "hide on failure" behavior as GameCard's own avatar — a kept-apart
// copy rather than a shared import, since GameCard renders this inline
// with its own sizing/spacing and the two aren't meant to stay identical.
export default function PlayerAvatar({ url, size = 16 }: { url?: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (!url || broken) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external platform CDN, not configured for next/image
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      onError={() => setBroken(true)}
      className="inline-block rounded-full object-cover shrink-0"
      style={{ width: size, height: size }}
    />
  )
}
