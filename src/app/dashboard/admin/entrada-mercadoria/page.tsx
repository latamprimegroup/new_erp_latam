import { Metadata } from 'next'
import EntradaMercadoriaClient from './EntradaMercadoriaClient'

export const metadata: Metadata = {
  title: 'Entrada de Mercadoria | ERP ADS Ativos',
}

export default function EntradaMercadoriaPage() {
  return (
    <div className="p-4 md:p-6 max-w-screen-xl mx-auto">
      <EntradaMercadoriaClient />
    </div>
  )
}
