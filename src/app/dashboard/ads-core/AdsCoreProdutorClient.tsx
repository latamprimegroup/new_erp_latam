'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Check, ShieldCheck, Shuffle, X, Download, Loader2, ExternalLink } from 'lucide-react'
import { AdsCoreDocumentPanel } from './AdsCoreDocumentPanel'
import { ADS_CORE_DUPLICATE_MSG, formatCnpjDisplay } from '@/lib/ads-core-utils'
import { labelVerificationTrack } from '@/lib/ads-core-verification-track'
import { labelAdsCoreStatusProducao } from '@/lib/ads-core-production-status'

type Asset = {
  id: string
  nicheId: string
  nicheName: string
  briefingInstructions: string | null
  cnpj: string
  razaoSocial: string | null
  nomeFantasia: string | null
  endereco: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  nomeSocio: string | null
  cpfSocio: string | null
  dataNascimentoSocio: string | null
  emailEmpresa: string | null
  telefone: string | null
  cnae: string | null
  cnaeDescricao: string | null
  statusReceita: string
  siteUrl: string | null
  congruenciaCheck?: boolean
  statusProducao: string
  /** Meta da demanda (G2 + Anunciante vs Ops Comerciais) */
  verificationTrack?: string
  g2ProducerObservacoes?: string | null
  producerSiteEditUnlocked?: boolean
  rejectionReason?: string | null
  hasDocCnpj: boolean
  hasDocRgFrente: boolean
  hasDocRgVerso: boolean
}

const WORKING = new Set(['DISPONIVEL', 'EM_PRODUCAO'])

function statusLabel(s: string) {
  return labelAdsCoreStatusProducao(s)
}

