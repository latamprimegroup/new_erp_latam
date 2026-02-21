'use client'

import { useState, useEffect } from 'react'
import { PlugPlayDashboard } from './PlugPlayDashboard'

const STEP_LABELS: Record<string, string> = {
  AQUECIMENTO_G2: 'Aquecimento G2',
  DOMINIO_NICHO: 'Domínio por nicho',
  AQUECIMENTO_CONTA: 'Aquecimento de conta',
  CLOAKER: 'Configuração cloaker',
  PAGINA_WHITE: 'Página white',
  PAGINA_BLACK: 'Página black',
  YOUTUBE_CANAL: 'Canal YouTube isolado',
  CRIATIVO_BLACK: 'Subir criativo black',
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  EM_AQUECIMENTO: 'Em aquecimento',
  EM_CONFIG: 'Em configuração',
  LIVE: 'No ar',
  SURVIVED_24H: 'Sobreviveu 24h',
  BANNED: 'Banida',
}

type Step = { id: string; stepType: string; status: string; completedAt: string | null; notes: string | null }
type Operation = {
  id: string
  niche: string
  domain: string | null
  status: string
  wentLiveAt: string | null
  bannedAt: string | null
  notes: string | null
  createdAt: string
  steps: Step[]
  payment?: { id: string; amount: { toString: () => string }; status: string; paidAt: string | null }
}

export function PlugPlayClient({ isAdmin = false }: { isAdmin?: boolean }) {
  const [operations, setOperations] = useState<Operation[]>([])
  const [payments, setPayments] = useState<{ payments: unknown[]; summary: { totalPending: number; totalPaid: number } } | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ niche: '', domain: '' })
  const [submitting, setSubmitting] = useState(false)
  const [selectedOp, setSelectedOp] = useState<Operation | null>(null)
  const [updatingStep, setUpdatingStep] = useState<string | null>(null)

  function load() {
    Promise.all([
      fetch('/api/black/operations'),
      fetch('/api/black/payments'),
    ]).then(([r1, r2]) => {
      r1.json().then(setOperations)
      r2.json().then(setPayments)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/black/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche: form.niche, domain: form.domain || undefined }),
      })
      if (res.ok) {
        setForm({ niche: '', domain: '' })
        setShowForm(false)
        load()
      } else {
        const err = await res.json()
        alert(err.error || 'Erro')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleStepComplete(opId: string, stepType: string) {
    setUpdatingStep(stepType)
    try {
      const res = await fetch(`/api/black/operations/${opId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepType, status: 'DONE' }),
      })
      if (res.ok) load()
    } finally {
      setUpdatingStep(null)
    }
  }

  async function handleMarkBanned(opId: string) {
    if (!confirm('Marcar esta operação como banida?')) return
    const res = await fetch(`/api/black/operations/${opId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'BANNED', bannedAt: new Date().toISOString() }),
    })
    if (res.ok) load()
  }

  if (loading) return <p className="text-gray-500 py-8">Carregando...</p>

  return (
    <div className="mt-8 space-y-8">
      <section>
        <h2 className="heading-2 mb-4">Indicadores</h2>
        <PlugPlayDashboard isAdmin={isAdmin} />
      </section>

      <section className="pt-8">
        <h2 className="heading-2 mb-4">{isAdmin ? 'Operações' : 'Minhas operações'}</h2>
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <span className="font-medium text-gray-700">Lista de operações</span>
            <button onClick={() => setShowForm(!showForm)} className="btn-primary">
              {showForm ? 'Cancelar' : 'Nova operação'}
            </button>
          </div>

        {showForm && (
          <form onSubmit={handleCreate} className="p-4 bg-gray-50 rounded-lg mb-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Nicho *</label>
                <input
                  type="text"
                  value={form.niche}
                  onChange={(e) => setForm((f) => ({ ...f, niche: e.target.value }))}
                  className="input-field"
                  placeholder="Ex: Nutra, E-commerce"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Domínio</label>
                <input
                  type="text"
                  value={form.domain}
                  onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
                  className="input-field"
                  placeholder="dominio.com"
                />
              </div>
            </div>
            <button type="submit" disabled={submitting} className="btn-primary">Criar</button>
          </form>
        )}

        {operations.length === 0 ? (
          <p className="text-gray-500 py-6">Nenhuma operação. Clique em Nova operação.</p>
        ) : (
          <div className="space-y-4">
            {operations.map((op) => (
              <div
                key={op.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-primary-600/20"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-medium">{op.niche}</span>
                    {op.domain && <span className="text-gray-500 text-sm ml-2">• {op.domain}</span>}
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                      op.status === 'LIVE' ? 'bg-green-100 text-green-800' :
                      op.status === 'SURVIVED_24H' ? 'bg-blue-100 text-blue-800' :
                      op.status === 'BANNED' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100'
                    }`}>
                      {STATUS_LABELS[op.status] || op.status}
                    </span>
                    {op.wentLiveAt && (
                      <p className="text-xs text-gray-500 mt-1">
                        No ar desde {new Date(op.wentLiveAt).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                  {op.status === 'LIVE' && (
                    <button
                      onClick={() => handleMarkBanned(op.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Marcar banida
                    </button>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
                  {op.steps.map((s) => (
                    <div key={s.id} className="p-2 bg-gray-50 rounded text-center">
                      <p className="text-xs font-medium truncate">{STEP_LABELS[s.stepType] || s.stepType}</p>
                      <span className={`text-xs ${s.status === 'DONE' ? 'text-green-600' : 'text-gray-500'}`}>
                        {s.status === 'DONE' ? '✓' : '○'}
                      </span>
                      {s.status !== 'DONE' && ['DRAFT', 'EM_AQUECIMENTO', 'EM_CONFIG'].includes(op.status) && (
                        <button
                          onClick={() => handleStepComplete(op.id, s.stepType)}
                          disabled={!!updatingStep}
                          className="mt-1 block w-full text-xs text-primary-600 hover:underline"
                        >
                          Concluir
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {op.payment && (
                  <div className="mt-3 pt-3 border-t text-sm">
                    <span className={op.payment.status === 'PAID' ? 'text-green-600' : 'text-amber-600'}>
                      {op.payment.status === 'PAID' ? 'Pago' : 'Aguardando pagamento'}: R$ {Number(op.payment.amount).toLocaleString('pt-BR')}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        </div>
      </section>
    </div>
  )
}
