'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ChevronDown, ChevronRight, ClipboardList, Users, X } from 'lucide-react'
import { formatCnpjDisplay } from '@/lib/ads-core-utils'
import { labelVerificationTrack } from '@/lib/ads-core-verification-track'
import { labelAdsCoreStatusGerente } from '@/lib/ads-core-production-status'
import { AdsCoreAssetEditorModal } from './AdsCoreAssetEditorModal'

type AssetRow = {
  id: string
  nicheId: string
  nicheName: string
  cnpj: string
  razaoSocial: string | null
  statusProducao: string
  verificationTrack?: string | null
  producerId: string | null
  producerName: string | null
  producerEmail: string | null
  hasDocCnpj: boolean
  hasDocRgFrente: boolean
  hasDocRgVerso: boolean
  docReviewFlags: Record<string, string>
}

type ProducerOpt = { id: string; name: string | null; email: string | null; adsCoreOpenCount?: number }
type NicheOpt = { id: string; name: string }

type PendingItem = {
  producerId: string
  name: string | null
  email: string | null
  pendingCount: number
}

const DOC_TYPES = [
  { key: 'cnpj' as const, label: 'Cartão CNPJ', accept: 'application/pdf,image/*' },
  { key: 'rg-frente' as const, label: 'RG frente', accept: 'image/*,application/pdf' },
  { key: 'rg-verso' as const, label: 'RG verso', accept: 'image/*,application/pdf' },
]

const STATUS_STEPS = [
  { id: 'pool', label: 'Aguardando início (estoque)', match: (a: AssetRow) => !a.producerId && a.statusProducao === 'DISPONIVEL' },
  { id: 'assigned', label: 'Aguardando início (atribuído)', match: (a: AssetRow) => !!a.producerId && a.statusProducao === 'DISPONIVEL' },
  { id: 'em', label: 'Em produção', match: (a: AssetRow) => a.statusProducao === 'EM_PRODUCAO' },
  { id: 'g2', label: 'Verificação G2 iniciada', match: (a: AssetRow) => a.statusProducao === 'VERIFICACAO_G2' },
  { id: 'fim', label: 'Aprovado / Rejeitado', match: (a: AssetRow) => a.statusProducao === 'APROVADO' || a.statusProducao === 'REPROVADO' },
]

function statusLabel(s: string, assignedToProducer?: boolean) {
  return labelAdsCoreStatusGerente(s, { assignedToProducer })
}

