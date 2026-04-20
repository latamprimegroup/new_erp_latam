'use client'

import { useCallback, useEffect, useState } from 'react'
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
  value: unknown
  status: string
  createdAt: string
}

function orderValue(o: Order): number {
  const v = o.value
  if (typeof v === 'number') return v
  if (typeof v === 'string') return Number(v)
  if (v != null && typeof v === 'object' && 'toString' in v) return Number(String(v))
  return 0
}

function downloadRecibo(o: Order) {
  const lines = [
    'ADS ATIVOS — Recibo resumido (informativo)',
    `Pedido: ${o.id}`,
    `Data: ${new Date(o.createdAt).toLocaleString('pt-BR')}`,
    `Status: ${STATUS[o.status] || o.status}`,
    `Produto: ${o.product}`,
    `Tipo de conta: ${o.accountType}`,
    `Quantidade: ${o.quantity}`,
    `Valor: R$ ${orderValue(o).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    '',
    'Este arquivo não substitui Nota Fiscal eletrônica (NF-e), quando aplicável.',
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `recibo-${o.id.slice(0, 8)}.txt`
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(url)
}

export default function MinhasComprasPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const q = new URLSearchParams()
    if (dateFrom) q.set('from', dateFrom)
    if (dateTo) q.set('to', dateTo)
    const qs = q.toString()
    const res = await fetch(qs ? `/api/cliente/compras?${qs}` : '/api/cliente/compras')
    const data = await res.json()
    if (res.ok && Array.isArray(data)) setOrders(data)
    else setOrders([])
    setLoading(false)
  }, [dateFrom, dateTo])

  useEffect(() => {
    load()
  }, [load])

  const hasDateFilter = Boolean(dateFrom || dateTo)

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
        {!loading && (
          <div className="flex flex-wrap gap-3 items-end mb-4 pb-4 border-b border-gray-100">
            <div>
              <label className="block text-xs text-gray-500 mb-1">De</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Até</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input-field"
              />
            </div>
            {hasDateFilter && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom('')
                  setDateTo('')
                }}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Limpar período
              </button>
            )}
          </div>
        )}

        {loading ? (
          <p className="text-gray-500 py-8">Carregando...</p>
        ) : orders.length === 0 && !hasDateFilter ? (
          <div className="py-8 space-y-4">
            <p className="text-gray-400">Você ainda não realizou nenhuma compra.</p>
            <Link href="/dashboard/cliente/pesquisar" className="btn-primary inline-block text-center">
              Fazer minha primeira compra agora
            </Link>
          </div>
        ) : orders.length === 0 && hasDateFilter ? (
          <p className="text-gray-400 py-8">Nenhuma compra neste período.</p>
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
                  <th className="pb-2 pr-4">Recibo</th>
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
                    <td className="py-3 pr-4">R$ {orderValue(o).toLocaleString('pt-BR')}</td>
                    <td className="py-3 pr-4 space-y-1">
                      {(o.status === 'AWAITING_PAYMENT' || o.status === 'PENDING') && (
                        <Link href={`/dashboard/cliente/pedido/${o.id}/pagamento`} className="link-primary text-xs block">
                          Pagar PIX
                        </Link>
                      )}
                      {o.status === 'DELIVERED' && (
                        <Link
                          href={`/dashboard/cliente/solicitar?reorder=${o.id}`}
                          className="link-primary text-xs block"
                        >
                          Comprar novamente este lote
                        </Link>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <button
                        type="button"
                        onClick={() => downloadRecibo(o)}
                        className="link-primary text-xs"
                      >
                        Baixar .txt
                      </button>
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
