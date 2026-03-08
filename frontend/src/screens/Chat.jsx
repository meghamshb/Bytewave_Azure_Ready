import React, { useState, useEffect, useRef } from 'react'
import AppNav from '../components/AppNav'
import Skeleton from '../components/Skeleton'

export default function Chat() {
  const [iframeReady, setIframeReady] = useState(false)
  const [minElapsed, setMinElapsed] = useState(false)
  const loaded = iframeReady && minElapsed

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), 700)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppNav />
      <div style={{ flex: 1, position: 'relative' }}>
        {!loaded && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 2,
            padding: '32px 24px',
            display: 'flex', flexDirection: 'column', gap: 16,
            background: 'var(--primary-bg)',
            transition: 'opacity 0.3s ease',
          }}>
            <Skeleton height={48} borderRadius={14} style={{ maxWidth: 320 }} />
            <Skeleton height={120} borderRadius={14} />
            <Skeleton height={120} borderRadius={14} delay={0.1} />
            <Skeleton height={48} borderRadius={14} style={{ maxWidth: 400 }} delay={0.2} />
            <div style={{ marginTop: 'auto' }}>
              <Skeleton height={52} borderRadius={14} delay={0.3} />
            </div>
          </div>
        )}
        <iframe
          src="/physimate-chat.html"
          title="PhysiMate Chat"
          onLoad={() => setIframeReady(true)}
          style={{
            width: '100%', height: '100%',
            border: 'none', display: 'block',
          }}
        />
      </div>
    </div>
  )
}
