'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ShoppingCart, Plus, Trash2, CheckCircle, XCircle,
  Loader2, RefreshCw, Package, DollarSign, FileText,
  ChevronDown, ChevronUp, ExternalLink, Clock,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type AssetType = 'BUSINESS_MANAGER' | 'PERFIL_SOCIAL' | 'PAGINA_SOCIAL' | 'CONTA_ADS' | 'PROXY' | 'DOMINIO' | 'HARDWARE' | 'OUTRO'
type PaymentMethod = 'PIX' | 'USDT' | 'DINHEIRO' | 'CARTAO' | 'TRANSFERENCIA' | 'OUTRO'
type EntryStatus = 'PENDENTE' | 'CONFIRMADA' | 'CANCELADA'

type EntryItem = {
  id: string
  assetIdentifier: string
  assetLabel: string | null
  notes: string | null
}

type Entry = {
  id: string
  status: EntryStatus
  assetType: AssetType
  platform: string | null
  quantity: number
  unitCost: number | null
  totalCost: number
  paymentMethod: PaymentMethod
  paymentProofUrl: string | null
  notes: string | null
  supplierName: string | null
  supplier: { id: string; name: string } | null
  createdBy: { id: string; name: string | null; email: string }
  createdAt: string
  confirmedAt: string | null
  items: EntryItem[]
  _count?: { items: number }
}

type Supplier = { id: string; name: string }

// ─── Labels e cores ───────────────────────────────────────────────────────────

const ASSET_LABELS: Record<AssetType, string> = {
  BUSINESS_MANAGER: 'Business Manager (BM)',
  PERFIL_SOCIAL: 'Perfil Social (Facebook/Instagram)',
  PAGINA_SOCIAL: 'Página Social (Facebook/Instagram)',
  CONTA_ADS: 'Conta de Anúncio (Google/Meta)',
  PROXY: 'Proxy / IP',
  DOMINIO: 'Domínio',
  HARDWARE: 'Celular / Hardware',
  OUTRO: 'Outro',
}

const ASSET_ICONS: Record<AssetType, string> = {
  BUSINESS_MANAGER: '🏢',
  PERFIL_SOCIAL: '👤',
  PAGINA_SOCIAL: '📄',
  CONTA_ADS: '📢',
  PROXY: '🔒',
  DOMINIO: '🌐',
  HARDWARE: '📱',
  OUTRO: '📦',
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  PIX: 'PIX',
  USDT: 'USDT (Crypto)',
  DINHEIRO: 'Dinheiro / Espécie',
  CARTAO: 'Cartão',
  TRANSFERENCIA: 'Transferência bancária',
  OUTRO: 'Outro',
}

