import { Suspense } from 'react'
import { SaquesClient } from './SaquesClient'

export default function SaquesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted">Carregando…</div>}>
      <SaquesClient />
    </Suspense>
  )
}
