'use client'

import { useState, useEffect } from 'react'
import { SkeletonTable } from '@/components/Skeleton'

type Producer = { id: string; name: string | null; email: string }
type Account = {
  id: string
  platform: string
  type: string
  status: string
  updatedAt: string
  producer: Producer
}
type G2Item = {
  id: string
  codeG2: string
  status: string
  approvedAt: string | null
  creator: Producer
}

type Data = {
  date: string
  pending: { accounts: number; g2Items: number; total: number }
  items: { accounts: Account[]; g2Items: G2Item[] }
  byProducer: Array<{
    producer: Producer
    accounts: Account[]
    g2Items: G2Item[]
  }>
}

export function ConferenciaClient() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set())
  const [selectedG2, setSelectedG2] = useState<Set<string>>(new Set())
  const [showPassword, setShowPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/producao/conferencia-diaria?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        setSelectedAccounts(new Set())
        setSelectedG2(new Set())
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [date])

  const toggleAccount = (id: string) => {
    setSelectedAccounts((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleG2 = (id: string) => {
    setSelectedG2((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (!data) return
    setSelectedAccounts(new Set(data.items.accounts.map((a) => a.id)))
    setSelectedG2(new Set(data.items.g2Items.map((g) => g.id)))
  }

  const deselectAll = () => {
    setSelectedAccounts(new Set())
    setSelectedG2(new Set())
  }

  const handleValidar = async () => {
    if (selectedAccounts.size === 0 && selectedG2.size === 0) {
      setError('Selecione ao menos uma conta para validar.')
      return
    }
    if (!password.trim()) {
      setError('Informe sua senha para assinar a conferência.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/producao/conferencia-diaria/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          productionAccountIds: Array.from(selectedAccounts),
          productionG2Ids: Array.from(selectedG2),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Erro ao validar')
        return
      }
      setPassword('')
      setShowPassword(false)
      setSelectedAccounts(new Set())
      setSelectedG2(new Set())
      setData(null)
      setLoading(true)
      const r = await fetch(`/api/producao/conferencia-diaria?date=${date}`)
      const d = await r.json()
      setData(d)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const totalSelected = selectedAccounts.size + selectedG2.size

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Conferência Diária</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Valide as contas aprovadas do dia com sua senha. Apenas contas conferidas entram para pagamento do produtor.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Data:</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input-field w-auto px-3 py-2 text-sm"
          />
        </label>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="rounded-lg border border-gray-200 dark:border-white/20 bg-white dark:bg-ads-dark-card px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/10"
          >
            Selecionar todas
          </button>
          <button
            onClick={deselectAll}
            className="rounded-lg border border-gray-200 dark:border-white/20 bg-white dark:bg-ads-dark-card px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/10"
          >
            Limpar seleção
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={8} cols={5} />
      ) : data && data.pending.total > 0 ? (
        <>
          <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-ads-dark-card shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/10 flex items-center justify-between">
              <span className="font-medium text-gray-800 dark:text-gray-200">
                Pendentes: {data.pending.accounts} Produção + {data.pending.g2Items} G2
              </span>
              {totalSelected > 0 && (
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {totalSelected} selecionada{totalSelected > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="divide-y divide-gray-100 dark:divide-white/10 max-h-[400px] overflow-y-auto scrollbar-ads">
              {data.items.accounts.map((a) => (
                <label
                  key={a.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedAccounts.has(a.id)}
                    onChange={() => toggleAccount(a.id)}
                  />
                  <span className="text-gray-500 dark:text-gray-400 w-20">Produção</span>
                  <span className="font-mono text-sm text-gray-900 dark:text-gray-100">{a.platform}/{a.type}</span>
                  <span className="text-gray-600 dark:text-gray-300">{a.producer.name || a.producer.email}</span>
                  <span className="text-gray-400 dark:text-gray-500 text-sm ml-auto">
                    {new Date(a.updatedAt).toLocaleString('pt-BR')}
                  </span>
                </label>
              ))}
              {data.items.g2Items.map((g) => (
                <label
                  key={g.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedG2.has(g.id)}
                    onChange={() => toggleG2(g.id)}
                  />
                  <span className="text-gray-500 dark:text-gray-400 w-20">G2</span>
                  <span className="font-mono text-sm text-gray-900 dark:text-gray-100">{g.codeG2}</span>
                  <span className="text-gray-600 dark:text-gray-300">{g.creator.name || g.creator.email}</span>
                  <span className="text-gray-400 dark:text-gray-500 text-sm ml-auto">
                    {g.approvedAt ? new Date(g.approvedAt).toLocaleString('pt-BR') : '—'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {totalSelected > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-ads-dark-card p-4 shadow-sm">
              {!showPassword ? (
                <button
                  onClick={() => setShowPassword(true)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Conferir {totalSelected} conta{totalSelected > 1 ? 's' : ''} selecionada{totalSelected > 1 ? 's' : ''}
                </button>
              ) : (
                <div className="space-y-3 max-w-md">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Sua senha para assinar</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Digite sua senha"
                      className="input-field mt-1"
                      autoFocus
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={handleValidar}
                      disabled={submitting || !password.trim()}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? 'Validando...' : 'Confirmar conferência'}
                    </button>
                    <button
                      onClick={() => { setShowPassword(false); setPassword('') }}
                      className="rounded-lg border border-gray-200 dark:border-white/20 bg-white dark:bg-ads-dark-card px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/10"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-ads-dark-card p-8 text-center text-gray-500 dark:text-gray-400">
          Nenhuma conta pendente de conferência para {new Date(date).toLocaleDateString('pt-BR')}.
        </div>
      )}
    </div>
  )
}
