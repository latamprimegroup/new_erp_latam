'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

type Account = {
  id: string
  platform: string
  type: string
  googleAdsCustomerId: string | null
  status: string
}

type Ticket = {
  id: string
  type: string
  status: string
  banReason: string | null
  description: string
  needsReplacement: boolean
  commercialOpsRequested: boolean
  accountReturned: boolean | null
  createdAt: string
  account: Account
}

const TYPE_LABELS: Record<string, string> = {
  BAN_CONTESTATION: 'Conta banida – contestar',
  REPLACEMENT_REQUEST: 'Solicitar reposição',
  PAUSED_NEEDS_OPS: 'Conta pausada – operação comercial',
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberto',
  IN_REVIEW: 'Em análise',
  REPLACEMENT_APPROVED: 'Reposição aprovada',
  RESOLVED: 'Resolvido',
  REJECTED: 'Rejeitado',
}

const PLATFORM_LABELS: Record<string, string> = {
  GOOGLE_ADS: 'Google Ads',
  META_ADS: 'Meta Ads',
  KWAI_ADS: 'Kwai Ads',
  TIKTOK_ADS: 'TikTok Ads',
  OTHER: 'Outro',
}

function ClienteContestacoesContent() {
  const searchParams = useSearchParams()
  const preselectedAccountId = searchParams.get('accountId')

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    accountId: preselectedAccountId || '',
    type: 'BAN_CONTESTATION' as 'BAN_CONTESTATION' | 'REPLACEMENT_REQUEST' | 'PAUSED_NEEDS_OPS',
    banReason: '',
    description: '',
    needsReplacement: false,
    commercialOpsRequested: false,
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/cliente/contestacoes').then((r) => r.json()),
      fetch('/api/cliente/contas').then((r) => r.json()),
    ]).then(([t, c]) => {
      setTickets(t)
      setAccounts((c as { accounts: Account[] }).accounts || [])
      if (preselectedAccountId) setForm((f) => ({ ...f, accountId: preselectedAccountId }))
    }).finally(() => setLoading(false))
  }, [preselectedAccountId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/cliente/contestacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (res.ok) {
        setTickets((prev) => [data, ...prev])
        setForm({
          accountId: '',
          type: 'BAN_CONTESTATION',
          banReason: '',
          description: '',
          needsReplacement: false,
          commercialOpsRequested: false,
        })
        setShowForm(false)
      } else {
        alert(data.error || 'Erro ao criar ticket')
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
        <h1 className="heading-1">Contestações e Operações Comerciais</h1>
      </div>

      <div className="card mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">Meus tickets</h2>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            {showForm ? 'Cancelar' : 'Novo ticket'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 dark:bg-ads-dark-card/50 rounded-lg border border-gray-200 dark:border-white/10 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Conta *</label>
              <select
                value={form.accountId}
                onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                className="input-field"
                required
              >
                <option value="">Selecione...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {PLATFORM_LABELS[a.platform] || a.platform} — {a.type} ({a.id.slice(0, 8)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tipo *</label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as typeof form.type }))}
                className="input-field"
              >
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            {form.type === 'BAN_CONTESTATION' && (
              <div>
                <label className="block text-sm font-medium mb-1">Motivo do banimento</label>
                <input
                  type="text"
                  value={form.banReason}
                  onChange={(e) => setForm((f) => ({ ...f, banReason: e.target.value }))}
                  className="input-field"
                  placeholder="Ex: Política de publicidade, violação..."
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">Descrição *</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="input-field min-h-[100px]"
                placeholder="Descreva o problema e o que você precisa..."
                required
              />
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.needsReplacement}
                  onChange={(e) => setForm((f) => ({ ...f, needsReplacement: e.target.checked }))}
                />
                <span className="text-sm">Precisa de reposição</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.commercialOpsRequested}
                  onChange={(e) => setForm((f) => ({ ...f, commercialOpsRequested: e.target.checked }))}
                />
                <span className="text-sm">Solicitar operação comercial</span>
              </label>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? 'Enviando...' : 'Enviar ticket'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                Cancelar
              </button>
            </div>
          </form>
        )}

        {tickets.length === 0 ? (
          <p className="text-gray-500 py-6">Nenhum ticket ainda.</p>
        ) : (
          <div className="space-y-4">
            {tickets.map((t) => (
              <div
                key={t.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-primary-600/20 transition-colors"
              >
                <div className="flex flex-wrap justify-between items-start gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{TYPE_LABELS[t.type]}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        t.status === 'RESOLVED' ? 'bg-green-100 text-green-800' :
                        t.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {STATUS_LABELS[t.status]}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {PLATFORM_LABELS[t.account.platform] || t.account.platform} — {t.account.type} • {t.account.id.slice(0, 8)}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(t.createdAt).toLocaleString('pt-BR')}
                  </span>
                </div>
                <p className="text-sm text-gray-700 mt-2">{t.description}</p>
                {(t.banReason || t.needsReplacement || t.commercialOpsRequested) && (
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    {t.banReason && <span>Ban: {t.banReason}</span>}
                    {t.needsReplacement && <span>Reposição solicitada</span>}
                    {t.commercialOpsRequested && <span>Op. comercial solicitada</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ClienteContestacoesPage() {
  return (
    <Suspense fallback={
      <div>
        <Link href="/dashboard/cliente" className="text-gray-500 hover:text-gray-700 mb-4 inline-block">← Voltar</Link>
        <p className="text-gray-500">Carregando...</p>
      </div>
    }>
      <ClienteContestacoesContent />
    </Suspense>
  )
}
