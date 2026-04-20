'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type Niche = { id: string; name: string; active?: boolean }
type Producer = { id: string; name: string | null; email: string | null }

export function AdsCoreNichosGestaoClient() {
  const [niches, setNiches] = useState<Niche[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [allProducers, setAllProducers] = useState<Producer[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [restricted, setRestricted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const loadNiches = useCallback(async () => {
    const res = await fetch('/api/ads-core/niches')
    const data = await res.json()
    if (res.ok && Array.isArray(data)) {
      const list = data.filter((n: Niche) => n.active !== false)
      setNiches(list)
      setActiveId((prev) => {
        if (prev && list.some((x: Niche) => x.id === prev)) return prev
        return list[0]?.id ?? ''
      })
    }
  }, [])

  const loadAllProducers = useCallback(async () => {
    const res = await fetch('/api/admin/producers')
    const j = await res.json()
    if (res.ok && Array.isArray(j.users)) setAllProducers(j.users)
  }, [])

  useEffect(() => {
    void loadNiches()
    void loadAllProducers()
  }, [loadNiches, loadAllProducers])

  const loadNicheProducers = useCallback(async (nicheId: string) => {
    if (!nicheId) return
    setLoading(true)
    setErr('')
    try {
      const res = await fetch(`/api/ads-core/niches/${nicheId}/producers`)
      const j = await res.json()
      if (!res.ok) {
        setErr(j.error || 'Falha ao carregar')
        return
      }
      setRestricted(!!j.restricted)
      setSelectedIds(new Set((j.producerIds as string[]) || []))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeId) void loadNicheProducers(activeId)
  }, [activeId, loadNicheProducers])

  const activeNiche = useMemo(() => niches.find((n) => n.id === activeId), [niches, activeId])

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    if (!activeId) return
    setSaving(true)
    setErr('')
    try {
      const res = await fetch(`/api/ads-core/niches/${activeId}/producers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ producerIds: [...selectedIds] }),
      })
      const j = await res.json()
      if (!res.ok) {
        setErr(j.error || 'Não foi possível salvar')
        return
      }
      setRestricted(!!j.restricted)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-4 text-sm text-gray-300">
        <p className="font-medium text-primary-300 mb-1">Organizador temático</p>
        <p className="text-xs text-gray-400 leading-relaxed">
          Por nicho, defina quais colaboradores podem receber atribuições. Se <strong>ninguém</strong> estiver marcado,
          o cadastro e a atribuição aceitam <strong>qualquer</strong> produtor (modo legado). Com ao menos um marcado,
          apenas eles aparecem no dropdown do gerente para aquele nicho.
        </p>
      </div>

      {err && (
        <p className="text-sm text-red-500" role="alert">
          {err}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {niches.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => setActiveId(n.id)}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              n.id === activeId
                ? 'bg-primary-600 text-white border-primary-500'
                : 'bg-zinc-900/80 text-gray-300 border-white/10 hover:border-white/20'
            }`}
          >
            {n.name}
          </button>
        ))}
      </div>

      {!activeId && <p className="text-gray-500 text-sm">Cadastre nichos em Config / API de nichos.</p>}

      {activeId && activeNiche && (
        <div className="card p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-primary-600 dark:text-primary-400">{activeNiche.name}</h2>
              <p className="text-xs text-gray-500 mt-1">
                {restricted
                  ? 'Somente os colaboradores marcados podem ser atribuídos a ativos deste nicho.'
                  : 'Sem restrição — todos os produtores elegíveis no sistema.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/dashboard/ads-core/atribuicao?nicheId=${encodeURIComponent(activeId)}`}
                className="btn-secondary text-sm"
              >
                Ver estoque filtrado
              </Link>
              <button type="button" disabled={saving} onClick={() => void save()} className="btn-primary text-sm">
                {saving ? 'Salvando…' : 'Salvar habilitações'}
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-gray-500 text-sm">Carregando…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[min(60vh,520px)] overflow-y-auto border border-gray-200 dark:border-white/10 rounded-lg p-3">
              {allProducers.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="rounded border-gray-400"
                  />
                  <span className="truncate">{(p.name || p.email || p.id).trim()}</span>
                </label>
              ))}
            </div>
          )}

          <p className="text-[11px] text-gray-500">
            Dica: use filtros por nicho na{' '}
            <Link href="/dashboard/ads-core" className="text-primary-600 dark:text-primary-400 hover:underline">
              visão produtor
            </Link>{' '}
            para a “fábrica de contas” segmentada (ex.: só Nutracêuticos).
          </p>
        </div>
      )}
    </div>
  )
}
