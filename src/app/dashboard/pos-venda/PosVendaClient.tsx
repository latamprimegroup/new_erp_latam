'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Heart,
  Link2,
  MessageCircle,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  X,
} from 'lucide-react'
import { SaudeClient } from './SaudeClient'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type AssetStatus = 'DELIVERED' | 'WARMING' | 'SUSPENDED' | 'REPLACED' | 'RETURNED'
type AssetOrigin = 'INTERNAL' | 'EXTERNAL'
type ReplacementReason = 'PROFILE_ERROR' | 'DIRTY_PROXY' | 'CREATIVE_ISSUE' | 'PLATFORM_BAN' | 'CLIENT_REQUEST' | 'OTHER'
type CredentialAction = 'UPDATE_STATUS' | 'UPDATE_PASSWORD' | 'UPDATE_NOTE' | 'REPLACE' | 'UPDATE_EXTRA'

interface Credential {
  id:              string
  assetId:         string | null
  loginEmail:      string | null
  loginPassword:   string | null
  recoveryEmail:   string | null
  twoFaSeed:       string | null
  extraData:       Record<string, unknown> | null
  assetOrigin:     AssetOrigin
  executorName:    string | null
  supplierName:    string | null
  assetStatus:     AssetStatus
  supportNote:     string | null
  replacedAt:      string | null
  replacementReason: ReplacementReason | null
  replacementNote: string | null
  createdAt:       string
  executor:        { id: string; name: string | null } | null
  logs: Array<{
    id:        string
    action:    string
    actorName: string | null
    details:   Record<string, unknown> | null
    createdAt: string
  }>
}

interface OrderDetail {
  id:            string
  paidAt:        string | null
  createdAt:     string
  buyerName:     string
  buyerCpf:      string
  buyerWhatsapp: string
  buyerEmail:    string | null
  qty:           number
  totalAmount:   number
  interTxid:     string | null
  interE2eId:    string | null
  warrantyEndsAt: string | null
  inWarranty:    boolean
  warrantyExpired: boolean
  deliveryFlowStatus: string
  deliveryStatusNote: string | null
  stockProductCodeSnapshot: string | null
  stockProductNameSnapshot: string | null
  utmSource:     string | null
  utmMedium:     string | null
  utmCampaign:   string | null
  listing: { id: string; title: string; slug: string; assetCategory: string; warrantyDays: number }
  seller:  { id: string; name: string | null; email: string } | null
  credentials: Credential[]
}

interface OrderRow {
  id:            string
  paidAt:        string | null
  buyerName:     string
  buyerCpf:      string
  buyerWhatsapp: string
  buyerEmail:    string | null
  qty:           number
  totalAmount:   number
  warrantyEndsAt: string | null
  inWarranty:    boolean
  warrantyExpired: boolean
  hasCredentials: boolean
  listing: { title: string; assetCategory: string }
  seller:  { name: string | null } | null
  credentials: Array<{ assetStatus: AssetStatus; assetOrigin: AssetOrigin }>
}

// ─── Constantes de mapeamento ─────────────────────────────────────────────────

const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  DELIVERED: 'Ativa',
  WARMING:   'Aquecendo',
  SUSPENDED: 'Suspensa',
  REPLACED:  'Substituída',
  RETURNED:  'Devolvida',
}
const ASSET_STATUS_COLORS: Record<AssetStatus, string> = {
  DELIVERED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  WARMING:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  SUSPENDED: 'bg-red-500/10 text-red-400 border-red-500/20',
  REPLACED:  'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  RETURNED:  'bg-blue-500/10 text-blue-400 border-blue-500/20',
}
const REPLACEMENT_REASON_LABELS: Record<ReplacementReason, string> = {
  PROFILE_ERROR:  'Erro no Perfil',
  DIRTY_PROXY:    'Proxy Sujo',
  CREATIVE_ISSUE: 'Problema no Criativo',
  PLATFORM_BAN:   'Banimento pela Plataforma',
  CLIENT_REQUEST: 'Solicitação do Cliente',
  OTHER:          'Outro',
}
const CREDENTIAL_ACTION_LABELS: Record<string, string> = {
  CREATED:          'Credencial criada',
  PASSWORD_CHANGED: 'Senha alterada',
  STATUS_CHANGED:   'Status alterado',
  NOTE_UPDATED:     'Nota atualizada',
  REPLACED:         'Conta substituída',
  EXTRA_UPDATED:    'Dados extras atualizados',
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

function formatBrl(v: number) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}
function maskPassword(v: string | null) {
  if (!v) return null
  return '•'.repeat(Math.min(v.length, 12))
}
function buildWhatsappMessage(order: OrderDetail, cred: Credential | null) {
  const lines: string[] = [
    `🎉 *ATUALIZAÇÃO DO SEU PEDIDO — ADS ATIVOS*`,
    ``,
    `📦 Produto: *${order.listing.title}*`,
    `👤 Cliente: *${order.buyerName}*`,
    `💰 Valor: *${formatBrl(order.totalAmount)}*`,
    `📅 Aprovado em: *${formatDate(order.paidAt)}*`,
  ]
  if (cred) {
    lines.push(``, `🔐 *DADOS DE ACESSO:*`)
    if (cred.loginEmail)    lines.push(`📧 Login: \`${cred.loginEmail}\``)
    if (cred.loginPassword) lines.push(`🔑 Senha: \`${cred.loginPassword}\``)
    if (cred.recoveryEmail) lines.push(`📨 E-mail Recuperação: \`${cred.recoveryEmail}\``)
    if (cred.twoFaSeed)     lines.push(`🔒 2FA Seed: \`${cred.twoFaSeed}\``)
  }
  if (order.inWarranty && order.warrantyEndsAt) {
    lines.push(``, `✅ Conta em garantia até: ${formatDate(order.warrantyEndsAt)}`)
  }
  lines.push(``, `_Ads Ativos — War Room OS_`)
  return lines.join('\n')
}

