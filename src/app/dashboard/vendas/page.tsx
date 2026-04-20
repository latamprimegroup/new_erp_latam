import { Suspense } from 'react'
import { VendasClient } from './VendasClient'

export default function VendasPage() {
  return (
    <Suspense fallback={<p className="text-gray-500 py-8">Carregando vendas...</p>}>
      <VendasClient />
    </Suspense>
  )
}