const STATUS_STYLES: Record<EntryStatus, { label: string; color: string; icon: React.ReactNode }> = {
  PENDENTE:   { label: 'Pendente',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',    icon: <Clock className="w-3 h-3" /> },
  CONFIRMADA: { label: 'Confirmada', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',    icon: <CheckCircle className="w-3 h-3" /> },
  CANCELADA:  { label: 'Cancelada',  color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',            icon: <XCircle className="w-3 h-3" /> },
}

const ASSET_IDENTIFIER_HELP: Record<AssetType, string> = {
  BUSINESS_MANAGER: 'ID do BM (ex: 1234567890)',
  PERFIL_SOCIAL: 'URL do perfil ou ID (ex: facebook.com/nome.sobrenome)',
  PAGINA_SOCIAL: 'URL ou nome da página (ex: facebook.com/NomeDaPagina)',
  CONTA_ADS: 'ID da conta (ex: 123-456-7890)',
  PROXY: 'IP:Porta (ex: 192.168.1.1:8080)',
  DOMINIO: 'Domínio (ex: meusite.com)',
  HARDWARE: 'IMEI ou nº de série do dispositivo',
  OUTRO: 'Identificador do ativo',
}

// ─── Formulário ───────────────────────────────────────────────────────────────

type ItemRow = { id: string; assetIdentifier: string; assetLabel: string; notes: string }

function NovaEntradaForm({ onCreated }: { onCreated: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [assetType, setAssetType] = useState<AssetType>('BUSINESS_MANAGER')
  const [platform, setPlatform] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX')
  const [totalCost, setTotalCost] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [paymentProofUrl, setPaymentProofUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<ItemRow[]>([{ id: '1', assetIdentifier: '', assetLabel: '', notes: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(true)

  useEffect(() => {
    fetch('/api/admin/fornecedores?limit=200')
      .then((r) => r.json())
      .then((d) => setSuppliers(Array.isArray(d.suppliers) ? d.suppliers : Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  function addItem() {
    setItems((prev) => [...prev, { id: String(Date.now()), assetIdentifier: '', assetLabel: '', notes: '' }])
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  function updateItem(id: string, field: keyof ItemRow, value: string) {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, [field]: value } : i))
  }

  function handlePasteIds(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    const lines = text.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean)
    if (lines.length > 1) {
      setItems(lines.map((line, idx) => ({ id: String(Date.now() + idx), assetIdentifier: line, assetLabel: '', notes: '' })))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validItems = items.filter((i) => i.assetIdentifier.trim())
    if (validItems.length === 0) { setError('Informe pelo menos um ativo.'); return }
    if (!totalCost || isNaN(Number(totalCost))) { setError('Informe o valor total pago.'); return }
    if (!supplierId && !supplierName.trim()) { setError('Informe o fornecedor.'); return }

    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/entrada-mercadoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: supplierId || undefined,
          supplierName: supplierId ? undefined : supplierName.trim(),
          assetType,
          platform: platform || undefined,
          items: validItems,
          unitCost: unitCost || undefined,
          totalCost: Number(totalCost),
          paymentMethod,
          paymentProofUrl: paymentProofUrl || undefined,
          notes: notes || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Erro ao registrar entrada'); return }
      setItems([{ id: '1', assetIdentifier: '', assetLabel: '', notes: '' }])
      setTotalCost('')
      setUnitCost('')
      setPaymentProofUrl('')
      setNotes('')
      onCreated()
    } catch {
      setError('Erro de conexão')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card overflow-hidden">
      <button
        onClick={() => setShowForm((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Plus className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">Nova Entrada de Mercadoria</p>
            <p className="text-xs text-zinc-500">Registrar compra de ativos externos (BM, perfis, páginas, etc.)</p>
          </div>
        </div>
        {showForm ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
      </button>

      {showForm && (
        <form onSubmit={handleSubmit} className="border-t border-zinc-100 dark:border-zinc-800 p-5 space-y-5">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Linha 1: Tipo de ativo + Plataforma */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">
                Tipo de Ativo <span className="text-red-500">*</span>
              </label>
              <select value={assetType} onChange={(e) => setAssetType(e.target.value as AssetType)} className="input-field text-sm py-2 w-full">
                {(Object.entries(ASSET_LABELS) as [AssetType, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{ASSET_ICONS[k]} {v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">Plataforma</label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="input-field text-sm py-2 w-full">
                <option value="">— Selecionar —</option>
                <option value="META">Meta (Facebook/Instagram)</option>
                <option value="GOOGLE">Google</option>
                <option value="TIKTOK">TikTok</option>
                <option value="KWAI">Kwai</option>
                <option value="OUTRO">Outro</option>
              </select>
            </div>
          </div>

          {/* Linha 2: Fornecedor */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">
              Fornecedor <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <select
                value={supplierId}
                onChange={(e) => { setSupplierId(e.target.value); if (e.target.value) setSupplierName('') }}
                className="input-field text-sm py-2 flex-1"
              >
                <option value="">— Selecionar cadastrado —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {!supplierId && (
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Ou digite o nome"
                  className="input-field text-sm py-2 flex-1"
                />
              )}
            </div>
          </div>

          {/* Linha 3: Financeiro */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">
                Valor Total Pago (R$) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={totalCost}
                onChange={(e) => setTotalCost(e.target.value)}
                className="input-field text-sm py-2 w-full"
                placeholder="Ex: 250.00"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">Valor por Unidade (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                className="input-field text-sm py-2 w-full"
                placeholder="Opcional"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">
                Forma de Pagamento <span className="text-red-500">*</span>
              </label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className="input-field text-sm py-2 w-full">
                {(Object.entries(PAYMENT_LABELS) as [PaymentMethod, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Linha 4: Comprovante */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">
              Link do Comprovante de Pagamento
            </label>
            <input
              type="url"
              value={paymentProofUrl}
              onChange={(e) => setPaymentProofUrl(e.target.value)}
              className="input-field text-sm py-2 w-full"
              placeholder="https://drive.google.com/... ou link do WhatsApp"
            />
            <p className="text-xs text-zinc-400 mt-1">Cole o link do print do comprovante (Google Drive, Dropbox, etc.)</p>
          </div>

          {/* Lista de ativos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                Ativos Comprados <span className="text-red-500">*</span>
                <span className="ml-2 font-normal normal-case text-zinc-400">({items.length} item{items.length !== 1 ? 's' : ''})</span>
              </label>
              <button type="button" onClick={addItem} className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> Adicionar linha
              </button>
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
              <div className="bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 grid grid-cols-12 gap-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
                <span className="col-span-5">{ASSET_IDENTIFIER_HELP[assetType]}</span>
                <span className="col-span-4">Nome / Label (opcional)</span>
                <span className="col-span-2">Observação</span>
                <span className="col-span-1 text-center">—</span>
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-64 overflow-y-auto">
                {items.map((item, idx) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 px-3 py-1.5 items-center">
                    <div className="col-span-5 relative">
                      {idx === 0 ? (
                        <textarea
                          value={item.assetIdentifier}
                          onChange={(e) => updateItem(item.id, 'assetIdentifier', e.target.value)}
                          onPaste={handlePasteIds}
                          className="input-field text-xs py-1 w-full resize-none h-7"
                          placeholder="Cole vários IDs de uma vez"
                          rows={1}
                        />
                      ) : (
                        <input
                          type="text"
                          value={item.assetIdentifier}
                          onChange={(e) => updateItem(item.id, 'assetIdentifier', e.target.value)}
                          className="input-field text-xs py-1 w-full"
                          placeholder="ID / URL / identificador"
                        />
                      )}
                    </div>
                    <input
                      type="text"
                      value={item.assetLabel}
                      onChange={(e) => updateItem(item.id, 'assetLabel', e.target.value)}
                      className="input-field text-xs py-1 col-span-4"
                      placeholder="Ex: BM Principal Conta 1"
                    />
                    <input
                      type="text"
                      value={item.notes}
                      onChange={(e) => updateItem(item.id, 'notes', e.target.value)}
                      className="input-field text-xs py-1 col-span-2"
                      placeholder="Obs..."
                    />
                    <div className="col-span-1 flex justify-center">
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(item.id)} className="text-zinc-300 hover:text-red-500 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-zinc-400 mt-1.5">
              💡 Dica: cole vários IDs/links separados por vírgula ou quebra de linha no primeiro campo — o sistema divide automaticamente.
            </p>
          </div>

          {/* Observações gerais */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">Observações Gerais</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-field text-sm py-2 w-full resize-none"
              rows={2}
              placeholder="Contexto da compra, condições, etc."
            />
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 px-6 py-2.5 text-sm">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
              Registrar Entrada
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ─── Card de Entrada ──────────────────────────────────────────────────────────

function EntryCard({ entry, onAction }: { entry: Entry; onAction: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [acting, setActing] = useState(false)
  const status = STATUS_STYLES[entry.status]
  const supplierDisplay = entry.supplier?.name ?? entry.supplierName ?? '—'

  async function act(action: 'confirmar' | 'cancelar') {
    setActing(true)
    try {
      await fetch(`/api/admin/entrada-mercadoria/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      onAction()
    } finally {
      setActing(false)
    }
  }

  return (
    <div className={`rounded-xl border bg-white dark:bg-ads-dark-card overflow-hidden transition-shadow hover:shadow-md ${
      entry.status === 'PENDENTE' ? 'border-amber-200 dark:border-amber-800' :
      entry.status === 'CONFIRMADA' ? 'border-green-200 dark:border-green-800' :
      'border-zinc-200 dark:border-zinc-700 opacity-70'
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="text-2xl mt-0.5">{ASSET_ICONS[entry.assetType]}</div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">{ASSET_LABELS[entry.assetType]}</p>
                {entry.platform && (
                  <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded-full">{entry.platform}</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5 flex-wrap">
                <span>🏪 {supplierDisplay}</span>
                <span>📦 {entry.quantity} ativo{entry.quantity !== 1 ? 's' : ''}</span>
                <span>💳 {PAYMENT_LABELS[entry.paymentMethod]}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${status.color}`}>
              {status.icon} {status.label}
            </span>
            <span className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              {Number(entry.totalCost).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3">
          <div className="text-xs text-zinc-400">
            {entry.createdBy.name ?? entry.createdBy.email} · {new Date(entry.createdAt).toLocaleDateString('pt-BR')}
          </div>
          <div className="flex items-center gap-2">
            {entry.paymentProofUrl && (
              <a href={entry.paymentProofUrl} target="_blank" rel="noreferrer"
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
                <FileText className="w-3 h-3" /> Comprovante
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button onClick={() => setExpanded((v) => !v)} className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {expanded ? 'Ocultar' : 'Ver'} ativos
            </button>
          </div>
        </div>

        {/* Ações para PENDENTE */}
        {entry.status === 'PENDENTE' && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              onClick={() => act('confirmar')}
              disabled={acting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 text-xs font-medium transition-colors disabled:opacity-60"
            >
              {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
              Confirmar Entrada
            </button>
            <button
              onClick={() => act('cancelar')}
              disabled={acting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 text-xs font-medium transition-colors disabled:opacity-60"
            >
              <XCircle className="w-3 h-3" /> Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Lista de ativos expandida */}
      {expanded && entry.items.length > 0 && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="p-3 space-y-1 max-h-48 overflow-y-auto">
            {entry.items.map((item, idx) => (
              <div key={item.id} className="flex items-start gap-2 text-xs py-1 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                <span className="text-zinc-400 w-5 shrink-0 text-right">{idx + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-zinc-700 dark:text-zinc-300 truncate">{item.assetIdentifier}</p>
                  {item.assetLabel && <p className="text-zinc-500">{item.assetLabel}</p>}
                  {item.notes && <p className="text-zinc-400 italic">{item.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function EntradaMercadoriaClient() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({ totalSpent: 0, pendingCount: 0 })
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (filterStatus) qs.set('status', filterStatus)
    if (filterType) qs.set('assetType', filterType)
    fetch(`/api/admin/entrada-mercadoria?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setEntries(Array.isArray(d.entries) ? d.entries : [])
        if (d.summary) setSummary(d.summary)
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [filterStatus, filterType])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
          <ShoppingCart className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h1 className="heading-1 text-lg">Entrada de Mercadoria</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Registrar compras externas — BMs, Perfis, Páginas, Contas, Proxies e mais
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-4 space-y-1">
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium uppercase tracking-wide">
            <DollarSign className="w-4 h-4 text-emerald-500" /> Total Investido
          </div>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {summary.totalSpent.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
          <p className="text-xs text-zinc-400">Entradas confirmadas</p>
        </div>
        <div className="card p-4 space-y-1">
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium uppercase tracking-wide">
            <Clock className="w-4 h-4 text-amber-500" /> Aguardando Confirmação
          </div>
          <p className={`text-xl font-bold ${summary.pendingCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500'}`}>
            {summary.pendingCount}
          </p>
          <p className="text-xs text-zinc-400">Entradas pendentes</p>
        </div>
        <div className="card p-4 space-y-1">
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium uppercase tracking-wide">
            <Package className="w-4 h-4 text-blue-500" /> Total de Entradas
          </div>
          <p className="text-xl font-bold">{entries.length}</p>
          <p className="text-xs text-zinc-400">Registradas no período</p>
        </div>
      </div>

      {/* Formulário */}
      <NovaEntradaForm onCreated={load} />

      {/* Filtros + lista */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field text-sm py-1.5 w-40">
            <option value="">Todos os status</option>
            <option value="PENDENTE">Pendente</option>
            <option value="CONFIRMADA">Confirmada</option>
            <option value="CANCELADA">Cancelada</option>
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input-field text-sm py-1.5 w-52">
            <option value="">Todos os tipos</option>
            {(Object.entries(ASSET_LABELS) as [AssetType, string][]).map(([k, v]) => (
              <option key={k} value={k}>{ASSET_ICONS[k]} {v}</option>
            ))}
          </select>
          <button onClick={load} className="btn-secondary flex items-center gap-2 text-sm py-1.5">
            <RefreshCw className="w-4 h-4" /> Atualizar
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500 py-8 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando entradas…
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl">
            <ShoppingCart className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
            <p className="font-medium text-zinc-500">Nenhuma entrada registrada</p>
            <p className="text-sm text-zinc-400 mt-1">Use o formulário acima para registrar a primeira compra.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} onAction={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
