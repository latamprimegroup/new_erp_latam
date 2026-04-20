import type { Metadata } from 'next'
import { BaseClient } from './BaseClient'

export const metadata: Metadata = {
  title: 'Base — E-mails, CNPJs e perfis',
  description: 'Pulmão de dados para produção: Gmail, CNPJs Nutra e perfis de pagamento.',
}

export default function BasePage() {
  return <BaseClient />
}
