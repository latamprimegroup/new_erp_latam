'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Search, Copy, CheckCheck, Loader2, RefreshCw, MessageCircle, X,
  Target, TrendingUp, Package, Zap, Star, ChevronDown,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type AssetSpecs = {
  year?: number; paymentType?: string; verificacao?: boolean; docStatus?: string
  spendBRL?: number; spendUSD?: number; nicho?: string; authorityTag?: string
  faturamento?: string
}

type Asset = {
  id: string
  adsId: string
  category: string
  subCategory: string | null
  status: string
  salePrice: number
  displayName: string
  tags: string | null
  specs?: AssetSpecs | null
}

type DailyGoal = {
  soldToday: number
  revenueToday: number
  ticketMedio: number
  meta: number
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const WA_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '5511999999999'

const CATEGORY_EMOJI: Record<string, string> = {
  CONTAS: '💳', PERFIS: '👤', BM: '🏢', PROXIES: '🌐',
  SOFTWARE: '💻', INFRA: '⚙️', HARDWARE: '🖥️', OUTROS: '📦',
}

const QUICK_FILTERS = [
  { id: 'all',      label: '🌐 Todos',        filter: (_a: Asset) => true },
  { id: 'doc',      label: '🪪 Com DOC',       filter: (a: Asset) => a.tags?.includes('cnh-validada') || a.specs?.docStatus?.includes('Validada') },
  { id: 'new',      label: '✨ 2022+',          filter: (a: Asset) => (a.specs?.year ?? 0) >= 2022 },
  { id: 'usd',      label: '💵 USD',           filter: (a: Asset) => a.tags?.includes('usd') || a.subCategory?.toLowerCase().includes('usd') },
  { id: 'premium',  label: '💎 Premium',       filter: (a: Asset) => Number(a.salePrice) >= 500 },
  { id: 'google',   label: '🔵 Google Ads',    filter: (a: Asset) => a.category === 'CONTAS' },
  { id: 'bm',       label: '🏢 BM / Meta',     filter: (a: Asset) => a.category === 'BM' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function buildCopy(asset: Asset): string {
  const s = asset.specs ?? {}
  const fonte  = asset.subCategory ?? asset.category
  const nicho  = s.authorityTag ?? s.nicho ?? (asset.tags?.split(',')[0]?.trim() ?? 'Multi-nicho')
  const gastos = s.spendBRL
    ? s.spendBRL >= 1000 ? `+${Math.round(s.spendBRL / 1000)}k BRL` : `R$${s.spendBRL}`
    : s.spendUSD ? `$${s.spendUSD}k USD` : 'Consultar'
  const ano  = s.year ? String(s.year) : 'Consultar'
  const pag  = s.paymentType ?? 'Consultar'
  const verif = s.verificacao ? 'OK' : 'Consultar'
  const fat  = s.faturamento ?? 'OK'
  const waLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Tenho interesse na conta: ${asset.adsId}`)}`

  return `🛡️ CONTA GOOGLE ADS COM GASTOS - ADS ATIVOS
⚡ ID DA CONTA: ${asset.adsId}
🧬 DNA / FONTE: ${fonte} (Nicho: ${nicho})
💰 GASTOS: ${gastos}
🍷 ANO: ${ano}
✅ STATUS: EM OPERAÇÃO (AQUECIDA)
✅ NICHO: ${nicho}
✅ ANO: ${ano}
✅ FATURAMENTO: ${fat}
✅ PAG: ${pag}
⚙️ PAGAMENTO: ${pag} | VERIFICAÇÃO: ${verif}
💰 VALOR: ${brl(asset.salePrice)}
👉 CONSULTAR: ${waLink}`
}

function buildCatalog(assets: Asset[]): string {
  const header = `🛒 *CATÁLOGO ADS ATIVOS — ${new Date().toLocaleDateString('pt-BR')}*\n${'─'.repeat(40)}\n\n`
  const items = assets.map((a, i) => {
    const s = a.specs ?? {}
    const nicho = s.authorityTag ?? s.nicho ?? (a.tags?.split(',')[0]?.trim() ?? 'Multi-nicho')
    const gastos = s.spendBRL
      ? s.spendBRL >= 1000 ? `+${Math.round(s.spendBRL / 1000)}k` : `R$${s.spendBRL}`
      : s.spendUSD ? `$${s.spendUSD}k` : '—'
    const ano = s.year ? String(s.year) : '—'
    return `*${i + 1}. ${a.adsId}*\n   ${CATEGORY_EMOJI[a.category] ?? '📦'} ${a.category} | 🎯 ${nicho} | 🍷 ${ano} | 💰 ${gastos}\n   💲 *${brl(a.salePrice)}*`
  }).join('\n\n')
  const waLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Tenho interesse no catálogo de hoje!')}`
  const footer = `\n\n${'─'.repeat(40)}\n📲 *Solicitar:* ${waLink}\n🛡️ _Todos os ativos com garantia Ads Ativos_`
  return header + items + footer
}

// ─── Contador de meta diária ──────────────────────────────────────────────────

function DailyGoalBar({ data }: { data: DailyGoal }) {
  const pct = Math.min(100, data.meta > 0 ? (data.revenueToday / data.meta) * 100 : 0)
  const faltam = Math.max(0, data.meta - data.revenueToday)

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary-600" />
          <span className="font-bold text-sm text-zinc-800 dark:text-zinc-100">Meta do Dia</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-center">
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Vendas Hoje</p>
            <p className="font-black text-zinc-800 dark:text-zinc-100">{data.soldToday}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Ticket Médio</p>
            <p className="font-black text-zinc-800 dark:text-zinc-100">{data.ticketMedio > 0 ? brl(data.ticketMedio) : '—'}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Faturado</p>
            <p className="font-black text-green-600 dark:text-green-400">{brl(data.revenueToday)}</p>
          </div>
        </div>
      </div>
      <div className="h-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : pct >= 60 ? 'bg-primary-500' : 'bg-amber-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5 text-[11px] text-zinc-400">
        <span>{pct.toFixed(0)}% atingido</span>
        {faltam > 0 ? <span>Faltam {brl(faltam)}</span> : <span className="text-green-600 font-semibold">🎉 Meta batida!</span>}
      </div>
    </div>
  )
}

// ─── Card de Ativo ────────────────────────────────────────────────────────────

function AssetCard({
  asset, selected, onToggleSelect, onCopy, copied,
}: {
  asset: Asset
  selected: boolean
  onToggleSelect: () => void
  onCopy: (adsId: string) => void
  copied: string | null
}) {
  const s = asset.specs ?? {}
  const nicho = s.authorityTag ?? s.nicho ?? (asset.tags?.split(',')[0]?.trim() ?? 'Multi-nicho')
  const gastos = s.spendBRL
    ? s.spendBRL >= 1000 ? `+${Math.round(s.spendBRL / 1000)}k BRL` : `R$${s.spendBRL}`
    : s.spendUSD ? `$${s.spendUSD}k USD` : '—'
  const ano = s.year ? String(s.year) : '—'
  const hasDoc = asset.tags?.includes('cnh-validada') || s.docStatus?.includes('Validada')
  const waLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Tenho interesse na conta: ${asset.adsId}`)}`
  const isCopied = copied === asset.adsId

  return (
    <div
      className={`rounded-2xl border transition-all bg-white dark:bg-ads-dark-card flex flex-col ${
        selected
          ? 'border-primary-400 shadow-md shadow-primary-100 dark:shadow-primary-900/20'
          : 'border-zinc-200 dark:border-zinc-700 hover:border-primary-300 hover:shadow-md'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 p-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onToggleSelect}
            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
              selected ? 'border-primary-500 bg-primary-500' : 'border-zinc-300 dark:border-zinc-600 hover:border-primary-400'
            }`}
          >
            {selected && <CheckCheck className="w-3 h-3 text-white" />}
          </button>
          <span className="font-mono font-black text-sm text-primary-600 dark:text-primary-400 truncate">{asset.adsId}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hasDoc && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold">
              🪪 DOC
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-[10px] font-semibold">
            {CATEGORY_EMOJI[asset.category] ?? '📦'} {asset.category}
          </span>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-3 gap-1 px-3 pb-3 text-center">
        <div className="bg-zinc-50 dark:bg-zinc-800/40 rounded-xl p-2">
          <p className="text-[9px] text-zinc-400 uppercase tracking-wider mb-0.5">Nicho</p>
          <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">{nicho}</p>
        </div>
        <div className="bg-zinc-50 dark:bg-zinc-800/40 rounded-xl p-2">
          <p className="text-[9px] text-zinc-400 uppercase tracking-wider mb-0.5">Ano</p>
          <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{ano}</p>
        </div>
        <div className="bg-zinc-50 dark:bg-zinc-800/40 rounded-xl p-2">
          <p className="text-[9px] text-zinc-400 uppercase tracking-wider mb-0.5">Gastos</p>
          <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">{gastos}</p>
        </div>
      </div>

      {/* Footer: preço + botões */}
      <div className="px-3 pb-3 mt-auto">
        <div className="flex items-center justify-between mb-2">
          <p className="text-lg font-black text-green-600 dark:text-green-400">{brl(asset.salePrice)}</p>
          {s.paymentType && (
            <span className="text-[10px] text-zinc-400 font-medium">{s.paymentType}</span>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => {
              navigator.clipboard.writeText(buildCopy(asset))
              onCopy(asset.adsId)
            }}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              isCopied
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-primary-100 hover:text-primary-700'
            }`}
          >
            {isCopied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {isCopied ? 'Copiado!' : 'Copiar'}
          </button>
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-green-500 hover:bg-green-600 text-white transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            WhatsApp
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Catálogo ───────────────────────────────────────────────────────────

function CatalogModal({ assets, onClose }: { assets: Asset[]; onClose: () => void }) {
  const text = buildCatalog(assets)
  const [copied, setCopied] = useState(false)
  const waLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`

  function copy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <div>
            <h3 className="font-bold text-lg text-zinc-800 dark:text-zinc-100">📋 Catálogo do Dia</h3>
            <p className="text-xs text-zinc-500">{assets.length} ativo(s) selecionado(s)</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-xs text-zinc-700 dark:text-zinc-300 font-mono whitespace-pre-wrap bg-zinc-50 dark:bg-zinc-800/60 rounded-xl p-4 border border-zinc-200 dark:border-zinc-700">
            {text}
          </pre>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 py-4 border-t border-zinc-100 dark:border-zinc-800 shrink-0">
          <button
            onClick={copy}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors ${
              copied ? 'bg-green-100 text-green-700' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-primary-100 hover:text-primary-700'
            }`}
          >
            {copied ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copiado!' : 'Copiar Catálogo'}
          </button>
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-green-500 hover:bg-green-600 text-white transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Abrir no WhatsApp
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function VitrineComercialTab() {
  const [assets, setAssets]         = useState<Asset[]>([])
  const [loading, setLoading]       = useState(true)
  const [q, setQ]                   = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [copied, setCopied]         = useState<string | null>(null)
  const [showCatalog, setShowCatalog] = useState(false)
  const [dailyGoal, setDailyGoal]   = useState<DailyGoal | null>(null)
  const [meta, setMeta]             = useState(5000)
  const [showMetaInput, setShowMetaInput] = useState(false)
  const searchRef                   = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [assetsRes, goalRes] = await Promise.all([
      fetch('/api/compras/ativos?status=AVAILABLE&limit=200'),
      fetch('/api/compras/ativos/vitrine-meta'),
    ])
    if (assetsRes.ok) {
      const d = await assetsRes.json()
      setAssets(Array.isArray(d.assets) ? d.assets : [])
    }
    if (goalRes.ok) {
      const g = await goalRes.json()
      setDailyGoal({ ...g, meta })
    }
    setLoading(false)
  }, [meta])

  useEffect(() => { load() }, [load])

  // Copiar com auto-reset
  function handleCopy(adsId: string) {
    setCopied(adsId)
    setTimeout(() => setCopied(null), 2500)
  }

  // Filtro ativo + busca
  const quickFilter = QUICK_FILTERS.find(f => f.id === activeFilter) ?? QUICK_FILTERS[0]
  const filtered = assets.filter((a) => {
    const matchQ = !q || a.adsId.toLowerCase().includes(q.toLowerCase()) ||
      a.displayName.toLowerCase().includes(q.toLowerCase()) ||
      (a.tags ?? '').toLowerCase().includes(q.toLowerCase()) ||
      (a.specs?.nicho ?? '').toString().toLowerCase().includes(q.toLowerCase())
    return matchQ && quickFilter.filter(a)
  })

  const selectedAssets = filtered.filter(a => selected.has(a.id))

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(prev =>
      prev.size === filtered.length
        ? new Set()
        : new Set(filtered.map(a => a.id))
    )
  }

  return (
    <div className="space-y-4">

      {/* Meta Diária */}
      {dailyGoal && (
        <div>
          <DailyGoalBar data={{ ...dailyGoal, meta }} />
          {showMetaInput && (
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number"
                value={meta}
                onChange={e => setMeta(Number(e.target.value))}
                className="input-field w-40 text-sm"
                min={0}
                step={500}
              />
              <button onClick={() => setShowMetaInput(false)} className="btn-primary text-sm py-1.5 px-3">Salvar</button>
            </div>
          )}
          <button
            onClick={() => setShowMetaInput(v => !v)}
            className="text-[11px] text-zinc-400 hover:text-primary-600 mt-1 flex items-center gap-1"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${showMetaInput ? 'rotate-180' : ''}`} />
            {showMetaInput ? 'Fechar' : 'Alterar meta diária'}
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        {/* Busca */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            ref={searchRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por ID, nicho, tags..."
            className="input-field pl-9 w-full text-sm"
          />
          {q && (
            <button onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          )}
        </div>

        {/* Gerar Catálogo */}
        <div className="flex items-center gap-2 shrink-0">
          {selected.size > 0 && (
            <button
              onClick={() => setShowCatalog(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              Catálogo ({selected.size})
            </button>
          )}
          <button onClick={load} disabled={loading} className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card text-zinc-500">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Quick Filter Chips */}
      <div className="flex flex-wrap gap-1.5">
        {QUICK_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              activeFilter === f.id
                ? 'bg-primary-600 text-white'
                : 'bg-white dark:bg-ads-dark-card border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-primary-300'
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={selectAll}
          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-primary-300 bg-white dark:bg-ads-dark-card"
        >
          {selected.size === filtered.length && filtered.length > 0 ? '✕ Desmarcar todos' : `☑️ Selec. todos (${filtered.length})`}
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1"><Package className="w-3.5 h-3.5" />{filtered.length} disponíveis</span>
        <span className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" />{selected.size} selecionados</span>
        {filtered.length > 0 && (
          <span className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 text-amber-400" />
            {filtered.filter(a => a.tags?.includes('cnh-validada')).length} com DOC
          </span>
        )}
      </div>

      {/* Grid de cards */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-zinc-400">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Nenhum ativo disponível</p>
          <p className="text-sm mt-1">Tente outro filtro ou aguarde o gerente de produção liberar novos ativos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map(asset => (
            <AssetCard
              key={asset.id}
              asset={asset}
              selected={selected.has(asset.id)}
              onToggleSelect={() => toggleSelect(asset.id)}
              onCopy={handleCopy}
              copied={copied}
            />
          ))}
        </div>
      )}

      {/* Modal Catálogo */}
      {showCatalog && (
        <CatalogModal
          assets={selectedAssets.length > 0 ? selectedAssets : filtered}
          onClose={() => setShowCatalog(false)}
        />
      )}
    </div>
  )
}