function G2Timeline({ row }: { row: AssetRow }) {
  const stepIndex = STATUS_STEPS.findIndex((st) => st.match(row))
  const active = stepIndex >= 0 ? stepIndex : 0
  return (
    <div className="flex flex-wrap gap-2 items-center text-[11px]">
      {STATUS_STEPS.map((st, i) => (
        <div key={st.id} className="flex items-center gap-1">
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${
              i <= active
                ? 'bg-primary-600/30 text-primary-200 border border-primary-500/40'
                : 'bg-white/5 text-gray-500 border border-white/10'
            }`}
          >
            {st.label}
          </span>
          {i < STATUS_STEPS.length - 1 && <span className="text-gray-600">→</span>}
        </div>
      ))}
    </div>
  )
}

export function AdsCoreAtribuicaoClient() {
  const searchParams = useSearchParams()
  const [niches, setNiches] = useState<NicheOpt[]>([])
  const [producers, setProducers] = useState<ProducerOpt[]>([])
  const [pending, setPending] = useState<PendingItem[]>([])
  const [rows, setRows] = useState<AssetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [nicheId, setNicheId] = useState('')
  const [statusKey, setStatusKey] = useState<string>('all')
  const [producerFilter, setProducerFilter] = useState('')
  const [assignDraft, setAssignDraft] = useState<Record<string, string>>({})
  const [assignBusy, setAssignBusy] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [uploadBusy, setUploadBusy] = useState<string | null>(null)
  const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({})
  const [preview, setPreview] = useState<Record<string, { url: string; name: string; kind: 'img' | 'pdf' } | null>>(
    {}
  )
  const [rejectForId, setRejectForId] = useState<string | null>(null)
  const [rejectMotivo, setRejectMotivo] = useState('')
  const [decisionBusy, setDecisionBusy] = useState<string | null>(null)
  const [editAssetId, setEditAssetId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AssetRow | null>(null)
  const [deletePhrase, setDeletePhrase] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [producerMatrixByNicheId, setProducerMatrixByNicheId] = useState<
    Record<string, { restricted: boolean; producerIds: string[] }>
  >({})

  const loadRefs = useCallback(async () => {
    const [nRes, pRes, mRes, matrixRes] = await Promise.all([
      fetch('/api/ads-core/niches'),
      fetch('/api/admin/producers'),
      fetch('/api/ads-core/metrics/producer-pending'),
      fetch('/api/ads-core/niches/producer-restrictions-matrix'),
    ])
    const nData = await nRes.json()
    if (nRes.ok && Array.isArray(nData)) {
      setNiches(nData.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })))
    }
    const pJson = await pRes.json()
    if (pRes.ok && pJson?.users) setProducers(pJson.users)
    const mJson = await mRes.json()
    if (mRes.ok && Array.isArray(mJson?.items)) setPending(mJson.items)
    const mxJson = (await matrixRes.json()) as {
      byNicheId?: Record<string, { restricted: boolean; producerIds: string[] }>
    }
    if (matrixRes.ok && mxJson.byNicheId) setProducerMatrixByNicheId(mxJson.byNicheId)
  }, [])

  const producersOptionsForNiche = useCallback(
    (nid: string) => {
      const cfg = producerMatrixByNicheId[nid]
      if (!cfg?.restricted) return producers
      const allowed = new Set(cfg.producerIds)
      return producers.filter((p) => allowed.has(p.id))
    },
    [producers, producerMatrixByNicheId]
  )

  const assignmentStats = useMemo(() => {
    let semResponsavel = 0
    let atribuidoAguardandoInicio = 0
    for (const r of rows) {
      if (!r.producerId && r.statusProducao === 'DISPONIVEL') semResponsavel += 1
      else if (r.producerId && r.statusProducao === 'DISPONIVEL') atribuidoAguardandoInicio += 1
    }
    return { semResponsavel, atribuidoAguardandoInicio }
  }, [rows])

  const buildListUrl = useCallback(() => {
    const q = new URLSearchParams()
    if (nicheId) q.set('nicheId', nicheId)
    if (producerFilter) q.set('producerId', producerFilter)
    if (statusKey === 'estoque') q.set('assignmentFilter', 'estoque')
    else if (statusKey === 'atribuido') q.set('assignmentFilter', 'atribuido')
    else if (statusKey !== 'all') q.set('statusProducao', statusKey)
    q.set('take', '1000')
    return `/api/ads-core/assets?${q.toString()}`
  }, [nicheId, producerFilter, statusKey])

  const loadAssets = useCallback(async () => {
    setLoading(true)
    const res = await fetch(buildListUrl())
    const data = await res.json()
    if (res.ok && Array.isArray(data)) {
      setRows(
        data.map((x: AssetRow) => ({
          ...x,
          docReviewFlags: x.docReviewFlags && typeof x.docReviewFlags === 'object' ? x.docReviewFlags : {},
        }))
      )
    }
    setLoading(false)
  }, [buildListUrl])

  useEffect(() => {
    void loadRefs()
  }, [loadRefs])

  useEffect(() => {
    const q = searchParams.get('nicheId')?.trim()
    if (q) setNicheId(q)
  }, [searchParams])

  useEffect(() => {
    void loadAssets()
  }, [loadAssets])

  useEffect(() => {
    const highlightId = searchParams.get('highlightAsset')?.trim()
    if (!highlightId || loading) return
    if (!rows.some((r) => r.id === highlightId)) return
    setExpanded(highlightId)
    const timer = window.setTimeout(() => {
      document.getElementById(`ads-core-asset-row-${highlightId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 180)
    return () => window.clearTimeout(timer)
  }, [searchParams, loading, rows])

  async function assign(asset: AssetRow) {
    const pid = assignDraft[asset.id] ?? ''
    if (!pid) {
      alert('Selecione um produtor.')
      return
    }
    setAssignBusy(asset.id)
    try {
      const res = await fetch(`/api/ads-core/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ producerId: pid }),
      })
      const j = await res.json()
      if (!res.ok) {
        alert(j.error || 'Não foi possível atribuir.')
        return
      }
      await loadAssets()
      await loadRefs()
    } finally {
      setAssignBusy(null)
    }
  }

  async function patchAssetDecision(
    assetId: string,
    body: Record<string, unknown>
  ): Promise<boolean> {
    setDecisionBusy(assetId)
    try {
      const res = await fetch(`/api/ads-core/assets/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) {
        alert(j.error || 'Não foi possível atualizar o ativo.')
        return false
      }
      await loadAssets()
      return true
    } finally {
      setDecisionBusy(null)
    }
  }

  async function approveG2(assetId: string) {
    await patchAssetDecision(assetId, { statusProducao: 'APROVADO' })
  }

  async function confirmReject() {
    if (!rejectForId) return
    const m = rejectMotivo.trim()
    if (m.length < 5) {
      alert('Descreva o motivo da reprovação (mínimo 5 caracteres).')
      return
    }
    const ok = await patchAssetDecision(rejectForId, {
      statusProducao: 'REPROVADO',
      rejectionReason: m,
    })
    if (ok) {
      setRejectForId(null)
      setRejectMotivo('')
    }
  }

  async function allowProducerUrlEdit(assetId: string) {
    await patchAssetDecision(assetId, { producerSiteEditUnlocked: true })
  }

  async function saveReview(assetId: string, patch: Record<string, 'legivel' | 'rejeitado'>) {
    const res = await fetch(`/api/ads-core/assets/${assetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docReviewFlags: patch }),
    })
    if (!res.ok) {
      const j = await res.json()
      alert(j.error || 'Erro ao salvar revisão.')
      return
    }
    await loadAssets()
  }

  function onPickFile(assetId: string, docKey: 'cnpj' | 'rg-frente' | 'rg-verso', file: File | null) {
    const rk = `${assetId}:${docKey}`
    const prev = preview[rk]
    if (prev?.url) URL.revokeObjectURL(prev.url)
    if (!file) {
      setPendingFiles((p) => {
        const n = { ...p }
        delete n[rk]
        return n
      })
      setPreview((p) => ({ ...p, [rk]: null }))
      return
    }
    setPendingFiles((p) => ({ ...p, [rk]: file }))
    if (file.type === 'application/pdf') {
      setPreview((p) => ({ ...p, [rk]: { url: '', name: file.name, kind: 'pdf' } }))
      return
    }
    const url = URL.createObjectURL(file)
    setPreview((p) => ({ ...p, [rk]: { url, name: file.name, kind: 'img' } }))
  }

  async function uploadDoc(assetId: string, docType: 'cnpj' | 'rg-frente' | 'rg-verso') {
    const rk = `${assetId}:${docType}`
    const file = pendingFiles[rk]
    if (!file) {
      alert('Selecione um arquivo primeiro.')
      return
    }
    setUploadBusy(rk)
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('docType', docType)
      const res = await fetch(`/api/ads-core/assets/${assetId}/upload`, { method: 'POST', body: fd })
      const j = await res.json()
      if (!res.ok) {
        alert(j.error || 'Falha no upload.')
        return
      }
      setPendingFiles((p) => {
        const n = { ...p }
        delete n[rk]
        return n
      })
      const pr = preview[rk]
      if (pr?.url) URL.revokeObjectURL(pr.url)
      setPreview((p) => ({ ...p, [rk]: null }))
      await loadAssets()
    } finally {
      setUploadBusy(null)
    }
  }

  async function confirmDeleteAsset() {
    if (!deleteTarget || deletePhrase !== 'EXCLUIR') return
    setDeleteBusy(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/ads-core/assets/${deleteTarget.id}`, { method: 'DELETE' })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setDeleteError(j.error || 'Não foi possível excluir.')
        return
      }
      setDeleteTarget(null)
      setDeletePhrase('')
      setExpanded(null)
      await loadAssets()
      await loadRefs()
    } catch {
      setDeleteError('Erro de rede.')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="space-y-6 text-gray-100">
      {rejectForId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-900 p-5 shadow-2xl space-y-3">
            <div className="flex justify-between items-start gap-2">
              <h2 id="reject-modal-title" className="text-base font-semibold text-white">
                Reprovar ativo
              </h2>
              <button
                type="button"
                className="p-1 rounded hover:bg-white/10 text-gray-400"
                onClick={() => {
                  setRejectForId(null)
                  setRejectMotivo('')
                }}
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-400">
              O CNPJ fica bloqueado para novo cadastro (registro de compliance). O motivo aparece para o produtor no
              arquivo de reprovados.
            </p>
            <textarea
              className="input-field w-full text-sm min-h-[100px] bg-zinc-950 border-white/10"
              value={rejectMotivo}
              onChange={(e) => setRejectMotivo(e.target.value)}
              placeholder="Descreva o erro (documentação, site, incongruência…)"
              maxLength={8000}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => {
                  setRejectForId(null)
                  setRejectMotivo('')
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="text-sm px-3 py-2 rounded-lg bg-red-700 text-white hover:bg-red-600 disabled:opacity-50"
                disabled={decisionBusy === rejectForId}
                onClick={() => void confirmReject()}
              >
                Confirmar reprovação
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/dashboard/ads-core"
            className="text-xs text-primary-400 hover:underline mb-1 inline-block"
          >
            ← Voltar ao ADS CORE
          </Link>
          <h1 className="heading-1 flex items-center gap-2">
            <ClipboardList className="w-7 h-7 text-primary-400" />
            Estoque de ativos — atribuição nominal
          </h1>
          <p className="text-sm text-gray-400 mt-1 max-w-3xl">
            Central de atribuição: cada ativo já nasce com <strong className="text-gray-300">nicho</strong> (congruência
            com CNAE/rodapé) e <strong className="text-gray-300">meta de verificação</strong> (G2 + Anunciante ou
            Anunciante + Operações Comerciais).             A distribuição nominal é 1:1 — cada CNPJ tem um <strong className="text-gray-300">responsável</strong> rastreável;
            o produtor só enxerga o que foi atribuído a ele. O dropdown de atribuição respeita a{' '}
            <strong className="text-gray-300">Gestão por nicho</strong> (só especialistas habilitados). CNPJ e domínio são
            únicos (footprint). Use <strong className="text-gray-300">Editar</strong>{' '}
            para corrigir dados e <strong className="text-gray-300">Excluir</strong> com confirmação (o CNPJ permanece
            bloqueado para novo cadastro).
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-white/10 bg-zinc-900/80 p-4 shadow-lg">
        <h2 className="text-sm font-semibold text-primary-300 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Carga em aberto (Aguardando início + Em produção)
        </h2>
        <div className="flex flex-wrap gap-3">
          {pending.map((p) => (
            <div
              key={p.producerId}
              className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 min-w-[180px]"
            >
              <p className="text-xs text-gray-500">Produtor</p>
              <p className="text-sm font-medium text-white">{(p.name || p.email || '—').trim()}</p>
              <p className="text-lg font-semibold text-amber-300 mt-0.5">{p.pendingCount} ativos pendentes</p>
            </div>
          ))}
          {!pending.length && <p className="text-sm text-gray-500">Nenhum dado de carga.</p>}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-zinc-900/60 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nicho</label>
            <select
              className="input-field w-full text-sm bg-zinc-950 border-white/10"
              value={nicheId}
              onChange={(e) => setNicheId(e.target.value)}
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
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select
              className="input-field w-full text-sm bg-zinc-950 border-white/10"
              value={statusKey}
              onChange={(e) => setStatusKey(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="estoque">Pendente (estoque, sem produtor)</option>
              <option value="atribuido">Atribuído (aguardando início)</option>
              <option value="EM_PRODUCAO">Em produção</option>
              <option value="VERIFICACAO_G2">Verificação G2 iniciada</option>
              <option value="APROVADO">Aprovado</option>
              <option value="REPROVADO">Rejeitado</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Produtor (filtro)</label>
            <select
              className="input-field w-full text-sm bg-zinc-950 border-white/10"
              value={producerFilter}
              onChange={(e) => setProducerFilter(e.target.value)}
            >
              <option value="">Todos</option>
              {producers.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.name || p.email || p.id).trim()}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void loadAssets()}
              className="btn-secondary text-sm w-full md:w-auto"
            >
              Atualizar lista
            </button>
          </div>
        </div>
      </section>

      {!loading && rows.length > 0 && (
        <section
          className="rounded-xl border border-sky-500/25 bg-sky-950/20 px-4 py-3 text-sm text-sky-100/95"
          aria-label="Resumo de responsabilidade"
        >
          <p className="font-semibold text-sky-200 text-xs uppercase tracking-wide mb-2">
            Atribuição e responsabilidade (lista atual)
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <span>
              <strong className="font-mono text-amber-200">{assignmentStats.semResponsavel}</strong> no estoque{' '}
              <span className="text-gray-400">(sem produtor — definir responsável)</span>
            </span>
            <span>
              <strong className="font-mono text-sky-200">{assignmentStats.atribuidoAguardandoInicio}</strong> atribuídos
              aguardando início <span className="text-gray-400">(já há dono da demanda)</span>
            </span>
          </div>
        </section>
      )}

      <div className="rounded-xl border border-white/10 overflow-hidden bg-zinc-950/80">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/50 text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 w-8" />
                <th className="px-3 py-2">CNPJ / Razão</th>
                <th className="px-3 py-2">Nicho</th>
                <th className="px-3 py-2 min-w-[140px]">Meta verificação</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Responsável</th>
                <th className="px-3 py-2 min-w-[220px]">Atribuir</th>
                <th className="px-3 py-2 whitespace-nowrap">Gerir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                    Carregando…
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((r) => {
                  const open = expanded === r.id
                  const baseOpts = producersOptionsForNiche(r.nicheId)
                  const baseIds = new Set(baseOpts.map((p) => p.id))
                  const rowProducers =
                    r.producerId && !baseIds.has(r.producerId)
                      ? (() => {
                          const cur = producers.find((p) => p.id === r.producerId)
                          return cur ? [cur, ...baseOpts] : baseOpts
                        })()
                      : baseOpts
                  const nicheRestricted = !!producerMatrixByNicheId[r.nicheId]?.restricted
                  const semDono = !r.producerId && r.statusProducao === 'DISPONIVEL'
                  return (
                    <Fragment key={r.id}>
                      <tr
                        id={`ads-core-asset-row-${r.id}`}
                        className={`hover:bg-white/[0.03] ${semDono ? 'border-l-2 border-amber-500/55 bg-amber-500/[0.04]' : ''}`}
                      >
                        <td className="px-1 py-2">
                          <button
                            type="button"
                            aria-expanded={open}
                            onClick={() => setExpanded(open ? null : r.id)}
                            className="p-1 rounded text-gray-400 hover:text-white"
                          >
                            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          <div>{formatCnpjDisplay(r.cnpj)}</div>
                          <div className="text-gray-500 font-sans text-[11px] line-clamp-2">
                            {r.razaoSocial || '—'}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-300">{r.nicheName}</td>
                        <td className="px-3 py-2 text-[11px] text-gray-400 leading-snug max-w-[200px]">
                          {labelVerificationTrack(r.verificationTrack)}
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-xs text-gray-300">
                            {statusLabel(r.statusProducao, !!r.producerId)}
                          </span>
                          {!r.producerId && r.statusProducao === 'DISPONIVEL' && (
                            <span className="block text-[10px] text-amber-400/90">Estoque</span>
                          )}
                          {r.producerId && r.statusProducao === 'DISPONIVEL' && (
                            <span className="block text-[10px] text-sky-400/90">Atribuído</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {r.producerId ? (
                            <span className="text-gray-200 font-medium">
                              {(r.producerName || r.producerEmail || r.producerId).trim()}
                            </span>
                          ) : (
                            <span className="text-amber-300/95 font-medium">Sem responsável</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap gap-2 items-center">
                              <select
                                className="input-field text-xs py-1 min-w-[160px] bg-zinc-900 border-white/10"
                                value={assignDraft[r.id] ?? r.producerId ?? ''}
                                onChange={(e) =>
                                  setAssignDraft((d) => ({ ...d, [r.id]: e.target.value }))
                                }
                              >
                                <option value="">Produtor…</option>
                                {rowProducers.map((p) => {
                                  const label = (p.name || p.email || p.id).trim()
                                  const n = p.adsCoreOpenCount ?? 0
                                  return (
                                    <option key={p.id} value={p.id}>
                                      {label} — {n} {n === 1 ? 'na esteira' : 'na esteira'}
                                    </option>
                                  )
                                })}
                              </select>
                              <button
                                type="button"
                                disabled={assignBusy === r.id}
                                onClick={() => void assign(r)}
                                className="btn-primary text-xs py-1 px-2"
                              >
                                {assignBusy === r.id ? '…' : 'Atribuir'}
                              </button>
                            </div>
                            {nicheRestricted && rowProducers.length === 0 && (
                              <p className="text-[10px] text-amber-400/90 max-w-[220px] leading-snug">
                                Nenhum produtor habilitado para este nicho. Ajuste em{' '}
                                <Link href="/dashboard/ads-core/nichos" className="underline">
                                  Gestão por nicho
                                </Link>
                                .
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex flex-col gap-1.5">
                            <button
                              type="button"
                              className="text-left text-xs px-2 py-1 rounded-md bg-white/5 text-primary-300 border border-white/10 hover:bg-white/10"
                              onClick={() => setEditAssetId(r.id)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="text-left text-xs px-2 py-1 rounded-md bg-red-950/50 text-red-200 border border-red-900/40 hover:bg-red-950/80"
                              onClick={() => {
                                setDeleteTarget(r)
                                setDeletePhrase('')
                                setDeleteError('')
                              }}
                            >
                              Excluir…
                            </button>
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-black/30">
                          <td colSpan={8} className="px-4 py-4 space-y-4">
                            <div className="flex flex-wrap gap-2 pb-3 border-b border-white/10">
                              <button
                                type="button"
                                className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 text-white border border-white/10 hover:bg-slate-600"
                                onClick={() => setEditAssetId(r.id)}
                              >
                                Editar cadastro completo
                              </button>
                              <button
                                type="button"
                                className="text-xs px-3 py-1.5 rounded-lg bg-red-950/70 text-red-100 border border-red-800/50 hover:bg-red-900/80"
                                onClick={() => {
                                  setDeleteTarget(r)
                                  setDeletePhrase('')
                                  setDeleteError('')
                                }}
                              >
                                Excluir ativo…
                              </button>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-primary-300 mb-2">Linha do tempo G2</p>
                              <G2Timeline row={r} />
                            </div>
                            {r.statusProducao === 'VERIFICACAO_G2' && (
                              <div className="rounded-lg border border-amber-500/35 bg-amber-950/35 p-3 space-y-2">
                                <p className="text-xs font-medium text-amber-200">Decisão pós-G2 (auditoria)</p>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={decisionBusy === r.id}
                                    onClick={() => void approveG2(r.id)}
                                    className="text-xs px-3 py-1.5 rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-50"
                                  >
                                    Aprovar conta
                                  </button>
                                  <button
                                    type="button"
                                    disabled={decisionBusy === r.id}
                                    onClick={() => {
                                      setRejectForId(r.id)
                                      setRejectMotivo('')
                                    }}
                                    className="text-xs px-3 py-1.5 rounded-lg bg-red-900/80 text-red-100 border border-red-700/50 hover:bg-red-800/80 disabled:opacity-50"
                                  >
                                    Reprovar…
                                  </button>
                                </div>
                              </div>
                            )}
                            {r.statusProducao === 'APROVADO' && (
                              <div className="rounded-lg border border-sky-500/30 bg-sky-950/25 p-3">
                                <p className="text-xs font-medium text-sky-200 mb-2">Suporte / re-verificação</p>
                                <button
                                  type="button"
                                  disabled={decisionBusy === r.id}
                                  onClick={() => void allowProducerUrlEdit(r.id)}
                                  className="text-xs px-3 py-1.5 rounded-lg bg-sky-800 text-white hover:bg-sky-700 disabled:opacity-50"
                                >
                                  Reabrir edição de URL para o produtor
                                </button>
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-medium text-primary-300 mb-2">
                                Documentos — upload e checklist
                              </p>
                              <p className="text-[10px] text-gray-500 mb-2 leading-relaxed">
                                Imagens passam por higienização no servidor (metadados EXIF removidos, formato preservado)
                                para reduzir footprint e peso antes do armazenamento seguro.
                              </p>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {DOC_TYPES.map((dt) => {
                                  const rk = `${r.id}:${dt.key}`
                                  const pr = preview[rk]
                                  const flag = r.docReviewFlags?.[dt.key]
                                  const hasDoc =
                                    dt.key === 'cnpj'
                                      ? r.hasDocCnpj
                                      : dt.key === 'rg-frente'
                                        ? r.hasDocRgFrente
                                        : r.hasDocRgVerso
                                  return (
                                    <div
                                      key={dt.key}
                                      className="rounded-lg border border-white/10 p-3 space-y-2 bg-zinc-900/50"
                                    >
                                      <p className="text-xs font-medium text-gray-300">{dt.label}</p>
                                      <p className="text-[10px] text-gray-500">
                                        Enviado: {hasDoc ? 'sim' : 'não'}
                                      </p>
                                      <input
                                        type="file"
                                        accept={dt.accept}
                                        className="text-[11px] w-full text-gray-400 file:mr-2 file:rounded file:border-0 file:bg-primary-600 file:px-2 file:py-1 file:text-white"
                                        onChange={(e) => {
                                          const f = e.target.files?.[0]
                                          onPickFile(r.id, dt.key, f ?? null)
                                        }}
                                      />
                                      {pr?.kind === 'img' && pr.url && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={pr.url}
                                          alt=""
                                          className="max-h-32 rounded border border-white/10 object-contain"
                                        />
                                      )}
                                      {pr?.kind === 'pdf' && (
                                        <p className="text-[10px] text-gray-500 truncate">{pr.name}</p>
                                      )}
                                      <button
                                        type="button"
                                        disabled={!pendingFiles[rk] || uploadBusy === rk}
                                        onClick={() => void uploadDoc(r.id, dt.key)}
                                        className="text-xs btn-secondary py-1 w-full opacity-90"
                                      >
                                        {uploadBusy === rk ? 'Enviando…' : 'Enviar arquivo'}
                                      </button>
                                      <div className="flex gap-1 pt-1">
                                        <button
                                          type="button"
                                          className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-200 border border-emerald-700/40"
                                          onClick={() =>
                                            void saveReview(r.id, {
                                              [dt.key]: 'legivel',
                                            })
                                          }
                                        >
                                          Legível
                                        </button>
                                        <button
                                          type="button"
                                          className="text-[10px] px-2 py-0.5 rounded bg-red-900/40 text-red-200 border border-red-700/40"
                                          onClick={() =>
                                            void saveReview(r.id, {
                                              [dt.key]: 'rejeitado',
                                            })
                                          }
                                        >
                                          Rejeitar
                                        </button>
                                      </div>
                                      {flag && (
                                        <p className="text-[10px] text-amber-300/90">
                                          Checklist: {flag === 'legivel' ? 'Legível' : 'Rejeitado — novo upload'}
                                        </p>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
            </tbody>
          </table>
        </div>
        {!loading && rows.length === 0 && (
          <p className="text-center text-gray-500 py-8 text-sm">Nenhum ativo com os filtros atuais.</p>
        )}
      </div>

      <AdsCoreAssetEditorModal
        open={!!editAssetId}
        assetId={editAssetId}
        niches={niches}
        producers={producers}
        onClose={() => setEditAssetId(null)}
        onSaved={() => void loadAssets()}
      />

      {deleteTarget && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-asset-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-red-900/40 bg-zinc-950 p-5 shadow-2xl space-y-3">
            <div className="flex justify-between items-start gap-2">
              <h2 id="delete-asset-title" className="text-base font-semibold text-red-200">
                Excluir ativo
              </h2>
              <button
                type="button"
                className="p-1 rounded hover:bg-white/10 text-gray-400"
                onClick={() => {
                  if (!deleteBusy) {
                    setDeleteTarget(null)
                    setDeletePhrase('')
                    setDeleteError('')
                  }
                }}
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-300">
              <span className="font-mono text-primary-300">{formatCnpjDisplay(deleteTarget.cnpj)}</span>
              <span className="block mt-1 text-xs text-gray-400">
                {deleteTarget.razaoSocial || 'Sem razão social'}
              </span>
            </p>
            <ul className="text-xs text-gray-400 space-y-1 list-disc pl-4">
              <li>O registro do ativo será removido. O CNPJ continua bloqueado para novo cadastro (política anti-footprint).</li>
              <li>
                Pares de RG vinculados: se o ativo ainda estava em estoque ou produção, o par volta ao estoque; em fase G2
                aprovada/reprovada ou em verificação, o par permanece marcado como utilizado no sistema.
              </li>
            </ul>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Digite <span className="font-mono text-amber-300">EXCLUIR</span> para confirmar
              </label>
              <input
                className="input-field w-full text-sm bg-zinc-900 border-white/10 font-mono"
                value={deletePhrase}
                onChange={(e) => setDeletePhrase(e.target.value)}
                placeholder="EXCLUIR"
                autoComplete="off"
              />
            </div>
            {deleteError && (
              <p className="text-sm text-red-400" role="alert">
                {deleteError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={deleteBusy}
                onClick={() => {
                  setDeleteTarget(null)
                  setDeletePhrase('')
                  setDeleteError('')
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="text-sm px-3 py-2 rounded-lg bg-red-700 text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={deleteBusy || deletePhrase !== 'EXCLUIR'}
                onClick={() => void confirmDeleteAsset()}
              >
                {deleteBusy ? 'Excluindo…' : 'Excluir definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
