'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, RefreshCw, Package, ShieldAlert } from 'lucide-react'

const BOTTLENECK_LABELS: Record<string, string> = {
  AGUARDANDO_PRODUCAO: 'Aguardando produção',
  AGUARDANDO_URL: 'Aguardando a sua URL',
  PRODUCAO_EM_ANDAMENTO: 'Produção em andamento',
  AGUARDANDO_CLIENTE: 'Aguardando a sua ação',
  EM_VALIDACAO: 'Em validação',
  NENHUM: 'Em dia',
}

type G = {
  id: string
  groupNumber: string
  quantityContracted: number
  quantityDelivered: number
  quantityPending: number
  progressPercent: number
  status: string
  operationalBottleneck: string
  observacoesProducao: string | null
  clientLabel: string
}

export function ClienteEntregasClient() {
  const [groups, setGroups] = useState<G[]>([])
  const [code, setCode] = useState<string | null>(null)
  const [openRmaCount, setOpenRmaCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/cliente/delivery-tracker')
      .then((r) => r.json())
      .then((d) => {
        setGroups(Array.isArray(d.groups) ? d.groups : [])
        setCode(d.clientCode ?? null)
        setOpenRmaCount(typeof d.openRmaCount === 'number' ? d.openRmaCount : 0)
      })
      .catch(() => setGroups([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin" /> A carregar entregas…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {openRmaCount > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">
          <ShieldAlert className="h-5 w-5 shrink-0 text-rose-400" />
          <span>
            Existe <strong>{openRmaCount}</strong> solicitação
            {openRmaCount > 1 ? 'ões' : ''} de reposição (RMA) em análise.
          </span>
          <Link
            href="/dashboard/cliente/reposicao"
            className="ml-auto rounded-lg bg-rose-600/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500"
          >
            Ver reposições
          </Link>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-zinc-400">
          {code ? (
            <>
              Acompanhe o progresso dos seus lotes <span className="text-white font-medium">{code}</span>.
            </>
          ) : (
            'Acompanhe o progresso dos seus lotes Plug & Play.'
          )}
        </p>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="text-zinc-500 text-sm">Ainda não há grupos de entrega associados à sua conta.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div
              key={g.id}
              className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5"
            >
              <div className="flex items-start gap-3 mb-3">
                <Package className="h-6 w-6 text-violet-400 shrink-0" />
                <div>
                  <p className="text-xs text-zinc-500">{g.groupNumber}</p>
                  <p className="font-semibold text-white">{g.clientLabel}</p>
                  <p className="text-xs text-sky-300/90 mt-1">
                    {BOTTLENECK_LABELS[g.operationalBottleneck] || g.operationalBottleneck}
                  </p>
                </div>
              </div>
              <div className="mb-2 h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-600 to-emerald-500"
                  style={{ width: `${g.progressPercent}%` }}
                />
              </div>
              <p className="text-sm text-zinc-300">
                <span className="font-mono font-semibold text-white">
                  {g.quantityDelivered}/{g.quantityContracted}
                </span>{' '}
                contas entregues ({g.progressPercent}%) —{' '}
                <span className="text-amber-200/90">{g.quantityPending} pendentes</span>
              </p>
              {g.observacoesProducao ? (
                <p className="mt-3 text-xs text-zinc-500 border-t border-zinc-800 pt-3">
                  <span className="text-zinc-400">Atualização da equipa:</span> {g.observacoesProducao}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-zinc-600">Atualização automática a cada 60 segundos.</p>
    </div>
  )
}
