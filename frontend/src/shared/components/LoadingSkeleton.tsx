import React from 'react'

function SkeletonCard({ lines }: { lines: string[] }) {
  return (
    <div className="nv-skeleton" aria-hidden="true">
      {lines.map((cls, i) => (
        <div key={i} className={`nv-skel-line ${cls}`} />
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <div className="nv-skel-line nv-skel-line--tag" />
        <div className="nv-skel-line nv-skel-line--tag" />
      </div>
    </div>
  )
}

/**
 * Animated placeholder shown while notes are loading.
 * aria-busy on the region tells screen readers to expect new content.
 */
export default function LoadingSkeleton() {
  return (
    <div
      className="nv-skeletons"
      aria-busy="true"
      aria-label="Loading your notes"
    >
      <SkeletonCard lines={['nv-skel-line--title', 'nv-skel-line--full', 'nv-skel-line--long']} />
      <SkeletonCard lines={['nv-skel-line--title', 'nv-skel-line--full', 'nv-skel-line--med', 'nv-skel-line--long']} />
      <SkeletonCard lines={['nv-skel-line--title', 'nv-skel-line--long']} />
    </div>
  )
}

