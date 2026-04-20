'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatCnpjDisplay } from '@/lib/ads-core-utils'
import { labelAdsCoreStatusGerente } from '@/lib/ads-core-production-status'

type Row = {
  id: string
  nicheId: string
  nicheName: string
  cnpj: string
  razaoSocial: string | null
  siteUrl: string | null
  statusProducao: string
  producerId: string | null
  producerName: string | null
  producerEmail: string | null
  hasDocRgFrente: boolean
  hasDocRgVerso: boolean
  producerAssignedAt: string | null
  createdAt: string
}

function statusG2Demanda(row: Row): string {
  const terminal = row.statusProducao === 'APROVADO' || row.statusProducao === 'REPROVADO'
  if (!terminal && row.producerId && (!row.hasDocRgFrente || !row.hasDocRgVerso)) {
    return 'Aguardando RG'
  }
  return labelAdsCoreStatusGerente(row.statusProducao, { assignedToProducer: !!row.producerId })
}

function formatInicio(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function SiteSearchCell({ siteUrl }: { siteUrl: string | null }) {
  if (!siteUrl?.trim()) {
    return <span className="text-gray-500">—</span>
  }
  const raw = siteUrl.trim()
  let q = raw
  try {
    const href = raw.startsWith('http') ? raw : `https://${raw}`
    const u = new URL(href)
    q = u.hostname || raw
  } catch {
    q = raw.replace(/^https?:\/\//i, '')
  }
  const short = q.length > 36 ? `${q.slice(0, 33)}…` : q
  const searchHref = `https://www.google.com/search?q=${encodeURIComponent(q)}`
  return (
    <a
      href={searchHref}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary-400 hover:underline text-[11px] break-all inline-block max-w-[220px]"
    >
      {short}
    </a>
  )
}

export function AdsCoreDemandasClient() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [niches, setNiches] = useState<{ id: string; name: string }[]>([])
  const [producerOpts, setProducerOpts] = useState<{ id: string; label: string }[]>([])
  const [nicheFilter, setNicheFilter] = useState('')
  const [producerFilter, setProducerFilter] = useState('')

  const loadRefs = useCallback(async () => {
    const [nRes, pRes] = await Promise.all([fetch('/api/ads-core/niches'), fetch('/api/admin/producers')])
    const nData = await nRes.json()
    if (nRes.ok && Array.isArray(nData)) {
      setNiches(nData.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })))
    }
    const pJson = await pRes.json()
    if (pRes.ok && Array.isArray(pJson?.users)) {
      setProducerOpts(
        pJson.users.map((u: { id: string; name: string | null; email: string | null }) => ({
          id: u.id,
          label: (u.name || u.email || u.id).trim(),
        }))
      )
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const q = new URLSearchParams()
    q.set('take', '2000')
    if (nicheFilter) q.set('nicheId', nicheFilter)
    if (producerFilter && producerFilter !== '__sem__') q.set('producerId', producerFilter)
    const res = await fetch(`/api/ads-core/assets?${q.toString()}`)
    const data = await res.json()
    if (res.ok && Array.isArray(data)) {
      setRows(data as Row[])
    } else {
      setRows([])
    }
    setLoading(false)
  }, [nicheFilter, producerFilter])

  useEffect(() => {
    void loadRefs()
  }, [loadRefs])

  useEffect(() => {
    void load()
  }, [load])

  const visibleRows = useMemo(() => {
    if (producerFilter === '__sem__') return rows.filter((r) => !r.producerId)
    return rows
  }, [rows, producerFilter])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-1 mb-1">Painel de demandas</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 max-w-3xl">
          Visão centralizada: colaborador, CNPJ, site, status G2, data de início na fila e atalho para a tela de estoque
          e atribuição.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Nicho</label>
          <select
            className="input-field text-sm min-w-[200px]"
            value={nicheFilter}
            onChange={(e) => setNicheFilter(e.target.value)}
          >
            <option value="">Todos</option>
            {niches.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Colaborador</label>
          <select
            className="input-field text-sm min-w-[220px]"
            value={producerFilter}
            onChange={(e) => setProducerFilter(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="__sem__">Sem responsável (estoque)</option>
            {producerOpts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <Link href="/dashboard/ads-core/atribuicao" className="text-sm text-primary-600 dark:text-primary-400 hover:underline pb-2">
          Ir para estoque e atribuição →
        </Link>
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden bg-zinc-950/80">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/50 text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2">Colaborador</th>
                <th className="px-3 py-2 min-w-[200px]">Ativo (CNPJ / site)</th>
                <th className="px-3 py-2">Nicho</th>
                <th className="px-3 py-2">Status G2</th>
                <th className="px-3 py-2 whitespace-nowrap">Data de início</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                    Carregando…
                  </td>
                </tr>
              )}
              {!loading && visibleRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                    Nenhuma demanda com os filtros atuais.
                  </td>
                </tr>
              )}
              {!loading &&
                visibleRows.map((r) => {
                    const colaborador = r.producerId
                      ? (r.producerName || r.producerEmail || r.producerId).trim()
                      : '—'
                    const inicio = formatInicio(r.producerAssignedAt || r.createdAt)
                    const detailHref = `/dashboard/ads-core/atribuicao?highlightAsset=${encodeURIComponent(r.id)}${
                      r.nicheId ? `&nicheId=${encodeURIComponent(r.nicheId)}` : ''
                    }`
                    return (
                      <tr key={r.id} className="hover:bg-white/[0.03]">
                        <td className="px-3 py-2 text-gray-200 text-xs font-medium">{colaborador}</td>
                        <td className="px-3 py-2 align-top">
                          <div className="font-mono text-xs">{formatCnpjDisplay(r.cnpj)}</div>
                          <div className="mt-1">
                            <SiteSearchCell siteUrl={r.siteUrl} />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-400 text-xs">{r.nicheName}</td>
                        <td className="px-3 py-2 text-xs text-gray-200">{statusG2Demanda(r)}</td>
                        <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">{inicio}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1.5 items-start">
                            <Link
                              href={detailHref}
                              className="text-xs px-2 py-1 rounded-md bg-white/5 text-primary-300 border border-white/10 hover:bg-white/10"
                            >
                              Ver detalhes
                            </Link>
                            {r.statusProducao === 'APROVADO' && (
                              <button
                                type="button"
                                disabled
                                title="Arquivamento operacional ainda não modelado no banco — use relatórios ou exclusão controlada na tela de atribuição, se aplicável."
                                className="text-xs px-2 py-1 rounded-md bg-white/[0.02] text-gray-500 border border-white/5 cursor-not-allowed"
                              >
                                Arquivar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
