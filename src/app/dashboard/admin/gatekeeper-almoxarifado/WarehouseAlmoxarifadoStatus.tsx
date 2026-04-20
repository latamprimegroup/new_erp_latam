'use client'

import { useCallback, useEffect, useState } from 'react'
import { Layers, MapPin, RefreshCw } from 'lucide-react'

export type WarehouseStatusPayload = {
  generatedAt: string
  gmailSafraBadges: { safra: string; count: number }[]
  gmails: { available: number; inUse: number; total: number; vovoAvailable?: number }
  cnpjs: { ativosRf: number; totalCofre: number }
  inventoryIds: number
  inventoryCards: number
  duplicateEntryPolicy?: {
    httpStatus: number
    message: string
    prismaUniqueViolationCode: string
  }
}

export function WarehouseAlmoxarifadoStatus({ rev = 0 }: { rev?: number }) {
  const [data, setData] = useState<WarehouseStatusPayload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    setErr(null)
    fetch('/api/admin/gatekeeper/warehouse-status')
      .then((r) => {
        if (!r.ok) throw new Error('Falha ao carregar status')
        return r.json()
      })
      .then((d: WarehouseStatusPayload) => setData(d))
      .catch(() => setErr('Não foi possível carregar o almoxarifado'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load, rev])

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 text-slate-200">
          <Layers className="w-5 h-5 text-amber-400" />
          <h2 className="text-sm font-semibold tracking-wide uppercase">Status do Almoxarifado</h2>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {err && <p className="text-xs text-red-400 mb-3">{err}</p>}

      {data && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Safra de Gmail</p>
            <div className="flex flex-wrap gap-2">
              {data.gmailSafraBadges.length === 0 ? (
                <span className="text-xs text-slate-500">Nenhum Gmail no cofre</span>
              ) : (
                data.gmailSafraBadges.map((b) => (
                  <span
                    key={b.safra}
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/80 border border-emerald-800/60 px-3 py-1 text-xs text-emerald-200"
                  >
                    <span className="font-medium">{b.safra}</span>
                    <span className="text-emerald-400/90 font-mono">{b.count}</span>
                  </span>
                ))
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Disponíveis: <span className="text-slate-300 font-mono">{data.gmails.available}</span> · Em uso:{' '}
              <span className="text-slate-300 font-mono">{data.gmails.inUse}</span> · Total:{' '}
              <span className="text-slate-300 font-mono">{data.gmails.total}</span>
            </p>
            {typeof data.gmails.vovoAvailable === 'number' && (
              <p className="text-[11px] mt-2">
                <span className="rounded-md bg-amber-950/90 border border-amber-800/50 text-amber-100 px-2 py-0.5 font-medium">
                  Vovôs (mais de 10 anos) disponíveis
                </span>{' '}
                <span className="text-amber-200/90 font-mono">{data.gmails.vovoAvailable}</span>
                <span className="text-slate-500 ml-1">
                  (safra com ano no campo; ex.: &quot;2014&quot; ou &quot;Safra 2014&quot;)
                </span>
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3 items-stretch">
            <div className="flex-1 min-w-[140px] rounded-xl bg-slate-950/80 border border-sky-900/40 px-4 py-3">
              <div className="flex items-center gap-2 text-sky-400 text-[10px] uppercase tracking-wider mb-1">
                <MapPin className="w-3.5 h-3.5" />
                CNPJs ativos (RF)
              </div>
              <p className="text-2xl font-semibold text-sky-100 font-mono">{data.cnpjs.ativosRf}</p>
              <p className="text-[11px] text-slate-500 mt-1">Total no cofre: {data.cnpjs.totalCofre}</p>
            </div>
            <div className="flex-1 min-w-[120px] rounded-xl bg-slate-950/80 border border-slate-700 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">IDs / Cartões</p>
              <p className="text-sm text-slate-200">
                IDs: <span className="font-mono text-violet-300">{data.inventoryIds}</span>
                <span className="mx-2 text-slate-600">|</span>
                Cartões: <span className="font-mono text-amber-300">{data.inventoryCards}</span>
              </p>
            </div>
          </div>

          <p className="text-[10px] text-slate-600">
            Atualizado: {new Date(data.generatedAt).toLocaleString('pt-BR')} · Unicidade:{' '}
            {data.duplicateEntryPolicy?.httpStatus} {data.duplicateEntryPolicy?.message?.slice(0, 48)}…
          </p>
        </div>
      )}
    </section>
  )
}
