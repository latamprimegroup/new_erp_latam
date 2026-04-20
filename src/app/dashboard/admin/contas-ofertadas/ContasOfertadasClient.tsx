'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

const PLAT_LABEL: Record<string, string> = {
  GOOGLE_ADS: 'Google',
  META_ADS: 'FB',
  KWAI_ADS: 'Kwai',
  TIKTOK_ADS: 'TikTok',
  OTHER: 'Outro',
}

const REJECT_PRESETS = [
  { value: 'PRICE', label: 'Preço acima da margem permitida.' },
  { value: 'CHECKPOINT', label: 'Ativo com checkpoint/bloqueio imediato.' },
  { value: 'DOCS', label: 'Falta de documentação legível.' },
  { value: 'WARMUP', label: 'Aquecimento insuficiente para nicho Black.' },
] as const

type Summary = {
  pendingReview: number
  approvedToday: number
  repositionsPending: number
  avgMarginPotential: number
}

type Item = {
  id: string
  platform: string
  type: string
  niche: string | null
  purchasePrice: number
  salePrice: number
  markupPercent: number | null
  description: string | null
  offerReviewMeta: unknown
  createdAt: string
  displayName: string
  manager: {
    name: string | null
    email: string
    stats: { delivered: number; failed: number }
  } | null
  supplier: {
    name: string
    contact: string | null
    whatsappUrl: string | null
  } | null
  technicalBadges: { key: string; label: string; variant: string }[]
  hasCredential: boolean
}

type Detail = {
  id: string
  platform: string
  type: string
  niche: string | null
  purchasePrice: number
  salePrice: number
  markupPercent: number | null
  description: string | null
  offerReviewMeta: {
    docMatchesName?: boolean
    warmupOver7d?: boolean
    cookiesImportedOk?: boolean
  } | null
  manager: { name: string | null; email: string; stats: { delivered: number; failed: number } } | null
  supplier: { name: string; contact: string | null; whatsappUrl: string | null } | null
  access: {
    email: string | null
    password: string | null
    twoFaSecret: string | null
    recoveryEmail: string | null
    cookieJson: string
  } | null
  attachmentNote: string
}

function badgeClass(v: string) {
  if (v === 'ok') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
  if (v === 'warn') return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
  if (v === 'bad') return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    alert('Não foi possível copiar')
  }
}

