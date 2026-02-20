'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const STATUS: Record<string, string> = {
  QUOTE: 'Cotação',
  AWAITING_PAYMENT: 'Aguardando pagamento',
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  PAID: 'Pago',
  IN_SEPARATION: 'Em separação',
  IN_DELIVERY: 'Em entrega',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
}

type Order = {
  id: string
  product: string
  accountType: string
  quantity: number
  value: { toString: () => string }
  status: string
  createdAt: string
}

export default function MinhasComprasPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/cliente/compras')
      .then((r) => r.json())
      .then(setOrders)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/cliente" className="text-gray-500 hover:text-gray-700">
          ← Voltar
        </Link>
        <h1 className="heading-1">
          Minhas Compras
        </h1>
      </div>

      <div className="card">
        {loading ? (
          <p className="text-gray-500 py-8">Carregando...</p>
        ) : orders.length === 0 ? (
          <p className="text-gray-400 py-8">Você ainda não realizou nenhuma compra.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">Data</th>
                  <th className="pb-2 pr-4">Produto</th>
                  <th className="pb-2 pr-4">Tipo</th>
                  <th className="pb-2 pr-4">Qtd</th>
                  <th className="pb-2 pr-4">Valor</th>
                  <th className="pb-2 pr-4">Ação</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4">{new Date(o.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className="py-3 pr-4">{o.product}</td>
                    <td className="py-3 pr-4">{o.accountType}</td>
                    <td className="py-3 pr-4">{o.quantity}</td>
                    <td className="py-3 pr-4">R$ {Number(o.value).toLocaleString('pt-BR')}</td>
                    <td className="py-3 pr-4">
                      {(o.status === 'AWAITING_PAYMENT' || o.status === 'PENDING') && (
                        <Link href={`/dashboard/cliente/pedido/${o.id}/pagamento`} className="link-primary text-xs">
                          Pagar PIX
                        </Link>
                      )}
                    </td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          o.status === 'DELIVERED' ? 'bg-green-100 text-green-800' :
                          o.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                          'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {STATUS[o.status] || o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
