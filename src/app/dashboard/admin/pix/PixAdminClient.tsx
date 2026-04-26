'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import {
  QrCode,
  Copy,
  CheckCheck,
  RefreshCcw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  TrendingUp,
  Banknote,
  ShoppingCart,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Filter,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type PixItem = {
  id: string
  checkoutType: 'SALES' | 'QUICK'
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED'
  buyerName: string | null
  buyerWhatsapp: string | null
  buyerEmail: string | null
  amount: number
  qty: number
  description: string
  pixCopyPaste: string | null
  pixQrCode: string | null
  interTxid: string | null
  expiresAt: string | null
  paidAt: string | null
  createdAt: string
  utmifySent: boolean
  deliverySent: boolean
  checkoutUrl: string | null
}

type Summary = {
  totalPending: number
  totalPaid: number
  totalExpired: number
  paidToday: number
  revenueToday: number
  revenuePaid: number
}

type ApiResponse = {
  summary: Summary
  items: PixItem[]
  error?: string
}

type StatusFilter = 'ALL' | 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED'
type TypeFilter = 'all' | 'sales' | 'quick'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s atrás`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}min atrás`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  return `${d}d atrás`
}

function countdownLabel(expiresAt: string | null): { label: string; urgent: boolean } {
  if (!expiresAt) return { label: '—', urgent: false }
  const remaining = new Date(expiresAt).getTime() - Date.now()
  if (remaining <= 0) return { label: 'Expirado', urgent: true }
  const m = Math.floor(remaining / 60000)
  const s = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')
  const urgent = m < 5
  return { label: `${m}:${s}`, urgent }
}