function formatCpfDisplay(digits: string): string {
  const d = digits.replace(/\D/g, '')
  if (d.length !== 11) return digits || '—'
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function buildEnderecoCompleto(a: Asset): string {
  const parts = [
    [a.logradouro, a.numero].filter(Boolean).join(', '),
    a.bairro,
    [a.cidade, a.estado].filter(Boolean).join(' / '),
    a.cep ? `CEP ${a.cep}` : null,
  ].filter(Boolean)
  if (parts.length) return parts.join(' — ')
  return a.endereco?.trim() || ''
}

/** Texto único para colar no rodapé do site (alinhado ao cartão CNPJ / faturamento). */
function buildRodapeSiteText(a: Asset): string {
  const cnpjFmt = formatCnpjDisplay(a.cnpj)
  const lines = [
    a.razaoSocial?.trim(),
    cnpjFmt ? `CNPJ: ${cnpjFmt}` : null,
    buildEnderecoCompleto(a) || null,
    a.emailEmpresa?.trim() ? `E-mail: ${a.emailEmpresa.trim()}` : null,
  ].filter(Boolean) as string[]
  return lines.join('\n')
}

type WorkQueue = 'ativos' | 'em_g2' | 'historico' | 'reprovados' | 'todos'

export function AdsCoreProdutorClient() {
  const [allList, setAllList] = useState<Asset[]>([])
  const [filterNicheId, setFilterNicheId] = useState('')
  const [workQueue, setWorkQueue] = useState<WorkQueue>('ativos')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [siteEdit, setSiteEdit] = useState('')
  const [siteUnique, setSiteUnique] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle')
  const [urlCheckMessage, setUrlCheckMessage] = useState('')
  const [siteSaveError, setSiteSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [producerGoal, setProducerGoal] = useState<{
    hasGoal: boolean
    productionCurrent: number
    monthlyTarget: number | null
    dailyTarget: number | null
  } | null>(null)
  const [sortearRgBusy, setSortearRgBusy] = useState(false)
  const [docDownloadBusy, setDocDownloadBusy] = useState<'cnpj' | 'rg-frente' | 'rg-verso' | null>(null)

  const [g2ModalOpen, setG2ModalOpen] = useState(false)
  const [g2Url, setG2Url] = useState('')
  const [g2Obs, setG2Obs] = useState('')
  const [g2EmailCartao, setG2EmailCartao] = useState(false)
  const [g2EnderecoSite, setG2EnderecoSite] = useState(false)
  const [g2RgQsa, setG2RgQsa] = useState(false)

  const load = useCallback(async (): Promise<Asset[] | null> => {
    setLoading(true)
    try {
      const pageSize = 120
      const merged: Asset[] = []
      let page = 1
      let totalPages = 1
      do {
        const res = await fetch(
          `/api/ads-core/assets?paginated=1&page=${page}&pageSize=${pageSize}`
        )
        const data = await res.json()
        if (!res.ok) {
          setLoading(false)
          return null
        }
        if (Array.isArray(data)) {
          merged.push(...(data as Asset[]))
          break
        }
        const env = data as { items: Asset[]; totalPages: number }
        merged.push(...(env.items || []))
        totalPages = Math.max(1, env.totalPages || 1)
        page += 1
      } while (page <= totalPages)

      setAllList(merged)
      setSelectedId((prev) => {
        if (prev && merged.some((x) => x.id === prev)) return prev
        return merged[0]?.id ?? null
      })
      setLoading(false)
      return merged
    } catch {
      setLoading(false)
      return null
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await fetch('/api/ads-core/metrics/producer-goal')
      const j = await res.json()
      if (!cancelled && res.ok && j && typeof j.productionCurrent === 'number') {
        setProducerGoal({
          hasGoal: !!j.hasGoal,
          productionCurrent: j.productionCurrent,
          monthlyTarget: j.monthlyTarget ?? null,
          dailyTarget: j.dailyTarget ?? null,
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const nicheFiltered = useMemo(() => {
    if (!filterNicheId) return allList
    return allList.filter((a) => a.nicheId === filterNicheId)
  }, [allList, filterNicheId])

  const list = useMemo(() => {
    if (workQueue === 'todos') return nicheFiltered
    if (workQueue === 'ativos') return nicheFiltered.filter((a) => WORKING.has(a.statusProducao))
    if (workQueue === 'em_g2') return nicheFiltered.filter((a) => a.statusProducao === 'VERIFICACAO_G2')
    if (workQueue === 'historico') return nicheFiltered.filter((a) => a.statusProducao === 'APROVADO')
    return nicheFiltered.filter((a) => a.statusProducao === 'REPROVADO')
  }, [nicheFiltered, workQueue])

  const nicheFilterOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of allList) {
      if (!m.has(a.nicheId)) m.set(a.nicheId, a.nicheName)
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [allList])

  const openCountInFilter = useMemo(
    () => nicheFiltered.filter((a) => WORKING.has(a.statusProducao)).length,
    [nicheFiltered]
  )

  /** Metas visíveis no briefing operacional: contagem por nicho × tipo de verificação (todos os ativos atribuídos). */
  const openBreakdownByNicheAndTrack = useMemo(() => {
    const open = allList.filter((a) => WORKING.has(a.statusProducao))
    const m = new Map<string, { nicheId: string; nicheName: string; track: string; count: number }>()
    for (const a of open) {
      const track = a.verificationTrack || 'G2_ANUNCIANTE'
      const key = `${a.nicheId}\t${track}`
      const cur = m.get(key)
      if (cur) cur.count += 1
      else m.set(key, { nicheId: a.nicheId, nicheName: a.nicheName, track, count: 1 })
    }
    return [...m.values()].sort(
      (x, y) => y.count - x.count || x.nicheName.localeCompare(y.nicheName, 'pt-BR')
    )
  }, [allList])

  const totalOpenAssigned = useMemo(
    () => allList.filter((a) => WORKING.has(a.statusProducao)).length,
    [allList]
  )

  const filterNicheLabel = useMemo(() => {
    if (!filterNicheId) return 'todos os nichos atribuídos'
    return nicheFilterOptions.find(([id]) => id === filterNicheId)?.[1] ?? 'nicho selecionado'
  }, [filterNicheId, nicheFilterOptions])

  useEffect(() => {
    setSelectedId((prev) => {
      if (prev && list.some((x) => x.id === prev)) return prev
      return list[0]?.id ?? null
    })
  }, [list])

  const selected = list.find((a) => a.id === selectedId) || null

  useEffect(() => {
    if (selected) setSiteEdit(selected.siteUrl || '')
  }, [selected])

  useEffect(() => {
    setSiteUnique('idle')
    setUrlCheckMessage('')
  }, [selectedId])

  const checkSiteUniqueNow = useCallback(async () => {
    if (!selectedId) return
    const current = siteEdit.trim()
    if (!current) {
      setSiteUnique('idle')
      setUrlCheckMessage('')
      return
    }
    setSiteUnique('checking')
    setUrlCheckMessage('')
    const q = new URLSearchParams()
    q.set('siteUrl', current)
    q.set('excludeAssetId', selectedId)
    try {
      const res = await fetch(`/api/ads-core/assets/check-unique?${q.toString()}`)
      const j = (await res.json()) as { available?: boolean; message?: string }
      const ok = res.ok && j.available
      if (!ok) {
        const msg = j.message || ADS_CORE_DUPLICATE_MSG
        setSiteUnique('taken')
        setUrlCheckMessage(msg)
        return
      }
      setSiteUnique('ok')
      setUrlCheckMessage('')
    } catch {
      setSiteUnique('idle')
      setUrlCheckMessage('')
    }
  }, [selectedId, siteEdit])

  async function auditCopy(field: string, value: string) {
    if (!selectedId) return
    try {
      await fetch(`/api/ads-core/assets/${selectedId}/audit-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field }),
      })
      await navigator.clipboard.writeText(value)
      setCopied(field)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      alert('Não foi possível copiar')
    }
  }

  async function saveSite() {
    if (!selectedId) return
    if (siteUnique === 'taken') {
      setSiteSaveError(
        urlCheckMessage ||
          'Este domínio ou URL já está em uso por outro ativo ou colaborador. Escolha outro para evitar cruzamento de dados.'
      )
      return
    }
    setSiteSaveError('')
    setSaving(true)
    const res = await fetch(`/api/ads-core/assets/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteUrl: siteEdit || null }),
    })
    setSaving(false)
    if (res.ok) {
      await load()
      setSiteSaveError('')
    } else {
      const e = (await res.json()) as { error?: string }
      const raw = e.error || 'Não foi possível salvar a URL.'
      setSiteSaveError(raw)
      alert(raw)
    }
  }

  async function sortearRg() {
    if (!selectedId) return
    setSortearRgBusy(true)
    try {
      const res = await fetch(`/api/ads-core/assets/${selectedId}/sortear-rg`, { method: 'POST' })
      const j = await res.json()
      if (!res.ok) {
        alert(j.error || 'Não foi possível sortear RG')
        return
      }
      await load()
    } finally {
      setSortearRgBusy(false)
    }
  }

  function parseDocFilename(cd: string | null): string | null {
    if (!cd) return null
    const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd)
    return m ? decodeURIComponent(m[1].trim()) : null
  }

  async function downloadDocumentFile(tipo: 'cnpj' | 'rg-frente' | 'rg-verso') {
    if (!selectedId || !selected) return
    const has =
      tipo === 'cnpj'
        ? selected.hasDocCnpj
        : tipo === 'rg-frente'
          ? selected.hasDocRgFrente
          : selected.hasDocRgVerso
    if (!has) return
    setDocDownloadBusy(tipo)
    try {
      const res = await fetch(`/api/ads-core/assets/${selectedId}/document/${tipo}/download`, {
        credentials: 'include',
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        alert(j.error || 'Download não autorizado')
        return
      }
      const blob = await res.blob()
      const fallback =
        tipo === 'cnpj' ? 'cartao-cnpj.pdf' : tipo === 'rg-frente' ? 'rg-frente' : 'rg-verso'
      const fname = parseDocFilename(res.headers.get('Content-Disposition')) || fallback
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = fname
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      alert('Falha no download')
    } finally {
      setDocDownloadBusy(null)
    }
  }

  async function saveStatus(statusProducao: string) {
    if (!selectedId) return
    setSaving(true)
    const res = await fetch(`/api/ads-core/assets/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusProducao }),
    })
    setSaving(false)
    if (res.ok) void load()
    else {
      const e = await res.json()
      alert(e.error || 'Erro')
    }
  }

  function openG2Modal() {
    if (!selected) return
    setG2Url(siteEdit.trim() || selected.siteUrl || '')
    setG2Obs('')
    setG2EmailCartao(false)
    setG2EnderecoSite(false)
    setG2RgQsa(false)
    setG2ModalOpen(true)
  }

  async function confirmG2Modal() {
    if (!selectedId) return
    if (!g2EmailCartao || !g2EnderecoSite || !g2RgQsa) {
      alert('Marque os três itens do checklist de conformidade G2 antes de enviar.')
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        statusProducao: 'VERIFICACAO_G2',
        g2ChecklistEmailCartao: g2EmailCartao,
        g2ChecklistEnderecoSite: g2EnderecoSite,
        g2ChecklistRgQsa: g2RgQsa,
        g2ProducerObservacoes: g2Obs.trim() || null,
      }
      if (g2Url.trim()) {
        body.siteUrl = g2Url.trim()
      }
      const res = await fetch(`/api/ads-core/assets/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) {
        alert(j.error || 'Erro ao finalizar')
        return
      }
      setG2ModalOpen(false)
      const cur = selectedId
      await load()
      setWorkQueue('em_g2')
      setSelectedId(cur)
    } finally {
      setSaving(false)
    }
  }

  function FieldRow({
    label,
    field,
    value,
    mono,
  }: {
    label: string
    field: string
    value: string
    mono?: boolean
  }) {
    return (
      <div className="flex gap-2 items-start py-2 border-b border-gray-200/80 dark:border-white/10 last:border-0">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
          <p
            className={`text-sm text-gray-900 dark:text-gray-100 ${mono ? 'font-mono break-all' : ''}`}
          >
            {value || '—'}
          </p>
        </div>
        <button
          type="button"
          disabled={!value}
          onClick={() => auditCopy(field, value)}
          className="shrink-0 p-1.5 rounded text-primary-600 dark:text-primary-400 hover:bg-primary-500/15 disabled:opacity-40"
          title="Copiar"
        >
          {copied === field ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    )
  }

  if (loading) {
    return <p className="text-gray-500">Carregando seus ativos…</p>
  }

  if (allList.length === 0) {
    return (
      <p className="text-gray-600 dark:text-gray-400">
        Nenhum ativo atribuído a você. O gerente distribui ativos na visão administrativa.
      </p>
    )
  }

  if (list.length === 0 && allList.length > 0) {
    return (
      <div className="space-y-3">
        <p className="text-gray-600 dark:text-gray-400">
          Nenhum ativo neste filtro. Ajuste a fila, o nicho ou aguarde nova atribuição.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={() => setWorkQueue('todos')}>
            Ver todos os ativos
          </button>
        </div>
      </div>
    )
  }

  const readOnlyStrict =
    !!selected &&
    (selected.statusProducao === 'APROVADO' || selected.statusProducao === 'REPROVADO') &&
    !selected.producerSiteEditUnlocked
  const siteReopenMode =
    !!selected &&
    (selected.statusProducao === 'APROVADO' || selected.statusProducao === 'REPROVADO') &&
    !!selected.producerSiteEditUnlocked

  const siteDirty =
    !!selected && !readOnlyStrict && siteEdit !== (selected.siteUrl || '')
  const enderecoCompleto = selected ? buildEnderecoCompleto(selected) : ''
  const rodapeSiteText = selected ? buildRodapeSiteText(selected) : ''
  const cpfSocioFmt = selected?.cpfSocio ? formatCpfDisplay(selected.cpfSocio) : ''
  const dataNascFmt = selected?.dataNascimentoSocio
    ? new Date(selected.dataNascimentoSocio).toLocaleDateString('pt-BR')
    : ''

  return (
    <div className="relative pb-24 min-h-[calc(100vh-10rem)]">
      {g2ModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="g2-modal-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-zinc-900 text-gray-100 shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-start gap-2">
              <h2 id="g2-modal-title" className="text-lg font-semibold text-white">
                Finalizar verificação G2
              </h2>
              <button
                type="button"
                className="p-1 rounded hover:bg-white/10 text-gray-400"
                onClick={() => !saving && setG2ModalOpen(false)}
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-400">
              Confirme a URL final da estrutura e as observações. O status passará para Verificação G2 iniciada.
            </p>
            <div>
              <label className="block text-xs text-gray-500 mb-1">URL final da estrutura / landing</label>
              <input
                type="url"
                className="input-field w-full text-sm bg-zinc-950 border-white/10"
                value={g2Url}
                onChange={(e) => setG2Url(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Observações (opcional)</label>
              <textarea
                className="input-field w-full text-sm min-h-[88px] bg-zinc-950 border-white/10 resize-y"
                value={g2Obs}
                onChange={(e) => setG2Obs(e.target.value)}
                placeholder="Notas para auditoria interna…"
                maxLength={8000}
              />
            </div>
            <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-950/40 p-3">
              <p className="text-xs font-medium text-amber-200">Checklist de conformidade G2</p>
              <p className="text-[11px] text-amber-100/80 leading-snug">
                Confirme cada item só após conferir o PDF/imagem do cartão CNPJ, o site publicado e o RG — o ERP
                registra o aceite para auditoria.
              </p>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 rounded border-gray-500"
                  checked={g2EmailCartao}
                  onChange={(e) => setG2EmailCartao(e.target.checked)}
                />
                <span>O e-mail no cartão CNPJ é o mesmo do cadastro (Receita / ERP)?</span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 rounded border-gray-500"
                  checked={g2EnderecoSite}
                  onChange={(e) => setG2EnderecoSite(e.target.checked)}
                />
                <span>O endereço exibido no site coincide com o da Receita Federal?</span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 rounded border-gray-500"
                  checked={g2RgQsa}
                  onChange={(e) => setG2RgQsa(e.target.checked)}
                />
                <span>
                  O RG pertence a um sócio administrador listado no QSA do CNPJ (e bate com nome/CPF cadastrados)?
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={saving}
                onClick={() => setG2ModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary text-sm inline-flex items-center gap-2"
                disabled={saving || !g2EmailCartao || !g2EnderecoSite || !g2RgQsa}
                onClick={() => void confirmG2Modal()}
              >
                <ShieldCheck className="w-4 h-4" />
                {saving ? 'Enviando…' : 'Confirmar e enviar G2'}
              </button>
            </div>
          </div>
        </div>
      )}

      {allList.length > 0 && openBreakdownByNicheAndTrack.length > 0 && (
        <div
          className="mb-4 rounded-xl border border-primary-500/45 bg-primary-950/20 px-4 py-3 space-y-2"
          role="region"
          aria-label="Metas de produção por nicho e tipo"
        >
          <p className="text-[10px] uppercase tracking-wide text-primary-300/90">Central de dados — suas metas em aberto</p>
          <p className="text-sm text-gray-200">
            Total atribuído em aberto:{' '}
            <strong className="text-primary-300 font-mono tabular-nums">{totalOpenAssigned}</strong> conta(s) (pendente
            ou em produção), somando todos os nichos.
          </p>
          <ul className="space-y-2 pt-1">
            {openBreakdownByNicheAndTrack.map((row) => (
              <li
                key={`${row.nicheId}-${row.track}`}
                className="text-sm text-gray-100 rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 leading-snug"
              >
                Você tem <strong className="text-primary-300 font-mono tabular-nums">{row.count}</strong> conta(s) para
                produzir: nicho <strong>{row.nicheName}</strong> — tipo{' '}
                <strong>{labelVerificationTrack(row.track)}</strong>.
              </li>
            ))}
          </ul>
        </div>
      )}

      {allList.length > 0 && (
        <div
          className="mb-4 rounded-xl border border-amber-500/35 bg-amber-950/20 px-4 py-3 text-xs text-amber-100/95"
          role="note"
        >
          <p className="font-semibold text-amber-200">Contingência de infraestrutura (regra de ouro)</p>
          <p className="mt-1 text-amber-100/85 leading-relaxed">
            Use navegador de perfil isolado (ex.: AdsPower, Dolphin) e proxy residencial dedicado por conta. Não acesse
            duas contas de anúncio no mesmo IP na mesma sessão — reduz risco de associação e reprovação.
          </p>
        </div>
      )}

      {allList.length > 0 && (
        <div className="mb-4 rounded-xl border border-white/10 bg-zinc-900/40 px-4 py-3 text-sm text-gray-200">
          <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Resumo da sua fila (filtro atual)</p>
          <p>
            Você tem{' '}
            <strong className="text-primary-400 font-mono tabular-nums">{openCountInFilter}</strong> ativo(s) em aberto
            (pendente ou em produção){' '}
            {filterNicheId ? (
              <>
                no nicho <strong>{filterNicheLabel}</strong>
              </>
            ) : (
              <>em <strong>{filterNicheLabel}</strong></>
            )}
            .
          </p>
          {selected && (
            <p className="mt-1 text-xs text-gray-400">
              Ativo selecionado — tipo:{' '}
              <strong className="text-gray-200">{labelVerificationTrack(selected.verificationTrack)}</strong>
            </p>
          )}
        </div>
      )}

      {selected && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-primary-500/50 bg-gradient-to-br from-primary-500/15 to-zinc-900/40 px-4 py-4 shadow-lg shadow-primary-900/20">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-primary-600 dark:text-primary-300 font-bold">
              {filterNicheId ? 'Congruência — nicho filtrado' : 'Congruência — nicho da conta (destaque)'}
            </p>
            <p className="text-2xl sm:text-3xl font-bold text-primary-600 dark:text-primary-300 tracking-tight leading-tight mt-1">
              {selected.nicheName}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 leading-relaxed max-w-xl">
              Produza alinhado a este nicho: use o briefing do visualizador e respeite a política de anúncios / CNAE
              acordados para esta célula. Dados e site devem permanecer coerentes com o cartão CNPJ e a verificação G2.
            </p>
            {filterNicheId && (
              <p className="text-[11px] text-primary-700/90 dark:text-primary-300/90 mt-1.5">
                Lista filtrada só para este nicho — reduz erro de contexto entre células.
              </p>
            )}
            <p className="text-sm text-gray-700 dark:text-gray-200 mt-2">
              Meta de produção:{' '}
              <span className="font-semibold text-primary-700 dark:text-primary-300">
                {labelVerificationTrack(selected.verificationTrack)}
              </span>
            </p>
            {producerGoal && producerGoal.hasGoal && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Meta ativa: <strong className="font-mono">{producerGoal.productionCurrent}</strong>
                {producerGoal.monthlyTarget != null && (
                  <>
                    {' '}
                    / <span className="font-mono">{producerGoal.monthlyTarget}</span> (mensal)
                  </>
                )}
                {producerGoal.dailyTarget != null && (
                  <span className="ml-2">
                    · diária: <span className="font-mono">{producerGoal.dailyTarget}</span>
                  </span>
                )}
              </p>
            )}
          </div>
          <p className="text-xs text-gray-500 max-w-md">
            Auditoria ativa: cópias e abas de documento são registradas. Histórico e reprovados permanecem visíveis para
            suporte pós-entrega.
          </p>
        </div>
      )}

      {selected && siteReopenMode && (
        <div
          className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-gray-800 dark:text-gray-100"
          role="status"
        >
          <p className="font-medium text-amber-900 dark:text-amber-200">Demanda reaberta pelo gerente</p>
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
            Apenas a URL do site pode ser alterada. Demais ações permanecem bloqueadas até nova definição de status.
          </p>
        </div>
      )}

      {selected && readOnlyStrict && (
        <div
          className="mb-4 rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-gray-800 dark:text-gray-100"
          role="status"
        >
          <p className="font-medium text-sky-800 dark:text-sky-200">Somente leitura</p>
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
            Você pode consultar e copiar dados e documentos. Para alterar URL ou refazer a linha, o gerente deve reabrir
            a demanda.
          </p>
          {selected.statusProducao === 'REPROVADO' && selected.rejectionReason && (
            <p className="text-xs mt-2 p-2 rounded-lg bg-red-950/40 border border-red-500/30 text-red-100">
              <span className="font-semibold">Motivo da reprovação: </span>
              {selected.rejectionReason}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col xl:flex-row gap-6 xl:items-stretch min-h-[min(88vh,920px)]">
        <div className="xl:w-[60%] xl:min-w-0 flex flex-col gap-4 min-h-0">
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:items-end">
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Fila</label>
              <select
                value={workQueue}
                onChange={(e) => setWorkQueue(e.target.value as WorkQueue)}
                className="input-field w-full"
              >
                <option value="ativos">Em aberto (aguardando início / em produção)</option>
                <option value="em_g2">Verificação G2 iniciada</option>
                <option value="historico">Aprovados</option>
                <option value="reprovados">Rejeitados</option>
                <option value="todos">Todos</option>
              </select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Filtrar por nicho</label>
              <select
                value={filterNicheId}
                onChange={(e) => setFilterNicheId(e.target.value)}
                className="input-field w-full"
              >
                <option value="">Todos os nichos atribuídos</option>
                {nicheFilterOptions.map(([nid, name]) => (
                  <option key={nid} value={nid}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Ativo</label>
              <select
                value={selectedId || ''}
                onChange={(e) => setSelectedId(e.target.value)}
                className="input-field w-full"
              >
                {list.map((a) => (
                  <option key={a.id} value={a.id}>
                    {formatCnpjDisplay(a.cnpj)} — {a.nicheName} ({statusLabel(a.statusProducao)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selected && (
            <div className="card p-4 space-y-1 flex-1 overflow-y-auto max-h-[calc(100vh-11rem)] xl:max-h-[calc(100vh-9rem)] border border-gray-200/80 dark:border-white/10 bg-white/95 dark:bg-zinc-900/90">
              <p className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-2 sticky top-0 bg-inherit z-10 pb-1 border-b border-gray-200/60 dark:border-white/10">
                Núcleo G2 — cópia 1 clique (ícone vira check verde por 2s)
              </p>
              <div className="rounded-lg border border-primary-500/25 bg-primary-500/[0.06] dark:bg-primary-500/10 px-2 -mx-0.5 mb-2">
                <FieldRow label="CNPJ" field="cnpj" value={formatCnpjDisplay(selected.cnpj)} mono />
                <FieldRow label="Razão social" field="razaoSocial" value={selected.razaoSocial || ''} />
                <FieldRow label="Nome fantasia" field="nomeFantasia" value={selected.nomeFantasia || ''} />
                {(() => {
                  const effectiveSite =
                    !readOnlyStrict && !siteReopenMode
                      ? (siteEdit.trim() || selected.siteUrl || '').trim()
                      : (selected.siteUrl || '').trim()
                  const siteOpenHref = effectiveSite
                    ? effectiveSite.startsWith('http://') || effectiveSite.startsWith('https://')
                      ? effectiveSite
                      : `https://${effectiveSite.replace(/^\/+/, '')}`
                    : ''
                  return (
                    <div className="flex gap-2 items-start py-2 border-b border-primary-500/20 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Site</p>
                        {effectiveSite ? (
                          <a
                            href={siteOpenHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 hover:underline break-all font-mono"
                          >
                            {effectiveSite}
                            <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden />
                          </a>
                        ) : (
                          <p className="text-sm text-gray-500">—</p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={!effectiveSite}
                        onClick={() => auditCopy('siteUrl', effectiveSite)}
                        className="shrink-0 p-1.5 rounded text-primary-600 dark:text-primary-400 hover:bg-primary-500/15 disabled:opacity-40"
                        title="Copiar URL do site"
                      >
                        {copied === 'siteUrl' ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  )
                })()}
                <FieldRow label="Endereço completo" field="enderecoCompleto" value={enderecoCompleto} />
                <div className="py-2 border-b border-primary-500/20 last:border-0">
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Texto sugerido — rodapé do site</p>
                      <pre className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-sans leading-snug max-h-28 overflow-y-auto">
                        {rodapeSiteText || '—'}
                      </pre>
                      <p className="text-[10px] text-gray-500 mt-1">
                        Deve coincidir com cartão CNPJ e dados de faturamento nas plataformas.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!rodapeSiteText}
                      onClick={() => auditCopy('rodapeSite', rodapeSiteText)}
                      className="shrink-0 p-1.5 rounded text-primary-600 dark:text-primary-400 hover:bg-primary-500/15 disabled:opacity-40"
                      title="Copiar rodapé"
                    >
                      {copied === 'rodapeSite' ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                <FieldRow label="Nome do sócio" field="nomeSocio" value={selected.nomeSocio || ''} />
                <FieldRow label="CPF do sócio" field="cpfSocio" value={cpfSocioFmt} mono />
                <FieldRow label="Data de nascimento (sócio)" field="dataNascimentoSocio" value={dataNascFmt} />
              </div>

              <details className="rounded-lg border border-gray-200/80 dark:border-white/10 bg-gray-50/80 dark:bg-black/20 open:pb-2 group/details">
                <summary className="cursor-pointer select-none text-xs font-medium text-gray-600 dark:text-gray-300 px-2 py-2 hover:bg-gray-100/80 dark:hover:bg-white/5 rounded-lg list-none [&::-webkit-details-marker]:hidden flex items-center gap-2">
                  <span className="text-gray-400 transition-transform group-open/details:rotate-90 inline-block">▸</span>
                  Demais campos e referências
                </summary>
                <div className="px-1 space-y-0 border-t border-gray-200/60 dark:border-white/10 pt-1">
                  {selected.endereco && selected.endereco !== enderecoCompleto && (
                    <FieldRow label="Endereço (texto único)" field="endereco" value={selected.endereco || ''} />
                  )}
                  <FieldRow label="Logradouro" field="logradouro" value={selected.logradouro || ''} />
                  <FieldRow label="Número" field="numero" value={selected.numero || ''} />
                  <FieldRow label="Bairro" field="bairro" value={selected.bairro || ''} />
                  <FieldRow label="Cidade" field="cidade" value={selected.cidade || ''} />
                  <FieldRow label="UF" field="estado" value={selected.estado || ''} mono />
                  <FieldRow label="CEP" field="cep" value={selected.cep || ''} mono />
                  <FieldRow label="E-mail empresa" field="emailEmpresa" value={selected.emailEmpresa || ''} />
                  <FieldRow label="Telefone" field="telefone" value={selected.telefone || ''} />
                  <FieldRow label="CNAE" field="cnae" value={selected.cnae || ''} mono />
                  <FieldRow label="Descrição CNAE" field="cnaeDescricao" value={selected.cnaeDescricao || ''} />
                  <FieldRow label="Status Receita" field="statusReceita" value={selected.statusReceita} />
                  <FieldRow label="Nicho" field="nicheName" value={selected.nicheName} />
                  <FieldRow
                    label="Congruência CNAE (automática)"
                    field="congruenciaCheck"
                    value={
                      selected.congruenciaCheck === undefined
                        ? '—'
                        : selected.congruenciaCheck
                          ? 'Compatível com o nicho'
                          : 'Incompatível / exceção'
                    }
                  />
                  <FieldRow label="Status produção" field="statusProducao" value={statusLabel(selected.statusProducao)} />
                </div>
              </details>

              {selected.g2ProducerObservacoes && (
                <div className="pt-2 text-xs text-gray-500 border-t border-gray-100 dark:border-white/10">
                  <span className="font-medium text-gray-600 dark:text-gray-400">Obs. G2 registradas: </span>
                  {selected.g2ProducerObservacoes}
                </div>
              )}

              {!readOnlyStrict && !siteReopenMode && (
                <div className="pt-3 border-t border-gray-100 dark:border-white/10">
                  <p className="text-xs font-medium text-gray-500 mb-2">Identidade (estoque RG)</p>
                  <button
                    type="button"
                    disabled={
                      saving ||
                      sortearRgBusy ||
                      !['DISPONIVEL', 'EM_PRODUCAO'].includes(selected.statusProducao)
                    }
                    onClick={() => void sortearRg()}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Shuffle className="w-3.5 h-3.5 shrink-0" />
                    {sortearRgBusy ? 'Sorteando…' : 'Sortear RG do estoque'}
                  </button>
                  <p className="text-[11px] text-gray-500 mt-1.5">
                    Reserva apenas pares DISPONÍVEIS; UTILIZADO nunca volta à roleta.
                  </p>
                </div>
              )}

              {!readOnlyStrict && siteDirty && (
                <div
                  className="rounded-lg border border-sky-500/40 bg-sky-950/25 px-3 py-2 text-[11px] text-sky-100/95 leading-snug"
                  role="note"
                >
                  <strong className="text-sky-200">Sincronização com o cartão CNPJ:</strong> ao mudar o domínio ou URL,
                  o rodapé do site (CNPJ, razão social, endereço, e-mail) deve permanecer{' '}
                  <strong>idêntico</strong> aos dados ao lado e ao PDF — requisito de congruência na verificação G2.
                </div>
              )}

              {!readOnlyStrict && (
                <div className="pt-3 space-y-2 rounded-lg border border-white/10 bg-zinc-900/30 px-3 py-3">
                  <label className="block text-xs font-medium text-gray-400">
                    Site / domínio (editável) — trava global de unicidade
                  </label>
                  <p className="text-[11px] text-gray-500 leading-snug">
                    O <strong className="text-gray-400">CNPJ</strong> desta demanda é fixo (cadastro do gerente). A{' '}
                    <strong className="text-gray-400">URL</strong> deve ser única em todo o sistema: se outro colaborador
                    já usou o mesmo domínio, o salvamento é bloqueado no servidor — use o aviso abaixo antes de clicar em
                    Salvar.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={siteEdit}
                      onChange={(e) => {
                        setSiteEdit(e.target.value)
                        setSiteUnique('idle')
                        setUrlCheckMessage('')
                        setSiteSaveError('')
                      }}
                      onBlur={() => void checkSiteUniqueNow()}
                      className="input-field flex-1 text-sm"
                      placeholder="https://..."
                    />
                    <button
                      type="button"
                      disabled={saving || siteUnique === 'taken' || siteUnique === 'checking'}
                      onClick={saveSite}
                      className="btn-primary text-sm shrink-0"
                    >
                      {saving ? '…' : 'Salvar URL'}
                    </button>
                  </div>
                  {siteEdit.trim() && (
                    <p
                      className={`text-xs ${
                        siteUnique === 'taken'
                          ? 'text-amber-700 dark:text-amber-400'
                          : siteUnique === 'ok'
                            ? 'text-green-700 dark:text-green-400'
                            : 'text-gray-500'
                      }`}
                    >
                      {siteUnique === 'checking' && 'Verificando unicidade…'}
                      {siteUnique === 'ok' && 'URL disponível (sem conflito com outras contas).'}
                      {siteUnique === 'taken' &&
                        (urlCheckMessage ||
                          'Este domínio já foi usado por outro colaborador ou conta. Escolha outro para evitar cruzamento de dados.')}
                    </p>
                  )}
                  {siteSaveError && (
                    <p className="text-xs text-red-600 dark:text-red-400 border border-red-500/30 rounded-md px-2 py-1.5 bg-red-950/30">
                      {siteSaveError}
                    </p>
                  )}
                </div>
              )}

              {readOnlyStrict && (selected.siteUrl || selected.statusProducao) && (
                <div className="pt-3 border-t border-gray-100 dark:border-white/10">
                  <p className="text-xs font-medium text-gray-500 mb-1">URL cadastrada</p>
                  <p className="text-sm font-mono break-all text-gray-800 dark:text-gray-200">
                    {selected.siteUrl || '—'}
                  </p>
                </div>
              )}

              {!readOnlyStrict && !siteReopenMode && (
                <div className="pt-3 border-t border-gray-100 dark:border-white/10">
                  <p className="text-xs font-medium text-gray-500 mb-2">Checklist de conclusão</p>
                  <button
                    type="button"
                    disabled={saving || !['DISPONIVEL', 'EM_PRODUCAO'].includes(selected.statusProducao)}
                    onClick={openG2Modal}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                  >
                    <ShieldCheck className="w-5 h-5 shrink-0" />
                    Marcar como Verificado G2
                  </button>
                  <p className="text-[11px] text-gray-500 mt-1.5">
                    Confirma URL final, observações e checklist; envia para verificação na plataforma e libera a fila
                    para o próximo ativo.
                  </p>
                </div>
              )}

              {!readOnlyStrict && !siteReopenMode && selected.statusProducao === 'DISPONIVEL' && (
                <div className="pt-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Fluxo</label>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => saveStatus('EM_PRODUCAO')}
                    className="px-3 py-1.5 rounded-lg text-xs bg-gray-200 dark:bg-white/10 hover:bg-primary-500/20 disabled:opacity-50"
                  >
                    Marcar &quot;Em produção&quot;
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="xl:w-[40%] xl:min-w-0 flex flex-col min-h-[min(80vh,880px)]">
          {selected && (
            <>
              <p className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-2 shrink-0">
                Documentos — preview na tela e download auditado
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  disabled={!selected.hasDocCnpj || docDownloadBusy !== null}
                  onClick={() => void downloadDocumentFile('cnpj')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 border border-white/15 text-gray-100 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {docDownloadBusy === 'cnpj' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <Download className="w-3.5 h-3.5 shrink-0" />
                  )}
                  Baixar Cartão CNPJ
                </button>
                <button
                  type="button"
                  disabled={!selected.hasDocRgFrente || docDownloadBusy !== null}
                  onClick={() => void downloadDocumentFile('rg-frente')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 border border-white/15 text-gray-100 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {docDownloadBusy === 'rg-frente' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <Download className="w-3.5 h-3.5 shrink-0" />
                  )}
                  Baixar RG (frente)
                </button>
                <button
                  type="button"
                  disabled={!selected.hasDocRgVerso || docDownloadBusy !== null}
                  onClick={() => void downloadDocumentFile('rg-verso')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 border border-white/15 text-gray-100 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {docDownloadBusy === 'rg-verso' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <Download className="w-3.5 h-3.5 shrink-0" />
                  )}
                  Baixar RG (verso)
                </button>
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                <AdsCoreDocumentPanel
                  assetId={selected.id}
                  nicheName={selected.nicheName}
                  briefingInstructions={selected.briefingInstructions}
                  hasDocCnpj={selected.hasDocCnpj}
                  hasDocRgFrente={selected.hasDocRgFrente}
                  hasDocRgVerso={selected.hasDocRgVerso}
                  hideDownload={false}
                  compareFields={[
                    { label: 'CNPJ', value: formatCnpjDisplay(selected.cnpj) },
                    { label: 'Razão social', value: selected.razaoSocial || '' },
                    { label: 'Nome fantasia', value: selected.nomeFantasia || '' },
                    { label: 'Endereço', value: enderecoCompleto || selected.endereco || '' },
                    { label: 'Sócio', value: selected.nomeSocio || '' },
                    { label: 'CPF sócio', value: cpfSocioFmt },
                    { label: 'CNAE', value: selected.cnae || '' },
                    { label: 'CNAE (descr.)', value: selected.cnaeDescricao || '' },
                  ]}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {siteDirty && selected && (
        <div
          className="fixed z-40 bottom-4 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 md:max-w-xl md:w-full pointer-events-none"
          role="status"
        >
          <div className="pointer-events-auto rounded-xl border border-amber-500/50 bg-amber-950/90 text-amber-50 px-4 py-3 text-sm shadow-lg backdrop-blur-sm">
            <p className="font-medium text-amber-200 text-xs mb-1">Sincronização do rodapé (G2)</p>
            <p>
              Lembrete: o rodapé deste site deve conter exatamente{' '}
              <strong className="text-white">{selected.razaoSocial || 'Razão Social'}</strong> e{' '}
              <strong className="text-white font-mono">{formatCnpjDisplay(selected.cnpj)}</strong>, conforme o
              documento na tela.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
