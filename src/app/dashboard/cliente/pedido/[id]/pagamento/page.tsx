'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

type Order = {
  id: string
  value: { toString: () => string }
  status: string
  product: string
  accountType: string
  quantity: number
  pixKey: string | null
  paymentDueAt: string | null
  createdAt: string
}

export default function PagamentoPedidoPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/cliente/compras')
      .then((r) => r.json())
      .then((orders: Order[]) => {
        const o = orders.find((x) => x.id === id)
        setOrder(o || null)
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <p className="text-gray-500 py-8">Carregando...</p>
  if (!order) {
    return (
      <div>
        <p className="text-red-600">Pedido não encontrado.</p>
        <Link href="/dashboard/cliente/compras" className="link-primary mt-4 inline-block">Minhas compras</Link>
      </div>
    )
  }

  if (order.status !== 'AWAITING_PAYMENT' && order.status !== 'PENDING') {
    return (
      <div>
        <p className="text-gray-600">Este pedido já foi pago ou está em outro status.</p>
        <Link href="/dashboard/cliente/compras" className="link-primary mt-4 inline-block">Minhas compras</Link>
      </div>
    )
  }

  const value = Number(order.value)
  const pixKey = order.pixKey || 'PIX_EM_CONFIGURACAO'

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/cliente/compras" className="text-gray-500 hover:text-gray-700">← Voltar</Link>
        <h1 className="text-2xl font-bold">Pagamento do pedido</h1>
      </div>

      <div className="card max-w-lg">
        <p className="text-sm text-gray-500 mb-2">Pedido #{id.slice(0, 8)}</p>
        <p className="text-2xl font-bold text-primary-600 mb-6">
          R$ {value.toLocaleString('pt-BR')}
        </p>
        <p className="text-sm text-gray-600 mb-4">
          {order.product} — {order.accountType} (x{order.quantity})
        </p>

        <div className="border border-primary-600/10 rounded-lg p-4 bg-gray-50 mb-4">
          <p className="text-sm font-medium text-[#1F2937] mb-2">Pague via PIX</p>
          <p className="text-xs text-gray-500 mb-2">Chave PIX (copie e cole no app do seu banco):</p>
          <p className="font-mono text-sm break-all select-all bg-white p-2 rounded border border-primary-600/10">
            {pixKey}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Valor exato: <strong>R$ {value.toLocaleString('pt-BR')}</strong>
          </p>
          <p className="text-xs text-amber-600 mt-2">
            Prazo para pagamento: 24 horas. Após o pagamento, a confirmação pode levar alguns minutos.
          </p>
        </div>

        <p className="text-sm text-gray-500">
          Após realizar o PIX, o status será atualizado automaticamente quando a integração estiver ativa.
          Em caso de dúvida, entre em contato pelo Suporte.
        </p>
      </div>
    </div>
  )
}