const STATUS_CONFIG = {
  PENDING:   { label: 'Aguardando',  color: 'bg-amber-100  text-amber-700  dark:bg-amber-950/40  dark:text-amber-200',  icon: Clock         },
  PAID:      { label: 'Pago',        color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', icon: CheckCircle2 },
  EXPIRED:   { label: 'Expirado',    color: 'bg-zinc-200    text-zinc-600    dark:bg-zinc-800       dark:text-zinc-400',    icon: XCircle      },
  CANCELLED: { label: 'Cancelado',   color: 'bg-red-100     text-red-700     dark:bg-red-950/40     dark:text-red-300',     icon: AlertCircle  },
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
}: {
  label: string
  value: string
  sub?: string
  color: string
  icon: React.ElementType
}) {
  return (
    <div className={`rounded-2xl border p-4 flex items-start gap-3 ${color}`}>
      <div className="mt-0.5 shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold opacity-70 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function PixRow({ item }: { item: PixItem }) {
  const [expanded, setExpanded]   = useState(false)
  const [copied, setCopied]       = useState(false)
  const [countdown, setCountdown] = useState(countdownLabel(item.expiresAt))
  const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.CANCELLED
  const StatusIcon = cfg.icon

  useEffect(() => {
    if (item.status !== 'PENDING' || !item.expiresAt) return
    const id = setInterval(() => setCountdown(countdownLabel(item.expiresAt)), 1000)
    return () => clearInterval(id)
  }, [item.status, item.expiresAt])

  const copy = async () => {
    if (!item.pixCopyPaste) return
    await navigator.clipboard.writeText(item.pixCopyPaste)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-ads-dark-card overflow-hidden">
      {/* Linha principal */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors" onClick={() => setExpanded(!expanded)}>
        {/* Status badge */}
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${cfg.color}`}>
          <StatusIcon className="w-3 h-3" />
          {cfg.label}
        </span>

        {/* Tipo */}
        <span className="hidden sm:inline-block text-[10px] font-mono bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400 px-2 py-0.5 rounded shrink-0">
          {item.checkoutType === 'QUICK' ? 'LOJA' : 'CATÁLOGO'}
        </span>

        {/* Descrição */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {item.buyerName ?? '—'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.description}</p>
        </div>

        {/* Valor */}
        <p className="text-base font-bold text-gray-900 dark:text-white shrink-0 tabular-nums">
          {brl(item.amount)}
        </p>

        {/* Tempo */}
        <p className="hidden md:block text-xs text-gray-400 dark:text-gray-500 shrink-0 text-right min-w-[70px]">
          {relTime(item.createdAt)}
        </p>

        {/* Expira (só PENDING) */}
        {item.status === 'PENDING' && (
          <span className={`hidden md:inline-flex items-center gap-1 text-xs font-mono shrink-0 ${countdown.urgent ? 'text-red-500' : 'text-amber-500'}`}>
            <Clock className="w-3 h-3" />
            {countdown.label}
          </span>
        )}

        {/* Expand toggle */}
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
        )}
      </div>

      {/* Painel expandido */}
      {expanded && (
        <div className="border-t border-gray-200 dark:border-white/10 px-4 py-3 space-y-3 bg-gray-50/50 dark:bg-white/[0.02]">
          {/* Info comprador */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {item.buyerWhatsapp && (
              <div>
                <p className="text-gray-400 dark:text-gray-500 mb-0.5">WhatsApp</p>
                <a
                  href={`https://wa.me/${item.buyerWhatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1 hover:underline"
                >
                  {item.buyerWhatsapp}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            {item.buyerEmail && (
              <div>
                <p className="text-gray-400 dark:text-gray-500 mb-0.5">E-mail</p>
                <p className="text-gray-700 dark:text-gray-300 font-mono truncate">{item.buyerEmail}</p>
              </div>
            )}
            {item.interTxid && (
              <div>
                <p className="text-gray-400 dark:text-gray-500 mb-0.5">TXID</p>
                <p className="text-gray-700 dark:text-gray-300 font-mono text-[10px] break-all">{item.interTxid}</p>
              </div>
            )}
            <div>
              <p className="text-gray-400 dark:text-gray-500 mb-0.5">Criado em</p>
              <p className="text-gray-700 dark:text-gray-300">
                {new Date(item.createdAt).toLocaleString('pt-BR')}
              </p>
            </div>
            {item.paidAt && (
              <div>
                <p className="text-gray-400 dark:text-gray-500 mb-0.5">Pago em</p>
                <p className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  {new Date(item.paidAt).toLocaleString('pt-BR')}
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <div>
                <p className="text-gray-400 dark:text-gray-500 mb-0.5">Utmify</p>
                <p className={item.utmifySent ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}>
                  {item.utmifySent ? '✅ Enviado' : '⏳ Pendente'}
                </p>
              </div>
              <div className="ml-4">
                <p className="text-gray-400 dark:text-gray-500 mb-0.5">Entrega</p>
                <p className={item.deliverySent ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}>
                  {item.deliverySent ? '✅ Enviada' : '⏳ Pendente'}
                </p>
              </div>
            </div>
          </div>

          {/* QR Code + Copia-e-Cola */}
          {item.pixCopyPaste && (
            <div className="flex flex-col sm:flex-row gap-3">
              {item.pixQrCode && (
                <div className="shrink-0 bg-white rounded-xl p-2 self-start">
                  <Image
                    src={`data:image/png;base64,${item.pixQrCode}`}
                    alt="QR Code PIX"
                    width={100}
                    height={100}
                    className="w-24 h-24"
                  />
                </div>
              )}
              <div className="flex-1 space-y-1.5">
                <p className="text-xs text-gray-400 dark:text-gray-500 font-semibold">PIX Copia e Cola</p>
                <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/10 rounded-xl p-2.5 text-[10px] font-mono text-gray-600 dark:text-gray-300 break-all max-h-20 overflow-y-auto">
                  {item.pixCopyPaste}
                </div>
                <button
                  onClick={copy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    copied
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-white/20'
                  }`}
                >
                  {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copiado!' : 'Copiar código PIX'}
                </button>
              </div>
            </div>
          )}

          {/* Link checkout */}
          {item.checkoutUrl && (
            <a
              href={item.checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              Abrir página de checkout
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function PixAdminClient({ userRole }: { userRole: string }) {
  const [data, setData]             = useState<ApiResponse | null>(null)
  const [loading, setLoading]       = useState(true)
  const [status, setStatus]         = useState<StatusFilter>('ALL')
  const [type, setType]             = useState<TypeFilter>('all')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (status !== 'ALL') params.set('status', status)
      if (type !== 'all') params.set('type', type)
      params.set('limit', '100')

      const res = await fetch(`/api/admin/pix-checkouts?${params}`)
      if (res.ok) {
        const json = await res.json() as ApiResponse
        setData(json)
        setLastRefresh(new Date())
      }
    } catch (err) {
      console.error('Erro ao carregar checkouts PIX:', err)
    } finally {
      setLoading(false)
    }
  }, [status, type])

  useEffect(() => {
    void load()
  }, [load])

  // Auto-refresh a cada 30s quando há pendentes
  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => {
      void load()
    }, 30_000)
    return () => clearInterval(id)
  }, [autoRefresh, load])

  const summary = data?.summary
  const items = data?.items ?? []

  const isAdmin = userRole === 'ADMIN'

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <QrCode className="w-6 h-6 text-emerald-500" />
            Gestão de PIX
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Checkouts PIX — ativos individuais + loja de produtos · Banco Inter
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              autoRefresh
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-gray-200 dark:border-white/15 text-gray-500 dark:text-gray-400'
            }`}
          >
            {autoRefresh ? '🟢 Auto-refresh ON' : '⏸ Auto-refresh OFF'}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            Atualizar
          </button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <SummaryCard
          label="Aguardando"
          value={String(summary?.totalPending ?? '—')}
          icon={Clock}
          color="border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300"
        />
        <SummaryCard
          label="Pagos (total)"
          value={String(summary?.totalPaid ?? '—')}
          icon={CheckCircle2}
          color="border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300"
        />
        <SummaryCard
          label="Expirados"
          value={String(summary?.totalExpired ?? '—')}
          icon={XCircle}
          color="border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 text-zinc-500 dark:text-zinc-400"
        />
        <SummaryCard
          label="Pagos hoje"
          value={String(summary?.paidToday ?? '—')}
          icon={ShoppingCart}
          color="border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300"
        />
        <SummaryCard
          label="Receita hoje"
          value={summary ? brl(summary.revenueToday) : '—'}
          icon={TrendingUp}
          color="border-purple-200 dark:border-purple-800/50 bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-300"
        />
        {isAdmin && (
          <SummaryCard
            label="Receita total (pagos)"
            value={summary ? brl(summary.revenuePaid) : '—'}
            icon={Banknote}
            color="border-emerald-300 dark:border-emerald-700/50 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200"
          />
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />

        {/* Status */}
        {(['ALL', 'PENDING', 'PAID', 'EXPIRED', 'CANCELLED'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
              status === s
                ? 'bg-primary-500 text-white border-primary-500'
                : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/25'
            }`}
          >
            {s === 'ALL' ? 'Todos' : s === 'PENDING' ? 'Aguardando' : s === 'PAID' ? 'Pagos' : s === 'EXPIRED' ? 'Expirados' : 'Cancelados'}
          </button>
        ))}

        <span className="text-gray-300 dark:text-white/20">|</span>

        {/* Tipo */}
        {([
          { v: 'all',   l: 'Todos os tipos' },
          { v: 'quick', l: 'Loja' },
          { v: 'sales', l: 'Catálogo' },
        ] as { v: TypeFilter; l: string }[]).map(({ v, l }) => (
          <button
            key={v}
            onClick={() => setType(v)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
              type === v
                ? 'bg-zinc-800 text-white border-zinc-800 dark:bg-white/20 dark:border-transparent'
                : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/25'
            }`}
          >
            {l}
          </button>
        ))}

        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 shrink-0">
          {items.length} resultado{items.length !== 1 ? 's' : ''} · atualizado {lastRefresh.toLocaleTimeString('pt-BR')}
        </span>
      </div>

      {/* Lista de checkouts */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-gray-400 dark:text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Carregando checkouts PIX...
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500 text-center">
          <QrCode className="w-10 h-10 mb-3 opacity-40" />
          <p className="font-semibold">Nenhum checkout encontrado</p>
          <p className="text-sm mt-1">Tente alterar os filtros ou aguardar novos pedidos</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <PixRow key={`${item.checkoutType}-${item.id}`} item={item} />
          ))}
        </div>
      )}

      {/* Rodapé informativo */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/20 px-4 py-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
        <p className="font-semibold">ℹ️ Sobre os tipos de checkout PIX</p>
        <p><strong>Catálogo</strong> — checkout de ativo individual via <code>/checkout/[adsId]</code> (SalesCheckout · Banco Inter)</p>
        <p><strong>Loja</strong> — checkout de produto/pacote via <code>/loja/[slug]</code> (QuickSaleCheckout · Banco Inter)</p>
        <p>Confirmação automática via webhook Inter → <code>/api/webhooks/inter/pix</code></p>
      </div>
    </div>
  )
}
