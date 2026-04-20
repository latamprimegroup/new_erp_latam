import { Suspense } from 'react'
import { ProductionG2Client } from './ProductionG2Client'

export default function ProducaoG2Page() {
  return (
    <Suspense fallback={null}>
      <ProductionG2Client />
    </Suspense>
  )
}
