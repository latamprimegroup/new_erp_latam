'use client'

import { useEffect } from 'react'

export function TrainingProtection() {
  useEffect(() => {
    const onContext = (e: MouseEvent) => e.preventDefault()
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const blockDevtools =
        key === 'f12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c', 's'].includes(key)) ||
        ((e.ctrlKey || e.metaKey) && key === 'u')
      if (blockDevtools) {
        e.preventDefault()
      }
    }
    document.addEventListener('contextmenu', onContext)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('contextmenu', onContext)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none z-[35]">
      <div className="absolute inset-0 bg-transparent" />
      {/* Overlay leve para dificultar captura automática. */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/5" />
    </div>
  )
}