export function ContasOfertadasClient() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [detailModalId, setDetailModalId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [rejectFor, setRejectFor] = useState<string | null>(null)
  const [rejectPreset, setRejectPreset] = useState('')
  const [improvementNote, setImprovementNote] = useState('')

  const [markups, setMarkups] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/contas-ofertadas')
    const data = await res.json()
    if (res.ok) {
      setSummary(data.summary)
      setItems(data.items || [])
      const m: Record<string, string> = {}
      for (const it of data.items || []) {
        m[it.id] =
          it.markupPercent != null && !Number.isNaN(it.markupPercent)
            ? String(it.markupPercent)
            : '0'
      }
      setMarkups((prev) => ({ ...m, ...prev }))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function openDetail(id: string) {
    setDetailModalId(id)
    setDetailLoading(true)
    setDetail(null)
    try {
      const res = await fetch(`/api/admin/contas-ofertadas/${id}`)
      const d = await res.json()
      if (res.ok) setDetail(d as Detail)
    } finally {
      setDetailLoading(false)
    }
  }

  async function saveReview(id: string, meta: NonNullable<Detail['offerReviewMeta']>) {
    const res = await fetch(`/api/admin/contas-ofertadas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_review', offerReviewMeta: meta }),
    })
    if (res.ok) await load()
    else alert((await res.json()).error || 'Erro ao salvar')
  }

  async function patchPricing(id: string, markupPercent: number) {
    const res = await fetch(`/api/admin/contas-ofertadas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_pricing', markupPercent }),
    })
    if (res.ok) await load()
    else alert((await res.json()).error || 'Erro ao atualizar preço')
  }

  async function handleApprove(id: string) {
    const res = await fetch(`/api/admin/contas-ofertadas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    })
    if (res.ok) {
      setDetailModalId((mid) => (mid === id ? null : mid))
      setDetail((d) => (d?.id === id ? null : d))
      load()
    } else alert((await res.json()).error || 'Erro')
  }

  async function handleReject(id: string) {
    const label = REJECT_PRESETS.find((p) => p.value === rejectPreset)?.label || rejectPreset
    if (!label?.trim()) {
      alert('Selecione ou informe um motivo')
      return
    }
    const res = await fetch(`/api/admin/contas-ofertadas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reject',
        rejectionReason: label,
        rejectionCode: rejectPreset || undefined,
        improvementNote: improvementNote.trim() || undefined,
      }),
    })
    if (res.ok) {
      setRejectFor(null)
      setRejectPreset('')
      setImprovementNote('')
      setDetailModalId((mid) => (mid === id ? null : mid))
      setDetail((d) => (d?.id === id ? null : d))
      load()
    } else alert((await res.json()).error || 'Erro')
  }

  function salePreview(purchase: number, markupPct: number) {
    return Math.round(purchase * (1 + markupPct / 100) * 100) / 100
  }

  function buildSaleCopy(it: Item | Detail) {
    const plat = PLAT_LABEL[it.platform] || it.platform
    const price = it.salePrice
    const niche = it.niche || '—'
    return `🔥 NOVIDADE NO ESTOQUE! ${plat} — ${it.type}. Nicho: ${niche}. Valor: R$ ${Number(price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Chamem no PV!`
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/admin" className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
          ← Admin
        </Link>
        <h1 className="heading-1">Contas ofertadas pelos gestores</h1>
      </div>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="card py-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">Pendentes de análise</p>
            <p className="text-2xl font-semibold">{summary.pendingReview}</p>
          </div>
          <div className="card py-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">Aprovadas hoje (estoque)</p>
            <p className="text-2xl font-semibold">{summary.approvedToday}</p>
          </div>
          <div className="card py-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">Reposições pendentes</p>
            <p className="text-2xl font-semibold">{summary.repositionsPending}</p>
          </div>
          <div className="card py-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">Margem média prevista (estoque)</p>
            <p className="text-2xl font-semibold">
              R$ {summary.avgMarginPotential.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}

      <div className="card">
        {loading ? (
          <p className="text-gray-500 py-8">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="text-gray-400 py-8">Nenhuma conta pendente de aprovação.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                  <th className="pb-2 pr-3">Ativo / ID</th>
                  <th className="pb-2 pr-3">Fonte</th>
                  <th className="pb-2 pr-3">Gestor / Fornecedor</th>
                  <th className="pb-2 pr-3">Custo</th>
                  <th className="pb-2 pr-3">Margem %</th>
                  <th className="pb-2 pr-3">Preço final</th>
                  <th className="pb-2 pr-3">Status técnico</th>
                  <th className="pb-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => {
                  const mkt = parseFloat(markups[a.id] || '0') || 0
                  const preview = salePreview(a.purchasePrice, mkt)
                  return (
                    <tr key={a.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <td className="py-3 pr-3">
                        <span className="font-mono text-xs text-gray-500">#{a.id.slice(0, 8)}</span>
                        <br />
                        <span className="font-medium">{a.type}</span>
                      </td>
                      <td className="py-3 pr-3">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold dark:bg-slate-800">
                          {PLAT_LABEL[a.platform] || '?'}
                        </span>
                      </td>
                      <td className="py-3 pr-3">
                        {a.manager && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Gestor: {a.manager.name || a.manager.email}
                            <br />
                            <span className="text-[11px]">
                              Histórico: {a.manager.stats.delivered} ok / {a.manager.stats.failed} reprov.
                            </span>
                          </div>
                        )}
                        {a.supplier && (
                          <div className="mt-1">
                            <span className="font-medium">{a.supplier.name}</span>
                            {a.supplier.whatsappUrl && (
                              <a
                                href={a.supplier.whatsappUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-2 text-green-600 hover:underline text-xs"
                                title="WhatsApp"
                              >
                                WA
                              </a>
                            )}
                          </div>
                        )}
                        {!a.manager && !a.supplier && '—'}
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        R$ {a.purchasePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 pr-3">
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          className="input-field py-1 px-2 text-xs w-20"
                          value={markups[a.id] ?? ''}
                          onChange={(e) => setMarkups((s) => ({ ...s, [a.id]: e.target.value }))}
                          onBlur={() => patchPricing(a.id, mkt)}
                        />
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap font-medium">
                        R$ {preview.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {a.technicalBadges.map((b) => (
                            <span
                              key={b.key}
                              className={`text-[10px] px-1.5 py-0.5 rounded ${badgeClass(b.variant)}`}
                            >
                              {b.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-col gap-1 items-start">
                          <button
                            type="button"
                            onClick={() => void handleApprove(a.id)}
                            className="text-green-600 hover:underline text-xs"
                          >
                            ✅ Aprovar
                          </button>
                          <button
                            type="button"
                            onClick={() => openDetail(a.id)}
                            className="text-blue-600 hover:underline text-xs"
                          >
                            👁️ Detalhes
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectFor(a.id)
                              setRejectPreset('')
                              setImprovementNote('')
                            }}
                            className="text-red-600 hover:underline text-xs"
                          >
                            ❌ Reprovar
                          </button>
                          <button
                            type="button"
                            onClick={() => void copyText(buildSaleCopy(a))}
                            className="text-slate-600 hover:underline text-xs dark:text-slate-300"
                          >
                            📋 Copy venda
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rejectFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card max-w-md w-full space-y-4">
            <h3 className="font-semibold">Reprovar oferta</h3>
            <label className="block text-sm">
              <span className="text-gray-600 dark:text-gray-300">Motivo</span>
              <select
                className="input-field mt-1 w-full"
                value={rejectPreset}
                onChange={(e) => setRejectPreset(e.target.value)}
              >
                <option value="">Selecione…</option>
                {REJECT_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-600 dark:text-gray-300">Mensagem de melhoria para o gestor</span>
              <textarea
                className="input-field mt-1 w-full min-h-[80px]"
                placeholder="Ex.: Gestor, para aprovarmos, limpe os cookies e refaça o aquecimento por mais 3 dias."
                value={improvementNote}
                onChange={(e) => setImprovementNote(e.target.value)}
              />
            </label>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary text-sm" onClick={() => setRejectFor(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded bg-red-600 text-white"
                onClick={() => void handleReject(rejectFor)}
              >
                Confirmar reprovação
              </button>
            </div>
          </div>
        </div>
      )}

      {detailModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="card max-w-lg w-full my-8 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start gap-2">
              <h3 className="font-semibold">Detalhes #{detailModalId.slice(0, 8)}</h3>
              <button
                type="button"
                className="text-gray-500 text-sm"
                onClick={() => {
                  setDetailModalId(null)
                  setDetail(null)
                }}
              >
                Fechar
              </button>
            </div>

            {detailLoading && <p className="text-sm text-gray-500">Carregando…</p>}
            {!detailLoading && !detail && (
              <p className="text-sm text-red-600">Não foi possível carregar os detalhes.</p>
            )}

            {!detailLoading && detail && (
            <div className="space-y-3 text-sm">
              <p>
                <strong>Acesso</strong>
              </p>
              {detail.access ? (
                <div className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Usuário / e-mail</span>
                    <button
                      type="button"
                      className="text-xs text-blue-600"
                      onClick={() => void copyText(detail.access!.email || '')}
                    >
                      Copiar
                    </button>
                  </div>
                  <p className="font-mono text-xs break-all">{detail.access.email || '—'}</p>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Senha</span>
                    <button
                      type="button"
                      className="text-xs text-blue-600"
                      onClick={() => void copyText(detail.access!.password || '')}
                    >
                      Copiar
                    </button>
                  </div>
                  <p className="font-mono text-xs break-all">{detail.access.password || '—'}</p>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">2FA</span>
                    <button
                      type="button"
                      className="text-xs text-blue-600"
                      onClick={() => void copyText(detail.access!.twoFaSecret || '')}
                    >
                      Copiar
                    </button>
                  </div>
                  <p className="font-mono text-xs break-all">{detail.access.twoFaSecret || '—'}</p>
                  <p className="text-gray-500 text-xs">Recuperação: {detail.access.recoveryEmail || '—'}</p>
                  <div className="flex justify-between gap-2 items-center">
                    <span className="text-gray-500">Cookie JSON</span>
                    <button
                      type="button"
                      className="text-xs text-blue-600"
                      onClick={() => void copyText(detail.access!.cookieJson)}
                    >
                      Copiar
                    </button>
                  </div>
                  <textarea
                    readOnly
                    className="input-field w-full text-xs font-mono min-h-[100px]"
                    value={detail.access.cookieJson || '(vazio — gestor pode preencher proxyConfig/notas na credencial)'}
                  />
                </div>
              ) : (
                <p className="text-amber-700 text-xs">
                  Sem credencial vinculada. O gestor ainda não enviou login/cookies por este fluxo.
                </p>
              )}

              <p className="pt-2">
                <strong>Prints / documentos</strong>
              </p>
              <p className="text-xs text-gray-500">{detail.attachmentNote}</p>

              <p className="pt-2">
                <strong>Checklist de auditoria</strong>
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!detail.offerReviewMeta?.docMatchesName}
                  onChange={(e) =>
                    setDetail((d) => {
                      if (!d) return d
                      const cur =
                        d.offerReviewMeta && typeof d.offerReviewMeta === 'object'
                          ? { ...d.offerReviewMeta }
                          : {}
                      return {
                        ...d,
                        offerReviewMeta: { ...cur, docMatchesName: e.target.checked },
                      }
                    })
                  }
                />
                Documento confere com o nome?
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!detail.offerReviewMeta?.warmupOver7d}
                  onChange={(e) =>
                    setDetail((d) => {
                      if (!d) return d
                      const cur =
                        d.offerReviewMeta && typeof d.offerReviewMeta === 'object'
                          ? { ...d.offerReviewMeta }
                          : {}
                      return {
                        ...d,
                        offerReviewMeta: { ...cur, warmupOver7d: e.target.checked },
                      }
                    })
                  }
                />
                Aquecimento tem mais de 7 dias?
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!detail.offerReviewMeta?.cookiesImportedOk}
                  onChange={(e) =>
                    setDetail((d) => {
                      if (!d) return d
                      const cur =
                        d.offerReviewMeta && typeof d.offerReviewMeta === 'object'
                          ? { ...d.offerReviewMeta }
                          : {}
                      return {
                        ...d,
                        offerReviewMeta: { ...cur, cookiesImportedOk: e.target.checked },
                      }
                    })
                  }
                />
                Cookies importaram sem erro?
              </label>
              <button
                type="button"
                className="btn-primary text-sm py-1.5"
                onClick={() => {
                  if (!detail) return
                  const m = detail.offerReviewMeta && typeof detail.offerReviewMeta === 'object'
                    ? detail.offerReviewMeta
                    : {}
                  void saveReview(detail.id, {
                    docMatchesName: !!(m as { docMatchesName?: boolean }).docMatchesName,
                    warmupOver7d: !!(m as { warmupOver7d?: boolean }).warmupOver7d,
                    cookiesImportedOk: !!(m as { cookiesImportedOk?: boolean }).cookiesImportedOk,
                  })
                }}
              >
                Salvar checklist
              </button>

              <button
                type="button"
                className="btn-secondary text-sm w-full"
                onClick={() => void copyText(buildSaleCopy(detail))}
              >
                Gerar copy de venda (copiar)
              </button>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
