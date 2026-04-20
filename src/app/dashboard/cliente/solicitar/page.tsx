'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

type LastPurchase = {
  id: string
  product: string
  accountType: string
  quantity: number
  value: number
  country: string | null
  paidAt: string | null
}

type Solicitation = {
  id: string
  quantity: number
  product: string
  accountType: string
  status: string
  createdAt: string
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
}

function SolicitarContasContent() {
  const searchParams = useSearchParams()
  const [lastPurchase, setLastPurchase] = useState<LastPurchase | null>(null)
  const [solicitations, setSolicitations] = useState<Solicitation[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'ultima' | 'quantidade'>('ultima')
  const [reorderSourceOrderId, setReorderSourceOrderId] = useState<string | null>(null)
  const [form, setForm] = useState({
    quantity: 1,
    product: '',
    accountType: '',
    country: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/cliente/ultima-compra').then((r) => r.json()),
      fetch('/api/cliente/solicitacao').then((r) => r.json()),
    ])
      .then(async ([ultima, sols]) => {
        setLastPurchase(ultima.lastPurchase)
        setSolicitations(Array.isArray(sols) ? sols : [])

        const reorderId = searchParams.get('reorder')
        if (reorderId) {
          const r = await fetch(`/api/cliente/compras/${reorderId}`)
          const data = await r.json()
          if (r.ok && data?.id) {
            setReorderSourceOrderId(data.id)
            setMode('quantidade')
            setForm((f) => ({
              ...f,
              quantity: data.quantity,
              product: data.product,
              accountType: data.accountType,
              country: data.country || '',
              notes: `Recompra do pedido (${String(data.id).slice(0, 8)}…)`,
            }))
            return
          }
        }

        if (ultima.lastPurchase) {
          setMode('ultima')
          setForm((f) => ({
            ...f,
            quantity: ultima.lastPurchase.quantity,
            product: ultima.lastPurchase.product,
            accountType: ultima.lastPurchase.accountType,
            country: ultima.lastPurchase.country || '',
          }))
        } else {
          setMode('quantidade')
        }
      })
      .finally(() => setLoading(false))
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent, referenceOrderId?: string) {
    e.preventDefault()
    if (mode === 'ultima' && !lastPurchase) {
      alert('Você ainda não possui compras anteriores. Use "Quantidade desejada".')
      return
    }
    setSubmitting(true)
    setWhatsappUrl(null)
    try {
      const res = await fetch('/api/cliente/solicitacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: form.quantity,
          product: form.product,
          accountType: form.accountType,
          country: form.country || undefined,
          notes: form.notes || undefined,
          referenceOrderId,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setSolicitations((prev) => [data.solicitation, ...prev])
        setWhatsappUrl(data.whatsappUrl)
        setReorderSourceOrderId(null)
        setForm((f) => ({ ...f, notes: '' }))
        if (typeof data.whatsappUrl === 'string' && data.whatsappUrl.length > 0) {
          window.open(data.whatsappUrl, '_blank', 'noopener,noreferrer')
        }
      } else {
        alert(data.error || 'Erro ao solicitar')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div>
        <Link href="/dashboard/cliente" className="text-gray-500 hover:text-gray-700 mb-4 inline-block">← Voltar</Link>
        <p className="text-gray-500">Carregando...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex gap-4 items-center mb-6">
        <Link href="/dashboard/cliente" className="text-gray-500 hover:text-gray-700">← Voltar</Link>
        <h1 className="heading-1">Solicitar Novas Contas</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-semibold mb-4">Como deseja solicitar?</h2>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMode('ultima')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'ultima' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Repetir última compra
            </button>
            <button
              onClick={() => setMode('quantidade')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'quantidade' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Quantidade desejada
            </button>
          </div>

          {lastPurchase && mode === 'ultima' && (
            <div className="p-4 bg-gray-50 rounded-lg mb-4">
              <p className="text-sm text-gray-500 mb-2">Sua última compra:</p>
              <p className="font-medium">
                {lastPurchase.quantity} conta(s) — {lastPurchase.product} ({lastPurchase.accountType})
              </p>
              <p className="text-sm text-gray-500 mt-1">
                R$ {lastPurchase.value.toLocaleString('pt-BR')} • {lastPurchase.paidAt ? new Date(lastPurchase.paidAt).toLocaleDateString('pt-BR') : ''}
              </p>
            </div>
          )}

          {!lastPurchase && mode === 'ultima' && (
            <p className="text-amber-600 text-sm mb-4">Você ainda não possui compras anteriores. Use "Quantidade desejada".</p>
          )}

          <form
            onSubmit={(e) => {
              const refId =
                mode === 'ultima' && lastPurchase
                  ? lastPurchase.id
                  : reorderSourceOrderId || undefined
              handleSubmit(e, refId)
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium mb-1">Quantidade *</label>
              <input
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: parseInt(e.target.value, 10) || 1 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Produto *</label>
              <input
                type="text"
                value={form.product}
                onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
                className="input-field"
                placeholder="Ex: Conta Google Ads"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tipo de conta *</label>
              <input
                type="text"
                value={form.accountType}
                onChange={(e) => setForm((f) => ({ ...f, accountType: e.target.value }))}
                className="input-field"
                placeholder="Ex: Ads USD, BRL"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">País</label>
              <input
                type="text"
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                className="input-field"
                placeholder="Ex: Brasil"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Observações</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="input-field min-h-[80px]"
                placeholder="Detalhes adicionais..."
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? 'Enviando...' : 'Solicitar e enviar WhatsApp'}
              </button>
            </div>
            {whatsappUrl && (
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-sm text-green-800 mb-2">Solicitação registrada!</p>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 font-medium hover:underline"
                >
                  Abrir WhatsApp para falar com o comercial →
                </a>
              </div>
            )}
          </form>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-4">Minhas solicitações</h2>
          {solicitations.length === 0 ? (
            <p className="text-gray-500">Nenhuma solicitação ainda.</p>
          ) : (
            <div className="space-y-3">
              {solicitations.map((s) => (
                <div key={s.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{s.quantity} conta(s) — {s.product} ({s.accountType})</p>
                      <p className="text-xs text-gray-500">
                        {new Date(s.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      s.status === 'completed' ? 'bg-green-100 text-green-800' :
                      s.status === 'in_progress' ? 'bg-amber-100 text-amber-800' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {STATUS_LABELS[s.status] || s.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SolicitarContasPage() {
  return (
    <Suspense
      fallback={
        <div>
          <Link href="/dashboard/cliente" className="text-gray-500 hover:text-gray-700 mb-4 inline-block">
            ← Voltar
          </Link>
          <p className="text-gray-500">Carregando...</p>
        </div>
      }
    >
      <SolicitarContasContent />
    </Suspense>
  )
}
