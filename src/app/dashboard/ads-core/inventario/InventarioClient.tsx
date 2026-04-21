'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BarChart3, CheckCircle2, XCircle, AlertTriangle, Plus,
  Search, Loader2, Package, ChevronRight, ChevronDown,
  ArrowLeft, RefreshCw, Lock, Zap, TrendingDown, TrendingUp,
  ClipboardList, FileBarChart2, Save,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ItemCategory = 'CONTA_PRODUCAO' | 'EMAIL_GMAIL' | 'CNPJ' | 'RG_DOCUMENTO' | 'PROXY' | 'PERFIL_PAGAMENTO' | 'HARDWARE' | 'OUTRO'
type ItemReason   = 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO' | 'QUEBRA_TECNICA' | 'ERRO_LANCAMENTO' | 'PERDA_EXTRAVIO' | 'ENTRADA_FORNECEDOR'
type CheckStatus  = 'ABERTO' | 'FINALIZADO' | 'CANCELADO'

type InventoryItem = {
  id: string
  itemName: string
  itemCategory: ItemCategory
  systemStock: number
  physicalStock: number | null
  difference: number | null
  unitCost: number | null
  reason: ItemReason | null
  notes: string | null
  abcClass: string | null
}

type InventoryCheck = {
  id: string
  title: string
  category: ItemCategory | null
  status: CheckStatus
  notes: string | null
  totalValueImpact: number | null
  maxDivergencePct: number | null
  ceoAlertTriggered: boolean
  finalizedAt: string | null
  createdAt: string
  manager: { name: string | null; email: string }
  items: InventoryItem[]
  _count?: { items: number }
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  CONTA_PRODUCAO: 'Conta de Produção', EMAIL_GMAIL: 'E-mail Gmail',
  CNPJ: 'CNPJ', RG_DOCUMENTO: 'Documento RG', PROXY: 'Proxy',
  PERFIL_PAGAMENTO: 'Perfil de Pagamento', HARDWARE: 'Hardware', OUTRO: 'Outro',
}

const REASON_LABELS: Record<ItemReason, string> = {
  AJUSTE_POSITIVO: 'Ajuste positivo', AJUSTE_NEGATIVO: 'Ajuste negativo',
  QUEBRA_TECNICA: 'Quebra técnica', ERRO_LANCAMENTO: 'Erro de lançamento',
  PERDA_EXTRAVIO: 'Perda / extravio', ENTRADA_FORNECEDOR: 'Entrada de fornecedor',
}

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ItemCategory[]
const REASONS    = Object.keys(REASON_LABELS)    as ItemReason[]

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ─── Utilitários ──────────────────────────────────────────────────────────────

function diffClass(diff: number | null) {
  if (diff === null) return ''
  if (diff < 0) return 'bg-red-50 dark:bg-red-950/30'
  if (diff > 0) return 'bg-green-50 dark:bg-green-950/30'
  return 'bg-zinc-50 dark:bg-zinc-900/30'
}

function diffBadge(diff: number | null) {
  if (diff === null) return <span className="text-zinc-400 text-xs">—</span>
  if (diff < 0) return <span className="flex items-center gap-1 text-red-600 font-bold text-xs"><TrendingDown className="w-3 h-3" />{diff}</span>
  if (diff > 0) return <span className="flex items-center gap-1 text-green-600 font-bold text-xs"><TrendingUp  className="w-3 h-3" />+{diff}</span>
  return <span className="flex items-center gap-1 text-zinc-500 text-xs"><CheckCircle2 className="w-3 h-3" />0</span>
}

