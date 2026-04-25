'use client'

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

type SecurityPayload = {
  minValueForKycBrl: number
  suspiciousEmailDomains: string[]
  antiFraudBlocks: number
  pendingKycCount: number
  adspowerGroupMap: Record<string, string>
  utmifyTokenPreview: string | null
}

type PendingKycItem = {
  id: string
  buyerName: string
  buyerCpf: string
  buyerEmail: string | null
  buyerWhatsapp: string
  qty: number
  totalAmount: number
  updatedAt: string
  paidAt: string | null
  deliveryStatusNote: string | null
  listing: {
    id: string
    title: string
    slug: string
  }
  kyc: {
    riskReasons: string[]
    minValueForKyc: number | null
    submitted: boolean
    fileMeta?: {
      documentPath?: string | null
      selfiePath?: string | null
      uploadedAt?: string
    } | null
  }
}

function formatMoney(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function reasonLabel(reason: string) {
  if (reason === 'AMOUNT_ABOVE_KYC') return 'Valor acima do limite KYC'
  if (reason === 'SUSPICIOUS_EMAIL_DOMAIN') return 'E-mail com domínio suspeito'
  if (reason === 'BLACKLISTED_IDENTITY') return 'Identidade em blacklist global'
  return reason
}

function statusBadge(item: PendingKycItem) {
  if (item.kyc.submitted) return 'KYC enviado'
  return 'Aguardando upload'
}

export function VendasPendentesClient() {
  const [security, setSecurity] = useState<SecurityPayload | null>(null)
  const [items, setItems] = useState<PendingKycItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingThreshold, setSavingThreshold] = useState(false)
  const [actingCheckoutId, setActingCheckoutId] = useState<string | null>(null)
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [minValueForKycInput, setMinValueForKycInput] = useState('300')

  const loadSecurity = useCallback(async () => {
    const res = await fetch('/api/admin/quick-sale/security', { cache: 'no-store' })
    const data = await res.json().catch(() => ({})) as SecurityPayload & { error?: string }
    if (!res.ok) throw new Error(data.error ?? 'Falha ao carregar configuração de segurança.')
    setSecurity(data)
    setMinValueForKycInput(String(data.minValueForKycBrl))
  }, [])

  const loadKycItems = useCallback(async (search = '') => {
    const params = new URLSearchParams()
    params.set('limit', '100')
    if (search.trim()) params.set('q', search.trim())
    const res = await fetch(`/api/admin/quick-sale/kyc?${params.toString()}`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({})) as { items?: PendingKycItem[]; error?: string }
    if (!res.ok) throw new Error(data.error ?? 'Falha ao carregar fila de KYC.')
    setItems(data.items ?? [])
  }, [])

  const loadAll = useCallback(async (search = '') => {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      await Promise.all([
        loadSecurity(),
        loadKycItems(search),
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar painel.')
    } finally {
      setLoading(false)
    }
  }, [loadKycItems, loadSecurity])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const totalPendingValue = useMemo(
    () => items.reduce((sum, row) => sum + row.totalAmount, 0),
    [items],
  )

  const onFilterSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      await loadKycItems(query)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao filtrar.')
    }
  }

  const onSaveThreshold = async (e: FormEvent) => {
    e.preventDefault()
    setSavingThreshold(true)
    setError('')
    setMessage('')
    try {
      const parsed = Number(String(minValueForKycInput).replace(',', '.'))
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error('Informe um valor válido para o limite mínimo de KYC.')
      }
      const res = await fetch('/api/admin/quick-sale/security', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minValueForKycBrl: parsed }),
      })
      const data = await res.json().catch(() => ({})) as SecurityPayload & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Falha ao salvar limite de KYC.')
      setSecurity(data)
      setMinValueForKycInput(String(data.minValueForKycBrl))
      setMessage('Limite mínimo de KYC atualizado com sucesso.')
      await loadKycItems(query)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar limite.')
    } finally {
      setSavingThreshold(false)
    }
  }

  const handleDecision = async (checkoutId: string, action: 'APPROVE' | 'REJECT') => {
    setActingCheckoutId(checkoutId)
    setError('')
    setMessage('')
    try {
      const note = action === 'REJECT'
        ? (window.prompt('Motivo da recusa (opcional):') ?? undefined)
        : undefined
      const res = await fetch('/api/admin/quick-sale/kyc', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutId, action, note }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string; moveResult?: { moved?: boolean } }
      if (!res.ok) throw new Error(data.error ?? 'Falha ao processar aprovação.')
      if (action === 'APPROVE') {
        setMessage(data.moveResult?.moved
          ? 'KYC aprovado e entrega automática executada no AdsPower.'
          : 'KYC aprovado. Checkout liberado para continuidade da entrega.')
      } else {
        setMessage('KYC recusado com sucesso.')
      }
      await loadAll(query)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar KYC.')
    } finally {
      setActingCheckoutId(null)
    }
  }

  const handleDownload = async (checkoutId: string, kind: 'document' | 'selfie') => {
    setDownloadingFile(`${checkoutId}:${kind}`)
    setError('')
    try {
      const res = await fetch(`/api/admin/quick-sale/kyc/file?checkoutId=${encodeURIComponent(checkoutId)}&kind=${kind}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? 'Arquivo KYC não disponível.')
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${checkoutId}-${kind}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao baixar arquivo KYC.')
    } finally {
      setDownloadingFile(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">GuardianGate — Vendas Pendentes</h1>
          <p className="text-sm text-zinc-400">
            Aprovação de KYC para vendas de alto valor e liberação no AdsPower.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { void loadAll(query) }}
          className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800 text-sm"
        >
          Atualizar
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>
      ) : null}
      {message ? (
        <p className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">{message}</p>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-3">
          <p className="text-zinc-500 text-xs uppercase tracking-wider">Limite atual KYC</p>
          <p className="text-white text-lg font-bold">{formatMoney(Number(security?.minValueForKycBrl ?? 0))}</p>
        </div>
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-3">
          <p className="text-zinc-500 text-xs uppercase tracking-wider">Vendas aguardando aprovação</p>
          <p className="text-amber-300 text-lg font-bold">{items.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-3">
          <p className="text-zinc-500 text-xs uppercase tracking-wider">Valor total em retenção</p>
          <p className="text-violet-300 text-lg font-bold">{formatMoney(totalPendingValue)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-white">Dashboard de Filtros</h2>

        <form onSubmit={onSaveThreshold} className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="text-xs text-zinc-400 uppercase tracking-wider">
              MIN_VALUE_FOR_KYC (R$)
            </span>
            <input
              type="number"
              min="1"
              step="0.01"
              value={minValueForKycInput}
              onChange={(e) => setMinValueForKycInput(e.target.value)}
              className="w-52 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white"
            />
          </label>
          <button
            type="submit"
            disabled={savingThreshold}
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-60"
          >
            {savingThreshold ? 'Salvando...' : 'Salvar limite'}
          </button>
        </form>

        <form onSubmit={onFilterSubmit} className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="text-xs text-zinc-400 uppercase tracking-wider">Pesquisar venda pendente</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nome, e-mail, documento, pedido ou produto"
              className="w-[420px] max-w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white"
            />
          </label>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800 text-sm"
          >
            Filtrar
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-4 overflow-auto">
        <h2 className="text-sm font-semibold text-white mb-3">Lista de Verificação</h2>
        {loading ? (
          <p className="text-sm text-zinc-500">Carregando vendas pendentes...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma venda aguardando KYC no momento.</p>
        ) : (
          <table className="min-w-[980px] w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-400 border-b border-zinc-800">
                <th className="py-2 pr-3">Nome do Cliente</th>
                <th className="py-2 pr-3">Valor</th>
                <th className="py-2 pr-3">Produto</th>
                <th className="py-2 pr-3">Documento</th>
                <th className="py-2 pr-3">Selfie</th>
                <th className="py-2 pr-3">Sinal de Risco</th>
                <th className="py-2 pr-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const busy = actingCheckoutId === item.id
                const loadingDoc = downloadingFile === `${item.id}:document`
                const loadingSelfie = downloadingFile === `${item.id}:selfie`
                return (
                  <tr key={item.id} className="border-b border-zinc-800/70 align-top">
                    <td className="py-3 pr-3">
                      <p className="font-medium text-white">{item.buyerName}</p>
                      <p className="text-xs text-zinc-500">{item.buyerCpf}</p>
                      <p className="text-xs text-zinc-500">{item.buyerEmail || 'sem e-mail'} · {item.buyerWhatsapp}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <p className="text-amber-300 font-semibold">{formatMoney(item.totalAmount)}</p>
                      <p className="text-xs text-zinc-500">{item.qty} unidade(s)</p>
                    </td>
                    <td className="py-3 pr-3">
                      <p className="text-white">{item.listing.title}</p>
                      <p className="text-xs text-zinc-500">Pedido: {item.id}</p>
                    </td>
                    <td className="py-3 pr-3">
                      {item.kyc.fileMeta?.documentPath ? (
                        <button
                          type="button"
                          onClick={() => { void handleDownload(item.id, 'document') }}
                          disabled={loadingDoc}
                          className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800 text-xs disabled:opacity-60"
                        >
                          {loadingDoc ? 'Baixando...' : 'Ver documento'}
                        </button>
                      ) : (
                        <span className="text-xs text-zinc-500">Não enviado</span>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      {item.kyc.fileMeta?.selfiePath ? (
                        <button
                          type="button"
                          onClick={() => { void handleDownload(item.id, 'selfie') }}
                          disabled={loadingSelfie}
                          className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800 text-xs disabled:opacity-60"
                        >
                          {loadingSelfie ? 'Baixando...' : 'Ver selfie'}
                        </button>
                      ) : (
                        <span className="text-xs text-zinc-500">Não enviada</span>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <span className="inline-flex text-[11px] px-2 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 mb-1">
                        {statusBadge(item)}
                      </span>
                      {item.kyc.riskReasons.length > 0 ? (
                        <p className="text-xs text-zinc-400">{item.kyc.riskReasons.map(reasonLabel).join(' · ')}</p>
                      ) : (
                        <p className="text-xs text-zinc-500">Sem flags adicionais</p>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => { void handleDecision(item.id, 'APPROVE') }}
                          disabled={busy}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-60"
                        >
                          {busy ? 'Processando...' : 'Aprovar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { void handleDecision(item.id, 'REJECT') }}
                          disabled={busy}
                          className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-60"
                        >
                          Recusar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

