'use client'

import Link from 'next/link'
import { ProductionFeedback } from '@/components/producao/ProductionFeedback'

export default function SugestoesFeedbackPage() {
  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard" className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
          ← Dashboard
        </Link>
        <h1 className="heading-1">Sugestões de Melhoria</h1>
      </div>

      <div className="card">
        <ProductionFeedback />
      </div>
    </div>
  )
}