function abcBadge(cls: string | null) {
  const colors = { A: 'bg-red-100 text-red-700', B: 'bg-amber-100 text-amber-700', C: 'bg-zinc-100 text-zinc-600' }
  const c = (cls ?? 'C') as 'A' | 'B' | 'C'
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${colors[c]}`}>{c}</span>
}

// ─── Estado local persistido em localStorage (anti-refresh) ───────────────────

function useLocalDraft(checkId: string) {
  const KEY = `inv_draft_${checkId}`
  const [draft, setDraft] = useState<Record<string, { physical: string; reason: ItemReason | ''; notes: string }>>({})

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) setDraft(JSON.parse(raw))
    } catch { /* ignorar */ }
  }, [KEY])

  const update = useCallback((itemId: string, data: { physical?: string; reason?: ItemReason | ''; notes?: string }) => {
    setDraft((prev) => {
      const base = prev[itemId] ?? { physical: '', reason: '' as ItemReason | '', notes: '' }
      const next = { ...prev, [itemId]: { ...base, ...data } }
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignorar */ }
      return next
    })
  }, [KEY])

  const clear = useCallback(() => {
    localStorage.removeItem(KEY)
    setDraft({})
  }, [KEY])

  return { draft, update, clear }
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function InventarioClient() {
  const [view, setView] = useState<'list' | 'detail' | 'new'>('list')
  const [checks, setChecks] = useState<InventoryCheck[]>([])
  const [total, setTotal] = useState(0)
  const [selectedCheck, setSelectedCheck] = useState<InventoryCheck | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [finalizing, setFinalizing] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [scannerQuery, setScannerQuery] = useState('')
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  // ── Novo inventário ──
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState<ItemCategory | ''>('')
  const [newNotes, setNewNotes] = useState('')
  const [newItems, setNewItems] = useState<{ itemName: string; itemCategory: ItemCategory; systemStock: string; unitCost: string }[]>(
    [{ itemName: '', itemCategory: 'CONTA_PRODUCAO', systemStock: '', unitCost: '' }]
  )
  const [creating, setCreating] = useState(false)

  const scanRef = useRef<HTMLInputElement>(null)
  const { draft, update: updateDraft, clear: clearDraft } = useLocalDraft(selectedCheck?.id ?? '__none__')

  // ── Carregar lista ──────────────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    setLoading(true)
    const qs = filterStatus ? `?status=${filterStatus}` : ''
    const res = await fetch(`/api/inventario${qs}`).catch(() => null)
    if (res?.ok) {
      const j = await res.json()
      setChecks(j.checks ?? [])
      setTotal(j.total ?? 0)
    }
    setLoading(false)
  }, [filterStatus])

  useEffect(() => { if (view === 'list') loadList() }, [view, loadList])

  // ── Abrir detalhe ───────────────────────────────────────────────────────────
  const openDetail = async (id: string) => {
    setLoading(true)
    const res = await fetch(`/api/inventario/${id}`)
    if (res.ok) {
      setSelectedCheck(await res.json())
      setView('detail')
    }
    setLoading(false)
  }

  // ── Salvar contagem de um item ──────────────────────────────────────────────
  const saveItem = async (item: InventoryItem) => {
    if (!selectedCheck) return
    const d = draft[item.id]
    if (!d || d.physical === '') return
    const physicalStock = parseInt(d.physical, 10)
    if (isNaN(physicalStock)) return

    setSaving(item.id)
    const res = await fetch(`/api/inventario/${selectedCheck.id}/items`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: item.id, physicalStock, reason: d.reason || undefined, notes: d.notes || undefined }),
    })
    if (res.ok) {
      const updated: InventoryItem = await res.json()
      setSelectedCheck((prev) => prev ? {
        ...prev,
        items: prev.items.map((i) => i.id === updated.id ? updated : i),
      } : prev)
      setFlash({ type: 'ok', msg: `"${item.itemName}" salvo` })
    } else {
      const e = await res.json().catch(() => ({}))
      setFlash({ type: 'err', msg: (e as { error?: string }).error ?? 'Erro ao salvar' })
    }
    setSaving(null)
    setTimeout(() => setFlash(null), 3000)
  }

  // ── Finalizar inventário ────────────────────────────────────────────────────
  const finalize = async () => {
    if (!selectedCheck) return
    if (!confirm('Finalizar inventário? Esta ação não poderá ser desfeita e irá gerar os movimentos de estoque.')) return
    setFinalizing(true)
    const res = await fetch(`/api/inventario/${selectedCheck.id}/finalizar`, { method: 'POST' })
    const j = await res.json().catch(() => ({}))
    if (res.ok) {
      clearDraft()
      setFlash({ type: 'ok', msg: `Inventário finalizado! Impacto: ${brl(j.totalValueImpact ?? 0)}` })
      await openDetail(selectedCheck.id)
    } else {
      setFlash({ type: 'err', msg: (j as { error?: string }).error ?? 'Erro ao finalizar' })
    }
    setFinalizing(false)
    setTimeout(() => setFlash(null), 6000)
  }

  // ── Cancelar inventário ─────────────────────────────────────────────────────
  const cancel = async () => {
    if (!selectedCheck) return
    if (!confirm('Cancelar este inventário?')) return
    const res = await fetch(`/api/inventario/${selectedCheck.id}/cancelar`, { method: 'POST' })
    if (res.ok) { setView('list') } else {
      const e = await res.json().catch(() => ({}))
      setFlash({ type: 'err', msg: (e as { error?: string }).error ?? 'Erro' })
    }
  }

  // ── Criar novo inventário ───────────────────────────────────────────────────
  const createCheck = async () => {
    if (!newTitle.trim()) { setFlash({ type: 'err', msg: 'Informe o título' }); return }
    const validItems = newItems.filter((i) => i.itemName.trim() && i.systemStock !== '')
    if (validItems.length === 0) { setFlash({ type: 'err', msg: 'Adicione ao menos 1 item com nome e saldo' }); return }

    setCreating(true)
    const res = await fetch('/api/inventario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTitle.trim(),
        category: newCategory || undefined,
        notes: newNotes || undefined,
        items: validItems.map((i) => ({
          itemName: i.itemName.trim(),
          itemCategory: i.itemCategory,
          systemStock: parseInt(i.systemStock, 10),
          unitCost: i.unitCost ? parseFloat(i.unitCost) : undefined,
        })),
      }),
    })
    const j = await res.json()
    setCreating(false)
    if (res.ok) {
      setNewTitle(''); setNewCategory(''); setNewNotes('')
      setNewItems([{ itemName: '', itemCategory: 'CONTA_PRODUCAO', systemStock: '', unitCost: '' }])
      await openDetail(j.id)
    } else {
      setFlash({ type: 'err', msg: (j as { error?: string }).error ?? 'Erro ao criar' })
    }
  }

  // ── Scanner: foca no item mais próximo do query ─────────────────────────────
  const filteredItems = selectedCheck
    ? scannerQuery.trim()
      ? selectedCheck.items.filter((i) => i.itemName.toLowerCase().includes(scannerQuery.toLowerCase()))
      : selectedCheck.items
    : []

  // ── Resumo financeiro ───────────────────────────────────────────────────────
  const countedItems = selectedCheck?.items.filter((i) => i.physicalStock !== null) ?? []
  const totalLoss    = countedItems.reduce((acc, i) => acc + (i.difference ?? 0) * Number(i.unitCost ?? 0), 0)
  const withDiff     = countedItems.filter((i) => (i.difference ?? 0) !== 0)
  const missingReason = withDiff.filter((i) => !i.reason && !draft[i.id]?.reason)

  // ─── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 max-w-screen-xl mx-auto space-y-5">

      {/* ── Flash ──────────────────────────────────────────────────────────── */}
      {flash && (
        <div className={`fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg flex items-center gap-2 ${flash.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {flash.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {flash.msg}
        </div>
      )}

      {/* ── LISTA ──────────────────────────────────────────────────────────── */}
      {view === 'list' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ClipboardList className="w-5 h-5 text-primary-600" />
                <h1 className="text-xl font-bold">Inventário de Estoque</h1>
              </div>
              <p className="text-sm text-zinc-500">{total} sessão(ões) registrada(s)</p>
            </div>
            <div className="flex gap-2">
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field text-sm py-1.5 min-w-[140px]">
                <option value="">Todos os status</option>
                <option value="ABERTO">Aberto</option>
                <option value="FINALIZADO">Finalizado</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
              <button onClick={() => setView('new')} className="btn-primary flex items-center gap-2 text-sm">
                <Plus className="w-4 h-4" /> Novo Inventário
              </button>
            </div>
          </div>

          {loading
            ? <div className="flex justify-center py-12 text-zinc-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...</div>
            : checks.length === 0
              ? (
                <div className="rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 p-12 text-center">
                  <Package className="w-12 h-12 mx-auto text-zinc-300 mb-3" />
                  <p className="text-zinc-500 font-medium">Nenhum inventário encontrado</p>
                  <p className="text-xs text-zinc-400 mt-1">Crie um novo para iniciar a contagem</p>
                  <button onClick={() => setView('new')} className="btn-primary mt-4 text-sm">Criar inventário</button>
                </div>
              )
              : (
                <div className="space-y-2">
                  {checks.map((c) => (
                    <button key={c.id} onClick={() => openDetail(c.id)}
                      className="w-full text-left rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card hover:shadow-md hover:-translate-y-0.5 transition-all p-4 flex items-center gap-4">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.status === 'ABERTO' ? 'bg-amber-400' : c.status === 'FINALIZADO' ? 'bg-green-500' : 'bg-zinc-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{c.title}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {c.category ? CATEGORY_LABELS[c.category] : 'Geral'} · {c._count?.items ?? 0} itens · {new Date(c.createdAt).toLocaleDateString('pt-BR')} · {c.manager.name ?? c.manager.email}
                        </p>
                      </div>
                      <div className="shrink-0 flex items-center gap-3">
                        {c.ceoAlertTriggered && <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">ALERTA CEO</span>}
                        {c.totalValueImpact != null && (
                          <span className={`text-xs font-bold ${c.totalValueImpact < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {brl(c.totalValueImpact)}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${c.status === 'ABERTO' ? 'bg-amber-100 text-amber-700' : c.status === 'FINALIZADO' ? 'bg-green-100 text-green-700' : 'bg-zinc-200 text-zinc-600'}`}>
                          {c.status}
                        </span>
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                      </div>
                    </button>
                  ))}
                </div>
              )
          }
        </>
      )}

      {/* ── NOVO INVENTÁRIO ─────────────────────────────────────────────────── */}
      {view === 'new' && (
        <>
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => setView('list')} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h1 className="text-xl font-bold">Novo Inventário</h1>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Título *</label>
                <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="input-field" placeholder="Ex: Inventário Mensal — E-mails Gmail" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Categoria (inventário cíclico)</label>
                <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as ItemCategory | '')} className="input-field">
                  <option value="">— Geral (todos) —</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Observações</label>
                <textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={2} className="input-field" placeholder="Contexto do inventário..." />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">Itens a inventariar *</p>
                <button type="button" onClick={() => setNewItems((p) => [...p, { itemName: '', itemCategory: 'CONTA_PRODUCAO', systemStock: '', unitCost: '' }])}
                  className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Adicionar item
                </button>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {newItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      {idx === 0 && <label className="block text-[11px] text-zinc-500 mb-1">Nome do item</label>}
                      <input value={item.itemName} onChange={(e) => setNewItems((p) => p.map((x, i) => i === idx ? { ...x, itemName: e.target.value } : x))} className="input-field text-sm" placeholder="Ex: Perfil VIP Latam" />
                    </div>
                    <div className="col-span-3">
                      {idx === 0 && <label className="block text-[11px] text-zinc-500 mb-1">Categoria</label>}
                      <select value={item.itemCategory} onChange={(e) => setNewItems((p) => p.map((x, i) => i === idx ? { ...x, itemCategory: e.target.value as ItemCategory } : x))} className="input-field text-sm">
                        {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <label className="block text-[11px] text-zinc-500 mb-1">Saldo sistema</label>}
                      <input type="number" value={item.systemStock} onChange={(e) => setNewItems((p) => p.map((x, i) => i === idx ? { ...x, systemStock: e.target.value } : x))} className="input-field text-sm" placeholder="0" min={0} />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <label className="block text-[11px] text-zinc-500 mb-1">Custo unit. (R$)</label>}
                      <input type="number" step="0.01" value={item.unitCost} onChange={(e) => setNewItems((p) => p.map((x, i) => i === idx ? { ...x, unitCost: e.target.value } : x))} className="input-field text-sm" placeholder="0,00" min={0} />
                    </div>
                    <div className="col-span-1 flex items-end pb-0.5">
                      <button type="button" onClick={() => setNewItems((p) => p.filter((_, i) => i !== idx))} className="p-1.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={createCheck} disabled={creating} className="btn-primary flex items-center gap-2">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {creating ? 'Criando...' : 'Criar e iniciar contagem'}
              </button>
              <button onClick={() => setView('list')} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </>
      )}

      {/* ── DETALHE / CONTAGEM ──────────────────────────────────────────────── */}
      {view === 'detail' && selectedCheck && (
        <>
          {/* Cabeçalho */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <button onClick={() => { setView('list'); setSelectedCheck(null) }} className="p-2 mt-0.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold">{selectedCheck.title}</h1>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${selectedCheck.status === 'ABERTO' ? 'bg-amber-100 text-amber-700' : selectedCheck.status === 'FINALIZADO' ? 'bg-green-100 text-green-700' : 'bg-zinc-200 text-zinc-600'}`}>
                    {selectedCheck.status}
                  </span>
                  {selectedCheck.ceoAlertTriggered && (
                    <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> ALERTA CEO
                    </span>
                  )}
                  {selectedCheck.status === 'FINALIZADO' && <Lock className="w-4 h-4 text-zinc-400" />}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {selectedCheck.category ? CATEGORY_LABELS[selectedCheck.category] : 'Geral'} · {selectedCheck.items.length} itens · Gerente: {selectedCheck.manager.name ?? selectedCheck.manager.email}
                </p>
              </div>
            </div>
            {selectedCheck.status === 'ABERTO' && (
              <div className="flex gap-2">
                <button onClick={cancel} className="btn-secondary text-sm flex items-center gap-1.5 text-red-600 border-red-200">
                  <XCircle className="w-4 h-4" /> Cancelar
                </button>
                <button onClick={finalize} disabled={finalizing || missingReason.length > 0} className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-60"
                  title={missingReason.length > 0 ? `${missingReason.length} item(s) com divergência sem motivo` : ''}>
                  {finalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Finalizar inventário
                </button>
              </div>
            )}
          </div>

          {/* Resumo financeiro */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-3">
              <p className="text-xs text-zinc-500">Total de itens</p>
              <p className="text-2xl font-bold mt-1">{selectedCheck.items.length}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-3">
              <p className="text-xs text-zinc-500">Contados</p>
              <p className="text-2xl font-bold mt-1 text-primary-600">{countedItems.length}</p>
              <p className="text-[10px] text-zinc-400">{selectedCheck.items.length - countedItems.length} pendentes</p>
            </div>
            <div className={`rounded-xl border p-3 ${totalLoss < 0 ? 'border-red-200 bg-red-50 dark:bg-red-950/20' : totalLoss > 0 ? 'border-green-200 bg-green-50 dark:bg-green-950/20' : 'border-zinc-200 bg-white dark:bg-ads-dark-card'}`}>
              <p className="text-xs text-zinc-500">Impacto financeiro</p>
              <p className={`text-xl font-bold mt-1 ${totalLoss < 0 ? 'text-red-600' : totalLoss > 0 ? 'text-green-600' : ''}`}>{brl(totalLoss)}</p>
            </div>
            <div className={`rounded-xl border p-3 ${missingReason.length > 0 ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/20' : 'border-zinc-200 bg-white dark:bg-ads-dark-card'}`}>
              <p className="text-xs text-zinc-500">Divergências sem motivo</p>
              <p className={`text-2xl font-bold mt-1 ${missingReason.length > 0 ? 'text-amber-600' : 'text-green-600'}`}>{missingReason.length}</p>
              {missingReason.length > 0 && <p className="text-[10px] text-amber-600">Obrigatório para finalizar</p>}
            </div>
          </div>

          {/* Scanner */}
          {selectedCheck.status === 'ABERTO' && (
            <div className="flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card px-4 py-3">
              <Zap className="w-4 h-4 text-primary-500 shrink-0" />
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400 shrink-0">Scanner:</span>
              <input
                ref={scanRef}
                value={scannerQuery}
                onChange={(e) => setScannerQuery(e.target.value)}
                placeholder="Digite ou use leitor de código de barras para filtrar itens..."
                className="flex-1 bg-transparent outline-none text-sm"
                autoFocus
              />
              {scannerQuery && (
                <button onClick={() => setScannerQuery('')} className="text-zinc-400 hover:text-zinc-600">
                  <XCircle className="w-4 h-4" />
                </button>
              )}
              <span className="text-xs text-zinc-400">{filteredItems.length} resultado(s)</span>
            </div>
          )}

          {/* Grid de contagem */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            <div className="grid grid-cols-12 gap-0 text-[11px] font-bold uppercase tracking-wide text-zinc-500 bg-zinc-50 dark:bg-zinc-900 px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700">
              <div className="col-span-1">ABC</div>
              <div className="col-span-3">Item</div>
              <div className="col-span-1 text-center">Sistema</div>
              <div className="col-span-2 text-center">Físico</div>
              <div className="col-span-1 text-center">Dif.</div>
              <div className="col-span-2">Motivo</div>
              <div className="col-span-2 text-right">Ação</div>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filteredItems.map((item) => {
                const d      = draft[item.id] ?? { physical: item.physicalStock?.toString() ?? '', reason: item.reason ?? '' as ItemReason | '', notes: item.notes ?? '' }
                const diff   = d.physical !== '' ? parseInt(d.physical, 10) - item.systemStock : item.difference
                const locked = selectedCheck.status !== 'ABERTO'
                return (
                  <div key={item.id} className={`grid grid-cols-12 gap-0 items-center px-4 py-2.5 text-sm ${diffClass(diff)}`}>
                    <div className="col-span-1">{abcBadge(item.abcClass)}</div>
                    <div className="col-span-3 pr-2">
                      <p className="font-medium text-sm truncate">{item.itemName}</p>
                      <p className="text-[10px] text-zinc-400">{CATEGORY_LABELS[item.itemCategory]}</p>
                    </div>
                    <div className="col-span-1 text-center font-mono font-bold">{item.systemStock}</div>
                    <div className="col-span-2 px-1">
                      <input
                        type="number" min={0}
                        value={d.physical}
                        disabled={locked}
                        onChange={(e) => updateDraft(item.id, { physical: e.target.value })}
                        className={`w-full text-center font-mono font-bold rounded-lg border px-2 py-1.5 text-sm outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                          diff !== null && diff < 0 ? 'border-red-300 bg-red-50 dark:bg-red-950/40 focus:border-red-500' :
                          diff !== null && diff > 0 ? 'border-green-300 bg-green-50 dark:bg-green-950/40 focus:border-green-500' :
                          'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:border-primary-400'
                        }`}
                        placeholder="—"
                      />
                    </div>
                    <div className="col-span-1 text-center">{diffBadge(diff)}</div>
                    <div className="col-span-2 px-1">
                      {diff !== null && diff !== 0 ? (
                        <select
                          value={d.reason}
                          disabled={locked}
                          onChange={(e) => updateDraft(item.id, { reason: e.target.value as ItemReason | '' })}
                          className={`w-full text-xs rounded-lg border px-1.5 py-1.5 outline-none disabled:opacity-60 ${!d.reason && !locked ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30' : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800'}`}
                        >
                          <option value="">Motivo *</option>
                          {REASONS.map((r) => <option key={r} value={r}>{REASON_LABELS[r]}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs text-zinc-400 px-1">—</span>
                      )}
                    </div>
                    <div className="col-span-2 flex justify-end gap-1.5">
                      {!locked && (
                        <button
                          onClick={() => saveItem(item)}
                          disabled={saving === item.id || d.physical === ''}
                          className="px-2.5 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 disabled:opacity-50 flex items-center gap-1"
                        >
                          {saving === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          Salvar
                        </button>
                      )}
                      {item.physicalStock !== null && (
                        <span className="text-[10px] text-zinc-400 self-center">✓</span>
                      )}
                    </div>
                  </div>
                )
              })}
              {filteredItems.length === 0 && (
                <div className="py-8 text-center text-zinc-400 text-sm">
                  {scannerQuery ? `Nenhum item encontrado para "${scannerQuery}"` : 'Nenhum item'}
                </div>
              )}
            </div>
          </div>

          {/* Movimentos registrados (inventário finalizado) */}
          {selectedCheck.status === 'FINALIZADO' && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
                <FileBarChart2 className="w-4 h-4 text-primary-500" />
                <span className="font-semibold text-sm">Resumo do Fechamento</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Impacto financeiro total</p>
                  <p className={`text-2xl font-bold ${(selectedCheck.totalValueImpact ?? 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {brl(selectedCheck.totalValueImpact ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Divergência máxima</p>
                  <p className={`text-2xl font-bold ${(selectedCheck.maxDivergencePct ?? 0) >= 10 ? 'text-red-600' : 'text-amber-600'}`}>
                    {selectedCheck.maxDivergencePct?.toFixed(1) ?? '0'}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Finalizado em</p>
                  <p className="font-semibold">{selectedCheck.finalizedAt ? new Date(selectedCheck.finalizedAt).toLocaleString('pt-BR') : '—'}</p>
                  {selectedCheck.ceoAlertTriggered && (
                    <p className="text-xs text-red-600 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Alerta de auditoria CEO gerado</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