// ─── Componentes auxiliares ───────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${color}`}>
      {label}
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs text-zinc-400">{label}</label>
      {children}
    </div>
  )
}

function SensitiveField({ label, value }: { label: string; value: string | null }) {
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  if (!value) return null
  const display = visible ? value : maskPassword(value) ?? ''
  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="flex items-center gap-2 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-zinc-500">{label}</p>
        <p className="text-xs text-zinc-200 font-mono truncate">{display}</p>
      </div>
      <button type="button" onClick={() => setVisible(!visible)} className="text-zinc-500 hover:text-zinc-300 shrink-0">
        {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
      <button type="button" onClick={copy} className="text-zinc-500 hover:text-zinc-300 shrink-0">
        {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}

// ─── Modal de detalhes ────────────────────────────────────────────────────────

function OrderModal({
  checkoutId,
  canEdit,
  onClose,
}: {
  checkoutId: string
  canEdit: boolean
  onClose: () => void
}) {
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'credenciais' | 'pedido' | 'logs'>('credenciais')
  const [adding, setAdding] = useState(false)
  const [replaceCredId, setReplaceCredId] = useState<string | null>(null)
  const [trocaRapidaCredId, setTrocaRapidaCredId] = useState<string | null>(null)
  const [trocaRapidaForm, setTrocaRapidaForm] = useState({
    replacementReason: 'PROFILE_ERROR' as ReplacementReason,
    replacementNote: '',
    newLoginEmail: '', newLoginPassword: '', newRecoveryEmail: '', newTwoFaSeed: '',
    newAssetOrigin: 'INTERNAL' as AssetOrigin,
    newExecutorName: '', newSupplierName: '',
    sendWhatsapp: true,
  })
  const [trocaSaving, setTrocaSaving] = useState(false)
  const [magicLinkLoading, setMagicLinkLoading] = useState(false)
  const [magicLinkUrl, setMagicLinkUrl] = useState<string | null>(null)
  const [noteCredId, setNoteCredId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [form, setForm] = useState({
    loginEmail: '', loginPassword: '', recoveryEmail: '', twoFaSeed: '',
    assetOrigin: 'INTERNAL' as AssetOrigin,
    executorName: '', supplierName: '',
    assetStatus: 'DELIVERED' as AssetStatus,
    supportNote: '',
  })
  const [replaceForm, setReplaceForm] = useState({
    replacementReason: 'PROFILE_ERROR' as ReplacementReason,
    replacementNote: '',
    loginEmail: '', loginPassword: '', recoveryEmail: '', twoFaSeed: '',
    assetOrigin: 'INTERNAL' as AssetOrigin,
    executorName: '', supplierName: '',
  })
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/pos-venda/${checkoutId}`, { cache: 'no-store' })
      if (res.ok) setOrder(await res.json() as OrderDetail)
    } finally {
      setLoading(false)
    }
  }, [checkoutId])

  useEffect(() => { load() }, [load])

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormSaving(true)
    setFormError(null)
    try {
      const res = await fetch('/api/admin/pos-venda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutId, ...form }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) { setFormError(data.error ?? 'Erro ao salvar credencial.'); return }
      setAdding(false)
      setForm({ loginEmail: '', loginPassword: '', recoveryEmail: '', twoFaSeed: '', assetOrigin: 'INTERNAL', executorName: '', supplierName: '', assetStatus: 'DELIVERED', supportNote: '' })
      await load()
    } finally {
      setFormSaving(false)
    }
  }

  const submitReplace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!replaceCredId) return
    setFormSaving(true)
    setFormError(null)
    try {
      const res = await fetch(`/api/admin/pos-venda/${checkoutId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentialId: replaceCredId,
          action: 'REPLACE',
          replacementReason: replaceForm.replacementReason,
          replacementNote: replaceForm.replacementNote || undefined,
          newCredential: {
            loginEmail:    replaceForm.loginEmail    || undefined,
            loginPassword: replaceForm.loginPassword || undefined,
            recoveryEmail: replaceForm.recoveryEmail || undefined,
            twoFaSeed:     replaceForm.twoFaSeed     || undefined,
            assetOrigin:   replaceForm.assetOrigin,
            executorName:  replaceForm.executorName  || undefined,
            supplierName:  replaceForm.supplierName  || undefined,
          },
        }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) { setFormError(data.error ?? 'Erro ao substituir conta.'); return }
      setReplaceCredId(null)
      await load()
    } finally {
      setFormSaving(false)
    }
  }

  const generateMagicLink = async (credentialId: string, sendWa: boolean) => {
    setMagicLinkLoading(true)
    setMagicLinkUrl(null)
    try {
      const res = await fetch('/api/admin/pos-venda/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkoutId,
          credentialId,
          expiryHours: 72,
          revokeOld: true,
          sendWhatsapp: sendWa,
        }),
      })
      const data = await res.json().catch(() => ({})) as { url?: string; error?: string }
      if (res.ok && data.url) {
        setMagicLinkUrl(data.url)
        await navigator.clipboard.writeText(data.url).catch(() => {})
      } else {
        alert(data.error ?? 'Erro ao gerar magic link.')
      }
    } finally {
      setMagicLinkLoading(false)
    }
  }

  const submitTrocaRapida = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!trocaRapidaCredId) return
    setTrocaSaving(true)
    setFormError(null)
    try {
      const res = await fetch('/api/admin/pos-venda/troca-rapida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkoutId,
          credentialId:      trocaRapidaCredId,
          replacementReason: trocaRapidaForm.replacementReason,
          replacementNote:   trocaRapidaForm.replacementNote || undefined,
          newLoginEmail:     trocaRapidaForm.newLoginEmail     || undefined,
          newLoginPassword:  trocaRapidaForm.newLoginPassword  || undefined,
          newRecoveryEmail:  trocaRapidaForm.newRecoveryEmail  || undefined,
          newTwoFaSeed:      trocaRapidaForm.newTwoFaSeed      || undefined,
          newAssetOrigin:    trocaRapidaForm.newAssetOrigin,
          newExecutorName:   trocaRapidaForm.newExecutorName   || undefined,
          newSupplierName:   trocaRapidaForm.newSupplierName   || undefined,
          sendWhatsapp:      trocaRapidaForm.sendWhatsapp,
          expiryHours:       72,
        }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string; newMagicUrl?: string }
      if (!res.ok) { setFormError(data.error ?? 'Erro ao executar troca rápida.'); return }
      if (data.newMagicUrl) setMagicLinkUrl(data.newMagicUrl)
      setTrocaRapidaCredId(null)
      await load()
    } finally {
      setTrocaSaving(false)
    }
  }

  const submitNote = async () => {
    if (!noteCredId) return
    setNoteSaving(true)
    try {
      await fetch(`/api/admin/pos-venda/${checkoutId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialId: noteCredId, action: 'UPDATE_NOTE', supportNote: noteText }),
      })
      setNoteCredId(null)
      setNoteText('')
      await load()
    } finally {
      setNoteSaving(false)
    }
  }

  const sendWhatsapp = (cred: Credential | null) => {
    if (!order) return
    const phone = order.buyerWhatsapp.replace(/\D/g, '')
    const msg   = buildWhatsappMessage(order, cred)
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <RefreshCw className="w-6 h-6 text-zinc-400 animate-spin mx-auto" />
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
          <p className="text-red-400 text-sm">Pedido não encontrado.</p>
          <button onClick={onClose} className="mt-4 text-xs text-zinc-400 hover:text-white">Fechar</button>
        </div>
      </div>
    )
  }

  const activeCreds = order.credentials.filter((c) => c.assetStatus !== 'REPLACED')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-zinc-800">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-white text-lg">{order.listing.title}</p>
              {order.inWarranty && (
                <Badge label="Em Garantia" color="bg-emerald-500/10 text-emerald-400 border-emerald-500/20" />
              )}
              {order.warrantyExpired && (
                <Badge label="Garantia Expirada" color="bg-zinc-500/10 text-zinc-400 border-zinc-500/20" />
              )}
            </div>
            <p className="text-zinc-400 text-sm mt-0.5">{order.buyerName} · {order.buyerWhatsapp}</p>
            <p className="text-zinc-500 text-xs mt-0.5">{formatBrl(order.totalAmount)} · {order.qty}x · Pago em {formatDate(order.paidAt)}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3">
          {(['credenciais', 'pedido', 'logs'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                activeTab === tab
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab === 'credenciais' ? 'Credenciais' : tab === 'pedido' ? 'Pedido' : 'Histórico'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── TAB: Credenciais ────────────────────────────────────────────────── */}
          {activeTab === 'credenciais' && (
            <div className="space-y-4">
              {order.credentials.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-center space-y-2">
                  <Package className="w-8 h-8 text-zinc-600 mx-auto" />
                  <p className="text-sm text-zinc-500">Nenhuma credencial registrada ainda.</p>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setAdding(true)}
                      className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 mx-auto"
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar credencial
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {order.credentials.map((cred, idx) => (
                    <div
                      key={cred.id}
                      className={`rounded-xl border p-4 space-y-3 ${
                        cred.assetStatus === 'REPLACED' ? 'border-zinc-800 bg-zinc-900/40 opacity-60' : 'border-zinc-700 bg-zinc-800/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-white">Conta #{idx + 1}</p>
                          <Badge label={ASSET_STATUS_LABELS[cred.assetStatus]} color={ASSET_STATUS_COLORS[cred.assetStatus]} />
                          <Badge
                            label={cred.assetOrigin === 'INTERNAL' ? 'Produção Interna' : 'Fornecedor'}
                            color="bg-zinc-700/50 text-zinc-400 border-zinc-600"
                          />
                        </div>
                        {canEdit && cred.assetStatus !== 'REPLACED' && (
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => { setNoteCredId(cred.id); setNoteText(cred.supportNote ?? '') }}
                              className="text-[10px] text-zinc-400 hover:text-white px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700"
                            >
                              Nota
                            </button>
                            <button
                              type="button"
                              onClick={() => setReplaceCredId(cred.id)}
                              className="text-[10px] text-zinc-400 hover:text-red-300 px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700"
                            >
                              Substituir
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Origem */}
                      <p className="text-[11px] text-zinc-500">
                        {cred.assetOrigin === 'INTERNAL'
                          ? `Executor: ${cred.executorName ?? cred.executor?.name ?? '—'}`
                          : `Fornecedor: ${cred.supplierName ?? '—'}`
                        }
                        {' · '}Registrado em {formatDate(cred.createdAt)}
                      </p>

                      {/* Credenciais */}
                      <div className="space-y-1.5">
                        <SensitiveField label="Login / E-mail"         value={cred.loginEmail} />
                        <SensitiveField label="Senha"                  value={cred.loginPassword} />
                        <SensitiveField label="E-mail de Recuperação"  value={cred.recoveryEmail} />
                        <SensitiveField label="Seed 2FA (TOTP)"        value={cred.twoFaSeed} />
                      </div>

                      {/* Dados extras */}
                      {cred.extraData && Object.keys(cred.extraData).length > 0 && (
                        <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-2 text-[11px]">
                          <p className="text-zinc-500 mb-1">Dados adicionais</p>
                          {Object.entries(cred.extraData).map(([k, v]) => (
                            <div key={k} className="flex gap-2 text-zinc-300">
                              <span className="text-zinc-500 shrink-0">{k}:</span>
                              <span className="font-mono truncate">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Nota de suporte */}
                      {cred.supportNote && (
                        <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2 text-xs text-amber-300">
                          📝 {cred.supportNote}
                        </div>
                      )}

                      {/* Substituição */}
                      {cred.assetStatus === 'REPLACED' && cred.replacementReason && (
                        <div className="text-[11px] text-zinc-500">
                          Motivo: <span className="text-zinc-400">{REPLACEMENT_REASON_LABELS[cred.replacementReason]}</span>
                          {cred.replacementNote && ` — ${cred.replacementNote}`}
                          {cred.replacedAt && ` · ${formatDate(cred.replacedAt)}`}
                        </div>
                      )}

                      {/* Ações rápidas */}
                      {cred.assetStatus !== 'REPLACED' && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => sendWhatsapp(cred)}
                            className="flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            Mensagem WhatsApp
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => generateMagicLink(cred.id, true)}
                              disabled={magicLinkLoading}
                              className="flex items-center gap-1.5 text-[11px] text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                            >
                              <Link2 className="w-3.5 h-3.5" />
                              {magicLinkLoading ? 'Gerando...' : 'Gerar Magic Link'}
                            </button>
                          )}
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => setTrocaRapidaCredId(cred.id)}
                              className="flex items-center gap-1.5 text-[11px] text-amber-400 hover:text-amber-300"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Troca Rápida
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setAdding(true)}
                      className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300"
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar outra credencial
                    </button>
                  )}
                </>
              )}

              {/* Magic link gerado */}
              {magicLinkUrl && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
                  <p className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" /> Magic Link gerado e copiado!
                  </p>
                  <p className="text-[11px] font-mono text-zinc-300 break-all">{magicLinkUrl}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(magicLinkUrl)}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" /> Copiar
                    </button>
                    <button type="button" onClick={() => setMagicLinkUrl(null)} className="text-[11px] text-zinc-500 hover:text-zinc-300">fechar</button>
                  </div>
                </div>
              )}

              {/* Botões de ação global */}
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => sendWhatsapp(activeCreds[0] ?? null)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 text-sm font-semibold hover:bg-blue-600/20 transition"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => generateMagicLink(activeCreds[0]?.id ?? '', true)}
                    disabled={magicLinkLoading || !activeCreds[0]}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold hover:bg-emerald-600/20 transition disabled:opacity-40"
                  >
                    <Link2 className="w-4 h-4" />
                    {magicLinkLoading ? 'Gerando...' : 'Magic Link'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── TAB: Pedido ────────────────────────────────────────────────────── */}
          {activeTab === 'pedido' && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-zinc-800/50 border border-zinc-700 p-3 space-y-1">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Comprador</p>
                  <p className="text-white font-semibold">{order.buyerName}</p>
                  <p className="text-zinc-400 text-xs">{order.buyerCpf}</p>
                  <p className="text-zinc-400 text-xs">{order.buyerWhatsapp}</p>
                  {order.buyerEmail && <p className="text-zinc-400 text-xs">{order.buyerEmail}</p>}
                </div>
                <div className="rounded-lg bg-zinc-800/50 border border-zinc-700 p-3 space-y-1">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Financeiro</p>
                  <p className="text-white font-bold text-base">{formatBrl(order.totalAmount)}</p>
                  <p className="text-zinc-400 text-xs">{order.qty}x unidade(s)</p>
                  <p className="text-zinc-400 text-xs">PIX · Banco Inter</p>
                </div>
              </div>

              <div className="rounded-lg bg-zinc-800/50 border border-zinc-700 p-3 space-y-1">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Produto</p>
                <p className="text-white">{order.listing.title}</p>
                <p className="text-zinc-500 text-xs">{order.listing.assetCategory.replace('_', ' ')}</p>
                {order.stockProductNameSnapshot && (
                  <p className="text-zinc-500 text-xs">Estoque: {order.stockProductNameSnapshot} {order.stockProductCodeSnapshot ? `· ${order.stockProductCodeSnapshot}` : ''}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-zinc-500">Aprovado em</p>
                  <p className="text-zinc-300">{formatDate(order.paidAt)}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Garantia até</p>
                  <p className={order.inWarranty ? 'text-emerald-400' : 'text-zinc-300'}>{formatDate(order.warrantyEndsAt)}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Vendedor</p>
                  <p className="text-zinc-300">{order.seller?.name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-zinc-500">E2E ID (PIX)</p>
                  <p className="text-zinc-300 font-mono text-[10px] break-all">{order.interE2eId ?? '—'}</p>
                </div>
              </div>

              {(order.utmSource || order.utmMedium || order.utmCampaign) && (
                <div className="rounded-lg bg-zinc-800/50 border border-zinc-700 p-3 space-y-1 text-xs">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide">UTMs de Origem</p>
                  {order.utmSource   && <p className="text-zinc-400">Source: <span className="text-zinc-200">{order.utmSource}</span></p>}
                  {order.utmMedium   && <p className="text-zinc-400">Medium: <span className="text-zinc-200">{order.utmMedium}</span></p>}
                  {order.utmCampaign && <p className="text-zinc-400">Campaign: <span className="text-zinc-200">{order.utmCampaign}</span></p>}
                </div>
              )}

              <a
                href={`/loja/${order.listing.slug}?checkoutId=${order.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Abrir checkout público
              </a>
            </div>
          )}

          {/* ── TAB: Logs ──────────────────────────────────────────────────────── */}
          {activeTab === 'logs' && (
            <div className="space-y-2">
              {order.credentials.flatMap((c) => c.logs).length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-8">Nenhum log de alteração registrado.</p>
              ) : (
                order.credentials.flatMap((c) =>
                  c.logs.map((l) => (
                    <div key={l.id} className="rounded-lg bg-zinc-800/50 border border-zinc-700 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-zinc-200 font-semibold">{CREDENTIAL_ACTION_LABELS[l.action] ?? l.action}</span>
                        <span className="text-zinc-500">{formatDate(l.createdAt)}</span>
                      </div>
                      <p className="text-zinc-500 mt-0.5">Por: {l.actorName ?? 'Sistema'}</p>
                      {l.details && Object.keys(l.details).length > 0 && (
                        <p className="text-zinc-600 mt-0.5 font-mono">{JSON.stringify(l.details)}</p>
                      )}
                    </div>
                  ))
                ).sort((a, b) => 0)
              )}
            </div>
          )}

        </div>

        {/* Modal: adicionar credencial */}
        {adding && (
          <div className="absolute inset-0 z-10 bg-black/50 flex items-end justify-center" onClick={() => setAdding(false)}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-t-2xl w-full max-w-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <p className="font-bold text-white">Adicionar Credencial</p>
                <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <form onSubmit={submitAdd} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Login / E-mail da conta">
                    <input className="input-dark" value={form.loginEmail} onChange={(e) => setForm({ ...form, loginEmail: e.target.value })} placeholder="login@plataforma.com" />
                  </Field>
                  <Field label="Senha">
                    <input className="input-dark" type="text" value={form.loginPassword} onChange={(e) => setForm({ ...form, loginPassword: e.target.value })} placeholder="Senha de acesso" />
                  </Field>
                  <Field label="E-mail de Recuperação">
                    <input className="input-dark" value={form.recoveryEmail} onChange={(e) => setForm({ ...form, recoveryEmail: e.target.value })} placeholder="recuperacao@email.com" />
                  </Field>
                  <Field label="Seed 2FA (TOTP)">
                    <input className="input-dark" value={form.twoFaSeed} onChange={(e) => setForm({ ...form, twoFaSeed: e.target.value })} placeholder="JBSWY3DPEHPK3PXP..." />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Origem">
                    <select className="input-dark" value={form.assetOrigin} onChange={(e) => setForm({ ...form, assetOrigin: e.target.value as AssetOrigin })}>
                      <option value="INTERNAL">Produção Interna</option>
                      <option value="EXTERNAL">Fornecedor Externo</option>
                    </select>
                  </Field>
                  {form.assetOrigin === 'INTERNAL' ? (
                    <Field label="Executor (nome)">
                      <input className="input-dark" value={form.executorName} onChange={(e) => setForm({ ...form, executorName: e.target.value })} placeholder="Ex: Ramon, Gabriela" />
                    </Field>
                  ) : (
                    <Field label="Nome do Fornecedor">
                      <input className="input-dark" value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} placeholder="Ex: Fornecedor XYZ" />
                    </Field>
                  )}
                </div>
                <Field label="Observação técnica (opcional)">
                  <textarea className="input-dark resize-none h-16" value={form.supportNote} onChange={(e) => setForm({ ...form, supportNote: e.target.value })} placeholder="Anote contexto técnico para o time de suporte..." />
                </Field>
                {formError && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">{formError}</p>}
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 text-xs text-zinc-400 hover:text-white">Cancelar</button>
                  <button type="submit" disabled={formSaving} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50">
                    {formSaving ? 'Salvando...' : 'Salvar Credencial'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: nota de suporte */}
        {noteCredId && (
          <div className="absolute inset-0 z-10 bg-black/50 flex items-center justify-center" onClick={() => setNoteCredId(null)}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
              <p className="font-bold text-white">Observação Técnica</p>
              <textarea
                className="input-dark w-full resize-none h-24"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Anote contexto técnico para o time de suporte..."
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setNoteCredId(null)} className="px-4 py-2 text-xs text-zinc-400 hover:text-white">Cancelar</button>
                <button onClick={submitNote} disabled={noteSaving} className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-semibold disabled:opacity-50">
                  {noteSaving ? 'Salvando...' : 'Salvar Nota'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Troca Rápida 1 clique */}
        {trocaRapidaCredId && (
          <div className="absolute inset-0 z-10 bg-black/60 flex items-end justify-center" onClick={() => setTrocaRapidaCredId(null)}>
            <div className="bg-zinc-900 border border-amber-500/30 rounded-t-2xl w-full max-w-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-white flex items-center gap-2"><RotateCcw className="w-4 h-4 text-amber-400" /> Troca Rápida</p>
                  <p className="text-[11px] text-zinc-500">Substitui a conta, reserva novo ativo do estoque e gera novo magic link automaticamente.</p>
                </div>
                <button onClick={() => setTrocaRapidaCredId(null)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <form onSubmit={submitTrocaRapida} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Motivo">
                    <select className="input-dark" value={trocaRapidaForm.replacementReason} onChange={(e) => setTrocaRapidaForm({ ...trocaRapidaForm, replacementReason: e.target.value as ReplacementReason })}>
                      {Object.entries(REPLACEMENT_REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="Nota (opcional)">
                    <input className="input-dark" value={trocaRapidaForm.replacementNote} onChange={(e) => setTrocaRapidaForm({ ...trocaRapidaForm, replacementNote: e.target.value })} placeholder="Detalhes..." />
                  </Field>
                </div>
                <p className="text-xs font-semibold text-zinc-400">Credenciais da nova conta (opcional — pode preencher depois):</p>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Login / E-mail">
                    <input className="input-dark" value={trocaRapidaForm.newLoginEmail} onChange={(e) => setTrocaRapidaForm({ ...trocaRapidaForm, newLoginEmail: e.target.value })} />
                  </Field>
                  <Field label="Senha">
                    <input className="input-dark" type="text" value={trocaRapidaForm.newLoginPassword} onChange={(e) => setTrocaRapidaForm({ ...trocaRapidaForm, newLoginPassword: e.target.value })} />
                  </Field>
                  <Field label="Origem">
                    <select className="input-dark" value={trocaRapidaForm.newAssetOrigin} onChange={(e) => setTrocaRapidaForm({ ...trocaRapidaForm, newAssetOrigin: e.target.value as AssetOrigin })}>
                      <option value="INTERNAL">Produção Interna</option>
                      <option value="EXTERNAL">Fornecedor Externo</option>
                    </select>
                  </Field>
                  {trocaRapidaForm.newAssetOrigin === 'INTERNAL' ? (
                    <Field label="Executor">
                      <input className="input-dark" value={trocaRapidaForm.newExecutorName} onChange={(e) => setTrocaRapidaForm({ ...trocaRapidaForm, newExecutorName: e.target.value })} placeholder="Ex: Ramon" />
                    </Field>
                  ) : (
                    <Field label="Fornecedor">
                      <input className="input-dark" value={trocaRapidaForm.newSupplierName} onChange={(e) => setTrocaRapidaForm({ ...trocaRapidaForm, newSupplierName: e.target.value })} />
                    </Field>
                  )}
                </div>
                <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                  <input type="checkbox" checked={trocaRapidaForm.sendWhatsapp} onChange={(e) => setTrocaRapidaForm({ ...trocaRapidaForm, sendWhatsapp: e.target.checked })} className="rounded" />
                  Enviar WhatsApp com novo link ao cliente
                </label>
                {formError && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">{formError}</p>}
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setTrocaRapidaCredId(null)} className="px-4 py-2 text-xs text-zinc-400 hover:text-white">Cancelar</button>
                  <button type="submit" disabled={trocaSaving} className="px-4 py-2 rounded-lg bg-amber-600/80 hover:bg-amber-700 text-white text-xs font-semibold disabled:opacity-50">
                    {trocaSaving ? 'Executando...' : '⚡ Trocar em 1 Clique'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: substituição */}
        {replaceCredId && (
          <div className="absolute inset-0 z-10 bg-black/50 flex items-end justify-center" onClick={() => setReplaceCredId(null)}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-t-2xl w-full max-w-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <p className="font-bold text-white">Substituir Conta</p>
                <button onClick={() => setReplaceCredId(null)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <form onSubmit={submitReplace} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Motivo da substituição">
                    <select className="input-dark" value={replaceForm.replacementReason} onChange={(e) => setReplaceForm({ ...replaceForm, replacementReason: e.target.value as ReplacementReason })}>
                      {Object.entries(REPLACEMENT_REASON_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Nota (opcional)">
                    <input className="input-dark" value={replaceForm.replacementNote} onChange={(e) => setReplaceForm({ ...replaceForm, replacementNote: e.target.value })} placeholder="Detalhes do problema..." />
                  </Field>
                </div>
                <p className="text-xs text-zinc-400 font-semibold">Nova conta:</p>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Login / E-mail">
                    <input className="input-dark" value={replaceForm.loginEmail} onChange={(e) => setReplaceForm({ ...replaceForm, loginEmail: e.target.value })} />
                  </Field>
                  <Field label="Senha">
                    <input className="input-dark" type="text" value={replaceForm.loginPassword} onChange={(e) => setReplaceForm({ ...replaceForm, loginPassword: e.target.value })} />
                  </Field>
                  <Field label="Origem">
                    <select className="input-dark" value={replaceForm.assetOrigin} onChange={(e) => setReplaceForm({ ...replaceForm, assetOrigin: e.target.value as AssetOrigin })}>
                      <option value="INTERNAL">Produção Interna</option>
                      <option value="EXTERNAL">Fornecedor Externo</option>
                    </select>
                  </Field>
                  {replaceForm.assetOrigin === 'INTERNAL' ? (
                    <Field label="Executor">
                      <input className="input-dark" value={replaceForm.executorName} onChange={(e) => setReplaceForm({ ...replaceForm, executorName: e.target.value })} placeholder="Ex: Ramon" />
                    </Field>
                  ) : (
                    <Field label="Fornecedor">
                      <input className="input-dark" value={replaceForm.supplierName} onChange={(e) => setReplaceForm({ ...replaceForm, supplierName: e.target.value })} />
                    </Field>
                  )}
                </div>
                {formError && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">{formError}</p>}
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setReplaceCredId(null)} className="px-4 py-2 text-xs text-zinc-400 hover:text-white">Cancelar</button>
                  <button type="submit" disabled={formSaving} className="px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50">
                    {formSaving ? 'Substituindo...' : 'Confirmar Substituição'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function PosVendaClient({ userRole }: { userRole: string }) {
  const canEdit = ['ADMIN', 'CEO', 'DELIVERER'].includes(userRole)

  const [mainTab, setMainTab] = useState<'pedidos' | 'saude'>('pedidos')
  const [rows, setRows]         = useState<OrderRow[]>([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [page, setPage]         = useState(0)
  const limit = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) })
      if (search.trim())  params.set('q', search.trim())
      if (statusFilter)   params.set('status', statusFilter)
      const res  = await fetch(`/api/admin/pos-venda?${params.toString()}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json() as { items: OrderRow[]; total: number }
        setRows(data.items)
        setTotal(data.total)
      }
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, page])

  useEffect(() => { load() }, [load])

  // KPIs rápidos
  const kpiActive      = useMemo(() => rows.filter((r) => r.credentials.some((c) => c.assetStatus === 'DELIVERED')).length, [rows])
  const kpiNoCredential = useMemo(() => rows.filter((r) => !r.hasCredentials).length, [rows])
  const kpiInWarranty  = useMemo(() => rows.filter((r) => r.inWarranty).length, [rows])
  const kpiReplaced    = useMemo(() => rows.filter((r) => r.credentials.some((c) => c.assetStatus === 'REPLACED')).length, [rows])

  return (
    <div className="space-y-5">

      {/* Tabs principais */}
      <div className="flex gap-1 border-b border-zinc-800 pb-2">
        {([
          { id: 'pedidos', label: 'Pedidos & Credenciais' },
          { id: 'saude',   label: '❤️ Saúde por Fornecedor' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMainTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              mainTab === tab.id
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Saúde */}
      {mainTab === 'saude' && <SaudeClient />}

      {/* Tab: Pedidos */}
      {mainTab !== 'saude' && <>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />, label: 'Contas Ativas', value: kpiActive },
          { icon: <Shield className="w-4 h-4 text-blue-400" />,         label: 'Em Garantia',   value: kpiInWarranty },
          { icon: <RefreshCw className="w-4 h-4 text-amber-400" />,      label: 'Substituídas',  value: kpiReplaced },
          { icon: <AlertTriangle className="w-4 h-4 text-red-400" />,    label: 'Sem Credencial', value: kpiNoCredential },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 flex items-center gap-3">
            {k.icon}
            <div>
              <p className="text-xs text-zinc-500">{k.label}</p>
              <p className="text-lg font-bold text-white">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Barra de busca e filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            className="input-dark pl-9 w-full"
            placeholder="Buscar por nome, CPF, WhatsApp, TXID..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          />
        </div>
        <select
          className="input-dark sm:w-48"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0) }}
        >
          <option value="">Todos os status</option>
          <option value="NO_CREDENTIAL">Sem credencial</option>
          {Object.entries(ASSET_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-5 h-5 text-zinc-500 animate-spin mx-auto" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-sm">
            Nenhum pedido encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-800/50 text-zinc-400 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Produto</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-center">Garantia</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-center">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {rows.map((r) => {
                  const primaryStatus = r.credentials.find((c) => c.assetStatus !== 'REPLACED')?.assetStatus ?? null
                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-zinc-800/30 transition cursor-pointer"
                      onClick={() => setSelectedId(r.id)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{r.buyerName}</p>
                        <p className="text-zinc-500 text-xs">{r.buyerWhatsapp}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-zinc-200">{r.listing.title}</p>
                        <p className="text-zinc-500 text-xs">{r.qty}x · {r.listing.assetCategory.replace('_', ' ')}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-400">
                        {formatBrl(r.totalAmount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.inWarranty ? (
                          <Shield className="w-4 h-4 text-emerald-400 mx-auto" />
                        ) : r.warrantyExpired ? (
                          <ShieldAlert className="w-4 h-4 text-zinc-600 mx-auto" />
                        ) : (
                          <span className="text-zinc-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {!r.hasCredentials ? (
                          <Badge label="Sem credencial" color="bg-red-500/10 text-red-400 border-red-500/20" />
                        ) : primaryStatus ? (
                          <Badge label={ASSET_STATUS_LABELS[primaryStatus]} color={ASSET_STATUS_COLORS[primaryStatus]} />
                        ) : (
                          <span className="text-zinc-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">{formatDate(r.paidAt)}</td>
                      <td className="px-4 py-3 text-center">
                        <ChevronRight className="w-4 h-4 text-zinc-500 mx-auto" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação */}
      {total > limit && (
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>{total} pedidos no total</span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 disabled:opacity-40 hover:bg-zinc-700"
            >
              Anterior
            </button>
            <span className="px-2 py-1.5">Pág. {page + 1}/{Math.ceil(total / limit)}</span>
            <button
              disabled={(page + 1) * limit >= total}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 disabled:opacity-40 hover:bg-zinc-700"
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      {/* Modal de detalhes */}
      {selectedId && (
        <OrderModal
          checkoutId={selectedId}
          canEdit={canEdit}
          onClose={() => setSelectedId(null)}
        />
      )}

      </> /* fim tab pedidos */}
    </div>
  )
}
