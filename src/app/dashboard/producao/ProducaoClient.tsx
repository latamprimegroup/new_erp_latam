'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Eye, EyeOff, Copy, Check, Search, Pencil, Trash2, Send, FileText, ShieldAlert, ClipboardList, Loader2 } from 'lucide-react'
import { SkeletonCards, SkeletonTable } from '@/components/Skeleton'
import { ProductionChecklist } from '@/components/producao/ProductionChecklist'
import { ProductionFeedback } from '@/components/producao/ProductionFeedback'
import { NotificationsBell } from '@/components/NotificationsBell'
import { productionAccountCreateSchema } from '@/lib/schemas/production-account-create'
import { GLOBAL_CURRENCY_OPTIONS } from '@/lib/global-currencies'
import { RMATab } from '@/app/dashboard/compras/RMATab'

const ROLE_BADGE: Record<string, string> = {
  ADMIN: 'Admin',
  PRODUCER: 'Produção',
  PRODUCTION_MANAGER: 'Gerente produção',
  FINANCE: 'Financeiro',
  DELIVERER: 'Entregas',
  COMMERCIAL: 'Vendas',
}

const PLATFORMS = [
  { value: 'GOOGLE_ADS', label: 'Google Ads' },
  { value: 'META_ADS', label: 'Meta Ads' },
  { value: 'KWAI_ADS', label: 'Kwai Ads' },
  { value: 'TIKTOK_ADS', label: 'TikTok Ads' },
  { value: 'OTHER', label: 'Outro' },
]

const ACCOUNT_TYPES = [
  { value: 'WHITE', label: 'WHITE', color: '#10b981' },
  { value: 'BLACK', label: 'BLACK', color: '#3b82f6' },
  { value: 'G2_PREMIUM', label: 'G2 Premium', color: '#8b5cf6' },
  { value: 'BOV_PENDENTE', label: 'BOV Pendente', color: '#f59e0b' },
  { value: 'EM_CONTESTACAO', label: 'Em Contestação', color: '#f97316' },
  { value: '__OUTRO__', label: 'Outro (digitar)', color: '#6b7280' },
]

function getTypeColor(type: string): string {
  const found = ACCOUNT_TYPES.find((t) => t.value === type)
  return found?.color ?? '#6b7280'
}

const PRODUCTION_NICHES = [
  { value: 'NUTRA', label: 'Nutra' },
  { value: 'IGAMING', label: 'iGaming' },
  { value: 'LOCAL', label: 'Local' },
  { value: 'ECOM', label: 'E-commerce' },
  { value: 'OTHER', label: 'Outro' },
] as const

const VERIFICATION_GOALS = [
  { value: 'G2_AND_ADVERTISER', label: 'G2 + Anunciante' },
  { value: 'ADVERTISER_AND_COMMERCIAL_OPS', label: 'Anunciante + Operações Comerciais' },
] as const

function formatAccountId(v: string): string {
  const d = v.replace(/\D/g, '')
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 10)}`
}

type Account = {
  id: string
  accountCode: string | null
  platform: string
  type: string
  email: string | null
  cnpj: string | null
  countryId: string | null
  status: string
  rejectionReason: string | null
  producerId: string
  producer: { name: string | null }
  createdAt: string
  googleAdsCustomerId: string | null
  currency: string | null
  a2fCode: string | null
  g2ApprovalCode: string | null
  siteUrl: string | null
  cnpjBizLink: string | null
  hasPassword: boolean
  productionNiche?: string
  verificationGoal?: string | null
  primaryDomain?: string | null
  proxyNote?: string | null
  proxyConfigured?: boolean
  cnpjPdfUrl?: string | null
  passwordPlain?: string | null
  // Melhoria 15/04/2026 — Checkpoint de Auditoria
  productionCost?: number | null
  warmupStatus?: 'NORMAL' | 'WARM_UP' | 'READY_TO_SCALE' | 'FLAGGED' | null
  quarantineUntil?: string | null
  quarantineHours?: number | null
  deadAt?: string | null
  deadReason?: string | null
}

/** Identificador que o utilizador opera: código manual; senão ID Google Ads; nunca o cuid interno. */
function displayAccountId(a: Account): string {
  const code = a.accountCode?.trim()
  if (code) return code
  const g = a.googleAdsCustomerId?.trim()
  if (g) return g
  return '—'
}

/** Texto auxiliar sob o identificador (ex.: Google quando o código manual é o principal). */
function accountIdSubtitle(a: Account): string | null {
  const code = a.accountCode?.trim()
  const g = a.googleAdsCustomerId?.trim()
  if (code && g) return `Google Ads: ${g}`
  if (!code && !g) return 'Defina o identificador manual em Editar (não exibimos o ID automático do sistema).'
  return null
}

/** Valor a copiar: código manual, ou Google, ou ID interno só como último recurso. */
function copyableAccountId(a: Account): string {
  const code = a.accountCode?.trim()
  if (code) return code
  const g = a.googleAdsCustomerId?.trim()
  if (g) return g
  return a.id
}

function nicheLabel(v: string | undefined) {
  const f = PRODUCTION_NICHES.find((n) => n.value === v)
  return f?.label ?? v ?? '—'
}

function statusLabel(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'Pendente'
    case 'UNDER_REVIEW':
      return 'Em análise (verificação)'
    case 'IN_ANALYSIS':
      return 'Em análise'
    case 'QUARANTINE':
      return 'Quarentena'
    case 'APPROVED':
      return 'Aprovada (verificada)'
    case 'REJECTED':
      return 'Rejeitada'
    case 'DEAD':
      return 'Baixada (Dead)'
    case 'IN_USE':
      return 'Em uso'
    case 'AVAILABLE':
      return 'Disponível'
    case 'DELIVERED':
      return 'Entregue'
    default:
      return status
  }
}

function warmupLabel(ws: string | null | undefined): string {
  switch (ws) {
    case 'WARM_UP': return 'Aquecimento'
    case 'READY_TO_SCALE': return 'Pronta para Escalar'
    case 'FLAGGED': return 'Com Aviso'
    default: return 'Normal'
  }
}

function warmupBadge(ws: string | null | undefined) {
  if (!ws || ws === 'NORMAL') return null
  const map: Record<string, { label: string; cls: string }> = {
    WARM_UP: { label: '🔥 Aquecimento', cls: 'bg-orange-500/20 text-orange-800 dark:text-orange-200 border-orange-600/30' },
    READY_TO_SCALE: { label: '🚀 Pronta', cls: 'bg-green-500/20 text-green-800 dark:text-green-200 border-green-600/30' },
    FLAGGED: { label: '⚠️ Com Aviso', cls: 'bg-red-500/20 text-red-800 dark:text-red-200 border-red-600/30' },
  }
  const cfg = map[ws]
  if (!cfg) return null
  return (
    <span className={`inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function quarantineBadge(quarantineUntil: string | null | undefined) {
  if (!quarantineUntil) return null
  const until = new Date(quarantineUntil)
  const remaining = Math.ceil((until.getTime() - Date.now()) / (1000 * 60 * 60))
  if (remaining <= 0) return null
  return (
    <span
      className="inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-purple-500/20 text-purple-800 dark:text-purple-200 border border-purple-600/30"
      title={`Em quarentena até ${until.toLocaleString('pt-BR')}`}
    >
      🔒 Quarentena {remaining}h
    </span>
  )
}

/** Alerta visual quando pendente ou em análise há mais de 24 h (SLA da fila). */
function slaPendingBadge(createdAt: string, status: string) {
  if (status !== 'PENDING' && status !== 'UNDER_REVIEW') return null
  const hours = (Date.now() - new Date(createdAt).getTime()) / 3_600_000
  if (hours < 24) return null
  const hRounded = Math.round(hours)
  const days = Math.floor(hours / 24)
  return (
    <span
      className="inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-600/30 dark:border-amber-500/40"
      title={`Na fila há ${hRounded} h (acima do SLA de 24 h)`}
    >
      SLA +24h{days >= 1 ? ` · ${days}d` : ` · ${hRounded}h`}
    </span>
  )
}

/** Dias corridos desde o registro (referência de fila / aquecimento). */
function daysSinceRegistration(createdAt: string) {
  const start = new Date(createdAt).setHours(0, 0, 0, 0)
  const today = new Date().setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((today - start) / 86_400_000))
}

/** Sinais rápidos de credenciais (complementa o checklist de processo). */
function CredentialHints({ a }: { a: Account }) {
  const has2fa = !!(a.a2fCode && String(a.a2fCode).trim())
  return (
    <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 max-w-[11rem]">
      <span title={a.hasPassword ? 'Senha registrada no sistema' : 'Senha ainda não cadastrada'}>
        {a.hasPassword ? '✓ Senha' : '○ Senha'}
      </span>
      <span title={has2fa ? '2FA / chave informada' : '2FA não informado'}>
        {has2fa ? '✓ 2FA' : '○ 2FA'}
      </span>
      <span title={a.proxyConfigured ? 'Proxy/perfil (sessão) sinalizado' : 'Proxy/perfil não sinalizado'}>
        {a.proxyConfigured ? '✓ Sessão' : '○ Sessão'}
      </span>
    </div>
  )
}

type StockItem = {
  id: string
  email?: string
  cnpj?: string
  razaoSocial?: string
  type?: string
  gateway?: string
  assignedAt?: string
}

type StockDisponivel = {
  disponivel: { emails: number; cnpjs: number; perfisPagamento: number }
  reservadoParaMim: { emails: number; cnpjs: number; perfisPagamento: number }
}

export function ProducaoClient() {
  const { data: session } = useSession()
  const canApprove = session?.user?.role === 'ADMIN' || session?.user?.role === 'FINANCE'
  const [mainSection, setMainSection] = useState<'producao' | 'trocas'>('producao')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [kpis, setKpis] = useState({
    daily: 0,
    monthly: 0,
    dailyProd: 0,
    monthlyProd: 0,
    dailyG2: 0,
    monthlyG2: 0,
    pendingReview: 0,
  })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [mode, setMode] = useState<'manual' | 'estoque'>('manual')
  const [formTab, setFormTab] = useState<'dados' | 'senha'>('dados')
  const [showPasswordCreate, setShowPasswordCreate] = useState(false)
  const [form, setForm] = useState({
    accountCode: '',
    password: '',
    platform: 'GOOGLE_ADS' as string,
    type: '',
    typeCustom: '',
    email: '',
    cnpj: '',
    emailId: '',
    cnpjId: '',
    paymentProfileId: '',
    googleAdsCustomerId: '',
    currency: 'BRL',
    a2fCode: '',
    g2ApprovalCode: '',
    siteUrl: '',
    cnpjBizLink: '',
    productionNiche: 'OTHER' as string,
    verificationGoal: 'G2_AND_ADVERTISER' as string,
    primaryDomain: '',
    proxyNote: '',
    proxyConfigured: false,
    productionCost: '' as string,
    warmupStatus: 'NORMAL' as string,
  })
  const [cnpjPdfFile, setCnpjPdfFile] = useState<File | null>(null)
  const [editCnpjPdfFile, setEditCnpjPdfFile] = useState<File | null>(null)
  const [uploadingCnpj, setUploadingCnpj] = useState(false)
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [copiedQuickAction, setCopiedQuickAction] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState(() => new Date())
  const [duplicateBanner, setDuplicateBanner] = useState<string | null>(null)
  const [pdfRenameBanner, setPdfRenameBanner] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [metaMensal, setMetaMensal] = useState(330)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectCode, setRejectCode] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    platform: '',
    type: '',
    typeCustom: '',
    accountCode: '',
    googleAdsCustomerId: '',
    currency: 'BRL',
    a2fCode: '',
    g2ApprovalCode: '',
    siteUrl: '',
    cnpjBizLink: '',
    email: '',
    cnpj: '',
    password: '',
    currentPassword: '',
    productionNiche: 'OTHER' as string,
    verificationGoal: 'G2_AND_ADVERTISER' as string,
    primaryDomain: '',
    proxyNote: '',
    proxyConfigured: false,
  })
  const [editKind, setEditKind] = useState<'full' | 'approved-review'>('full')
  const [managerProducerFilter, setManagerProducerFilter] = useState('')
  const [producers, setProducers] = useState<{ id: string; name: string | null; email: string }[]>([])
  const [pdfPreviewId, setPdfPreviewId] = useState<string | null>(null)
  const [editPasswordVisible, setEditPasswordVisible] = useState(false)
  const [editTab, setEditTab] = useState<'dados' | 'senha' | 'urls'>('dados')

  const REJECTION_CODES = [
    { value: 'DOC_INVALIDO', label: 'Documento inválido' },
    { value: 'EMAIL_BLOQUEADO', label: 'E-mail bloqueado' },
    { value: 'CNPJ_INVALIDO', label: 'CNPJ inválido' },
    { value: 'PAGAMENTO_RECUSADO', label: 'Pagamento recusado' },
    { value: 'DADOS_INCONSISTENTES', label: 'Dados inconsistentes' },
    { value: 'OUTRO', label: 'Outro' },
  ]

  const [stockDisponivel, setStockDisponivel] = useState<StockDisponivel | null>(null)
  const [emailsDisponiveis, setEmailsDisponiveis] = useState<StockItem[]>([])
  const [cnpjsDisponiveis, setCnpjsDisponiveis] = useState<StockItem[]>([])
  const [perfisDisponiveis, setPerfisDisponiveis] = useState<StockItem[]>([])
  const [emailsReservados, setEmailsReservados] = useState<StockItem[]>([])
  const [cnpjsReservados, setCnpjsReservados] = useState<StockItem[]>([])
  const [perfisReservados, setPerfisReservados] = useState<StockItem[]>([])
  const [loadingStock, setLoadingStock] = useState(false)
  const [reservingId, setReservingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkApproving, setBulkApproving] = useState(false)
  // Dead Switch
  const [deadSwitchId, setDeadSwitchId] = useState<string | null>(null)
  const [deadReason, setDeadReason] = useState('')
  const [deadSwitching, setDeadSwitching] = useState(false)
  // Quarentena
  const [quarantineId, setQuarantineId] = useState<string | null>(null)
  const [quarantineHours, setQuarantineHours] = useState(48)

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [filterStatus, searchQuery, managerProducerFilter])

  useEffect(() => {
    if (session?.user?.role === 'ADMIN' || session?.user?.role === 'PRODUCTION_MANAGER') {
      fetch('/api/admin/producers')
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d.users)) setProducers(d.users)
        })
        .catch(() => {})
    }
  }, [session?.user?.role])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const params = new URLSearchParams()
      if (filterStatus) params.set('status', filterStatus)
      if (searchQuery) params.set('q', searchQuery)
      if (
        (session?.user?.role === 'ADMIN' || session?.user?.role === 'PRODUCTION_MANAGER') &&
        managerProducerFilter
      ) {
        params.set('producerId', managerProducerFilter)
      }
      const res = await fetch(`/api/producao?${params}`)
      const data = await res.json()
      if (res.ok) {
        setAccounts(data.accounts)
        const k = data.kpis || {}
        setKpis({
          daily: k.daily ?? 0,
          monthly: k.monthly ?? 0,
          dailyProd: k.dailyProd ?? 0,
          monthlyProd: k.monthlyProd ?? 0,
          dailyG2: k.dailyG2 ?? 0,
          monthlyG2: k.monthlyG2 ?? 0,
          pendingReview: k.pendingReview ?? 0,
        })
        if (typeof data.metaProducaoMensal === 'number' && !Number.isNaN(data.metaProducaoMensal)) {
          setMetaMensal(data.metaProducaoMensal)
        }
      } else {
        setLoadError(typeof data.error === 'string' ? data.error : 'Erro ao carregar a lista.')
      }
    } catch {
      setLoadError('Falha de rede ao carregar a lista.')
    }
    setLoading(false)
  }, [filterStatus, searchQuery, managerProducerFilter, session?.user?.role])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 5200)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    const tick = () => setNowTick(new Date())
    tick()
    const id = window.setInterval(tick, 10_000)
    return () => clearInterval(id)
  }, [])

  async function copyIdentifier(label: string, rowId: string) {
    try {
      await navigator.clipboard.writeText(label)
      setCopiedRowId(rowId)
      window.setTimeout(() => setCopiedRowId(null), 2000)
    } catch {
      alert('Não foi possível copiar. Selecione o texto manualmente.')
    }
  }

  function cnpjPdfDownloadUrl(accountId: string): string {
    const path = `/api/producao/${accountId}/arquivo/cnpj-pdf?download=1`
    if (typeof window === 'undefined') return path
    return `${window.location.origin}${path}`
  }

  async function copyQuickValue(value: string, successMessage: string, actionKey: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedQuickAction(actionKey)
      window.setTimeout(() => {
        setCopiedQuickAction((prev) => (prev === actionKey ? null : prev))
      }, 2000)
      setToast({ kind: 'success', message: successMessage })
    } catch {
      setToast({ kind: 'error', message: 'Não foi possível copiar. Tente novamente.' })
    }
  }

  async function loadStock() {
    setLoadingStock(true)
    const [dispRes, emailsAv, cnpjsAv, perfisAv, emailsRes, cnpjsRes, perfisRes] = await Promise.all([
      fetch('/api/estoque/disponivel'),
      fetch('/api/estoque/itens?tipo=email&status=AVAILABLE'),
      fetch('/api/estoque/itens?tipo=cnpj&status=AVAILABLE'),
      fetch('/api/estoque/itens?tipo=perfil&status=AVAILABLE'),
      fetch('/api/estoque/itens?tipo=email&status=RESERVED'),
      fetch('/api/estoque/itens?tipo=cnpj&status=RESERVED'),
      fetch('/api/estoque/itens?tipo=perfil&status=RESERVED'),
    ])
    if (dispRes.ok) setStockDisponivel(await dispRes.json())
    if (emailsAv.ok) setEmailsDisponiveis(await emailsAv.json())
    if (cnpjsAv.ok) setCnpjsDisponiveis(await cnpjsAv.json())
    if (perfisAv.ok) setPerfisDisponiveis(await perfisAv.json())
    if (emailsRes.ok) setEmailsReservados(await emailsRes.json())
    if (cnpjsRes.ok) setCnpjsReservados(await cnpjsRes.json())
    if (perfisRes.ok) setPerfisReservados(await perfisRes.json())
    setLoadingStock(false)
  }

  useEffect(() => {
    if (showForm && mode === 'estoque') loadStock()
  }, [showForm, mode])

  async function reserveItem(tipo: 'email' | 'cnpj' | 'perfil', id: string) {
    setReservingId(id)
    const res = await fetch('/api/estoque/reservar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, id }),
    })
    if (res.ok) loadStock()
    else { const e = await res.json(); alert(e.error || 'Erro ao reservar') }
    setReservingId(null)
  }

  async function releaseItem(tipo: 'email' | 'cnpj' | 'perfil', id: string) {
    setReservingId(id)
    const res = await fetch('/api/estoque/liberar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, id }),
    })
    if (res.ok) loadStock()
    else { const e = await res.json(); alert(e.error || 'Erro ao liberar') }
    setReservingId(null)
  }

  async function validateFootprintRealtime(input: {
    accountId?: string
    email?: string
    cnpj?: string
    googleAdsCustomerId?: string
    a2fCode?: string
  }) {
    const hasAny =
      !!input.email?.trim() ||
      !!input.cnpj?.trim() ||
      !!input.googleAdsCustomerId?.trim() ||
      !!input.a2fCode?.trim()
    if (!hasAny) return
    const res = await fetch('/api/producao/validate-uniqueness', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) return
    const data = await res.json()
    if (!data.ok && Array.isArray(data.issues) && data.issues.length > 0) {
      setDuplicateBanner(data.issues.join(' '))
    } else if (duplicateBanner) {
      setDuplicateBanner(null)
    }
  }

  const resolvedType = form.type === '__OUTRO__' ? form.typeCustom : form.type

  const basePayload = {
    accountCode: form.accountCode.trim(),
    platform: form.platform,
    type: resolvedType.trim(),
    googleAdsCustomerId: form.googleAdsCustomerId || undefined,
    currency: form.currency,
    a2fCode: form.a2fCode || undefined,
    g2ApprovalCode: form.g2ApprovalCode || undefined,
    siteUrl: form.siteUrl || undefined,
    cnpjBizLink: form.cnpjBizLink || undefined,
    productionNiche: form.productionNiche,
    verificationGoal: form.verificationGoal,
    primaryDomain: form.primaryDomain?.trim() || undefined,
    proxyNote: form.proxyNote?.trim() || undefined,
    proxyConfigured: form.proxyConfigured,
    ...(form.password.trim() ? { password: form.password } : {}),
    ...(form.productionCost ? { productionCost: parseFloat(form.productionCost) } : {}),
    warmupStatus: form.warmupStatus || 'NORMAL',
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.accountCode.trim() || form.accountCode.trim().length < 2) {
      alert('Informe o identificador da conta (mínimo 2 caracteres)')
      return
    }
    if (!resolvedType.trim()) {
      alert('Selecione ou informe o tipo da conta')
      return
    }
    if (!form.verificationGoal) {
      alert('Selecione a meta de verificação (ADS CORE)')
      return
    }
    if (mode === 'manual' && !form.email.trim()) {
      alert('E-mail é obrigatório no formulário de produção.')
      return
    }
    if (mode === 'estoque' && !form.emailId) {
      alert('Selecione um e-mail reservado (obrigatório).')
      return
    }
    if (!form.password.trim()) {
      alert('Senha é obrigatória no formulário de produção.')
      return
    }
    if (!form.a2fCode.trim()) {
      alert('2FA é obrigatório no formulário de produção.')
      return
    }
    if (!cnpjPdfFile) {
      alert('Cartão CNPJ (PDF) é obrigatório.')
      return
    }
    const payload =
      mode === 'estoque' && (form.emailId || form.cnpjId || form.paymentProfileId)
        ? { ...basePayload, emailId: form.emailId || undefined, cnpjId: form.cnpjId || undefined, paymentProfileId: form.paymentProfileId || undefined }
        : { ...basePayload, email: form.email || undefined, cnpj: form.cnpj || undefined }

    const validated = productionAccountCreateSchema.safeParse(payload)
    if (!validated.success) {
      const msg = validated.error.errors[0]?.message ?? 'Dados inválidos'
      alert(msg)
      return
    }

    setDuplicateBanner(null)
    setPdfRenameBanner(null)
    setSubmitting(true)
    const res = await fetch('/api/producao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validated.data),
    })
    const data = res.ok ? ((await res.json()) as Account) : null
    if (res.ok && data) {
      let pdfMessage: string | null = null
      if (cnpjPdfFile && data.id) {
        const fd = new FormData()
        fd.append('file', cnpjPdfFile)
        const pdfRes = await fetch(`/api/producao/${data.id}/cnpj-pdf`, { method: 'POST', body: fd })
        const pdfJson = await pdfRes.json().catch(() => ({}))
        if (pdfRes.ok) {
          pdfMessage =
            typeof pdfJson.filename === 'string'
              ? `Cartão CNPJ salvo como ${pdfJson.filename}.`
              : 'Cartão CNPJ (PDF) enviado e renomeado no storage.'
          if (typeof pdfJson.filename === 'string') {
            setPdfRenameBanner(`Arquivo renomeado para ${pdfJson.filename} e guardado no servidor.`)
          }
        } else {
          setToast({
            kind: 'error',
            message: typeof pdfJson.error === 'string' ? pdfJson.error : 'Falha no upload do PDF.',
          })
        }
        setCnpjPdfFile(null)
      }
      setFormTab('dados')
      setForm({
        accountCode: '',
        password: '',
        platform: 'GOOGLE_ADS',
        type: '',
        typeCustom: '',
        email: '',
        cnpj: '',
        emailId: '',
        cnpjId: '',
        paymentProfileId: '',
        googleAdsCustomerId: '',
        currency: 'BRL',
        a2fCode: '',
        g2ApprovalCode: '',
        siteUrl: '',
        cnpjBizLink: '',
        productionNiche: 'OTHER',
        verificationGoal: 'G2_AND_ADVERTISER',
        primaryDomain: '',
        proxyNote: '',
        proxyConfigured: false,
        productionCost: '',
        warmupStatus: 'NORMAL',
      })
      setShowForm(false)
      await load()
      if (mode === 'estoque') loadStock()
      const created: Account = {
        ...data,
        producer: data.producer ?? { name: session?.user?.name ?? null },
      }
      handleEdit(created)
      setToast({
        kind: 'success',
        message:
          (pdfMessage ? `Produção registrada. ${pdfMessage} ` : 'Produção registrada com sucesso. ') +
          'Painel de edição aberto na linha — confira ou ajuste dados e aba Senha.',
      })
    } else {
      const err = await res.json().catch(() => ({}))
      const msg = typeof err.error === 'string' ? err.error : 'Erro ao registrar'
      if (/produzida|já está em uso|duplic|footprint|domínio já/i.test(msg)) {
        setDuplicateBanner(msg)
      }
      setToast({ kind: 'error', message: msg })
    }
    setSubmitting(false)
  }

  async function handleApprove(id: string) {
    const res = await fetch(`/api/producao/${id}/aprovar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    })
    if (res.ok) {
      setSelectedIds((prev) => {
        const n = new Set(prev)
        n.delete(id)
        return n
      })
      load()
    } else { const e = await res.json(); alert(e.error || 'Erro') }
  }

  async function handleDeadSwitch(id: string, reason: string) {
    if (!reason.trim()) { alert('Informe o motivo da baixa.'); return }
    setDeadSwitching(true)
    try {
      const res = await fetch(`/api/producao/${id}/aprovar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dead', deadReason: reason.trim() }),
      })
      if (res.ok) {
        setDeadSwitchId(null)
        setDeadReason('')
        load()
      } else {
        const e = await res.json()
        alert(e.error || 'Erro ao aplicar Dead Switch')
      }
    } finally {
      setDeadSwitching(false)
    }
  }

  async function handleQuarantine(id: string, hours: number) {
    const res = await fetch(`/api/producao/${id}/aprovar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'quarantine', quarantineHours: hours }),
    })
    if (res.ok) {
      setQuarantineId(null)
      load()
    } else {
      const e = await res.json()
      alert(e.error || 'Erro ao enviar para quarentena')
    }
  }

  const approvableRows = accounts.filter(
    (a) => a.status === 'PENDING' || a.status === 'UNDER_REVIEW' || a.status === 'QUARANTINE'
  )
  const approvableIdList = approvableRows.map((a) => a.id)
  const allApprovableSelected =
    approvableIdList.length > 0 && approvableIdList.every((id) => selectedIds.has(id))

  function toggleRowSelected(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function toggleSelectAllApprovable() {
    if (allApprovableSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(approvableIdList))
  }

  async function handleBulkApprove() {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (
      !confirm(
        `Aprovar ${ids.length} conta(s) selecionada(s)? Cada uma gerará um item no estoque disponível.`
      )
    )
      return
    setBulkApproving(true)
    try {
      const res = await fetch('/api/producao/aprovar-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json()
      if (res.ok) {
        if (data.failedCount > 0) {
          alert(
            `Aprovadas: ${data.approved}. Com falha: ${data.failedCount} (verifique o status na lista).`
          )
        }
        setSelectedIds(new Set())
        load()
      } else {
        alert(typeof data.error === 'string' ? data.error : 'Erro ao aprovar em lote')
      }
    } finally {
      setBulkApproving(false)
    }
  }

  async function handleReject(id: string) {
    if (!rejectReason.trim()) {
      alert('Informe o motivo da rejeição')
      return
    }
    const res = await fetch(`/api/producao/${id}/aprovar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reject',
        rejectionReason: rejectReason.trim(),
        rejectionReasonCode: rejectCode || undefined,
      }),
    })
    if (res.ok) {
      setRejectingId(null)
      setRejectReason('')
      setRejectCode('')
      load()
    } else {
      const e = await res.json()
      alert(e.error || 'Erro')
    }
  }

  const percentMeta = metaMensal > 0 ? Math.min(100, Math.round((kpis.monthly / metaMensal) * 100)) : 0

  const isProducer = session?.user?.role === 'PRODUCER'
  const canManageView =
    session?.user?.role === 'ADMIN' || session?.user?.role === 'PRODUCTION_MANAGER'

  function populateEditFormFromAccount(account: Account, mode: 'full' | 'approved' | 'urls') {
    const isPredefined = ACCOUNT_TYPES.some((t) => t.value === account.type && t.value !== '__OUTRO__')
    setEditForm({
      platform: account.platform,
      type: mode === 'urls' ? account.type : isPredefined ? account.type : '__OUTRO__',
      typeCustom: mode === 'urls' ? '' : isPredefined ? '' : account.type,
      accountCode: account.accountCode || '',
      googleAdsCustomerId: account.googleAdsCustomerId || '',
      currency: account.currency || 'BRL',
      a2fCode: account.a2fCode || '',
      g2ApprovalCode: account.g2ApprovalCode || '',
      siteUrl: account.siteUrl || '',
      cnpjBizLink: account.cnpjBizLink || '',
      email: account.email || '',
      cnpj: account.cnpj || '',
      password: '',
      currentPassword: account.passwordPlain || '',
      productionNiche: account.productionNiche || 'OTHER',
      verificationGoal: account.verificationGoal || 'G2_AND_ADVERTISER',
      primaryDomain: account.primaryDomain || '',
      proxyNote: account.proxyNote || '',
      proxyConfigured: account.proxyConfigured ?? false,
    })
  }

  async function handleEdit(account: Account) {
    setEditingId(account.id)
    setEditKind('full')
    setEditTab('dados')
    populateEditFormFromAccount(account, 'full')
    setEditPasswordVisible(false)
  }

  /** Conta aprovada: conferir dados (leitura), trocar senha, ajustar URLs. */
  function openApprovedReview(account: Account, initialTab: 'dados' | 'senha' | 'urls' = 'dados') {
    setEditingId(account.id)
    setEditKind('approved-review')
    setEditTab(initialTab)
    populateEditFormFromAccount(account, 'full')
    setEditPasswordVisible(false)
  }

  async function copyFooterText(accountId: string) {
    try {
      const res = await fetch(`/api/producao/${accountId}/footer`)
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Erro ao gerar rodapé')
        return
      }
      await navigator.clipboard.writeText(data.text || '')
      alert('Texto do rodapé copiado.')
    } catch {
      alert('Não foi possível copiar. Tente novamente.')
    }
  }

  async function handleSendToReview(id: string) {
    const res = await fetch(`/api/producao/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sendToReview: true }),
    })
    if (res.ok) load()
    else {
      const e = await res.json()
      alert(e.error || 'Erro')
    }
  }

  async function handleEditCnpjUpload(id: string) {
    if (!editCnpjPdfFile) return
    setUploadingCnpj(true)
    try {
      const fd = new FormData()
      fd.append('file', editCnpjPdfFile)
      const res = await fetch(`/api/producao/${id}/cnpj-pdf`, { method: 'POST', body: fd })
      if (res.ok) {
        setEditCnpjPdfFile(null)
        setToast({ kind: 'success', message: 'Cartão CNPJ enviado com sucesso.' })
        load()
      } else {
        const e = await res.json().catch(() => ({}))
        setToast({ kind: 'error', message: e.error || 'Erro ao enviar cartão CNPJ.' })
      }
    } catch {
      setToast({ kind: 'error', message: 'Falha de rede ao enviar PDF.' })
    }
    setUploadingCnpj(false)
  }

  async function handleSaveEdit() {
    if (!editingId) return
    if (editKind === 'approved-review') {
      if (editTab === 'dados') {
        alert('A aba Conferir dados é só leitura. Use Senha ou URLs / domínio para alterações.')
        return
      }
      if (editTab === 'senha') {
        const plain = editForm.password.trim()
        if (plain.length < 4) {
          alert('Informe a nova senha (mínimo 4 caracteres).')
          return
        }
        const res = await fetch(`/api/producao/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: plain }),
        })
        if (res.ok) {
          setEditForm((f) => ({ ...f, password: '' }))
          load()
          alert('Senha atualizada.')
        } else {
          const e = await res.json()
          alert(e.error || 'Erro ao salvar senha')
        }
        return
      }
      if (editTab === 'urls') {
        const payload = {
          siteUrl: editForm.siteUrl || undefined,
          cnpjBizLink: editForm.cnpjBizLink || undefined,
          primaryDomain: editForm.primaryDomain?.trim() || null,
          proxyNote: editForm.proxyNote?.trim() || null,
          proxyConfigured: editForm.proxyConfigured,
        }
        const res = await fetch(`/api/producao/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          load()
          alert('URLs e domínio atualizados.')
        } else {
          const e = await res.json()
          alert(e.error || 'Erro ao salvar')
        }
        return
      }
    }
    const typeVal = editForm.type === '__OUTRO__' ? editForm.typeCustom : editForm.type
    if (!typeVal.trim()) {
      alert('Informe o tipo')
      return
    }
    if (!editForm.accountCode.trim() || editForm.accountCode.trim().length < 2) {
      alert('Informe o identificador da conta (mínimo 2 caracteres)')
      return
    }
    const payload: Record<string, unknown> = {
      platform: editForm.platform,
      type: typeVal.trim(),
      accountCode: editForm.accountCode.trim(),
      googleAdsCustomerId: editForm.googleAdsCustomerId || null,
      currency: editForm.currency,
      a2fCode: editForm.a2fCode || null,
      g2ApprovalCode: editForm.g2ApprovalCode || null,
      siteUrl: editForm.siteUrl || undefined,
      cnpjBizLink: editForm.cnpjBizLink || undefined,
      email: editForm.email || undefined,
      cnpj: editForm.cnpj || undefined,
      productionNiche: editForm.productionNiche,
      verificationGoal: editForm.verificationGoal,
      primaryDomain: editForm.primaryDomain?.trim() || null,
      proxyNote: editForm.proxyNote?.trim() || null,
      proxyConfigured: editForm.proxyConfigured,
    }
    if (editForm.password.trim()) payload.password = editForm.password.trim()

    const res = await fetch(`/api/producao/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      // Se há um PDF novo selecionado, envia junto
      if (editCnpjPdfFile) {
        const fd = new FormData()
        fd.append('file', editCnpjPdfFile)
        const pdfRes = await fetch(`/api/producao/${editingId}/cnpj-pdf`, { method: 'POST', body: fd })
        if (pdfRes.ok) {
          setEditCnpjPdfFile(null)
          setToast({ kind: 'success', message: 'Conta e cartão CNPJ atualizados.' })
        } else {
          setToast({ kind: 'error', message: 'Conta salva, mas erro ao enviar PDF do CNPJ.' })
        }
      }
      setEditingId(null)
      setEditKind('full')
      load()
    } else {
      const e = await res.json()
      alert(e.error || 'Erro ao salvar')
    }
  }

  async function handleDelete(id: string) {
    if (
      !confirm(
        'Excluir este registo de produção? O item deixa de aparecer na lista (exclusão lógica). Esta ação não pode ser desfeita pelo painel.'
      )
    )
      return
    const res = await fetch(`/api/producao/${id}`, { method: 'DELETE' })
    if (res.ok) load()
    else {
      const e = await res.json()
      alert(e.error || 'Erro ao excluir')
    }
  }

  return (
    <div>
      <section
        className="mb-5 rounded-xl border border-gray-200 dark:border-slate-600/50 bg-white/90 dark:bg-slate-900/50 p-4 shadow-sm"
        aria-label="Cabeçalho da tabela de produção"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 min-w-0 max-w-xl">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar conta…"
              className="input-field py-2.5 pl-10 pr-3 w-full text-sm"
              aria-label="Buscar conta na produção"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 justify-start lg:justify-end">
            <div className="hidden sm:block text-right min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {session?.user?.name || session?.user?.email || 'Utilizador'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {session?.user?.role ? ROLE_BADGE[session.user.role] || session.user.role : ''}
              </p>
            </div>
            {session?.user?.role === 'ADMIN' && (
              <Link href="/dashboard/admin" className="btn-secondary text-xs py-2 px-3 shrink-0">
                Admin
              </Link>
            )}
            <NotificationsBell />
          </div>
        </div>
        <p className="sm:hidden text-xs text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-slate-700/80 mt-3">
          {session?.user?.name || session?.user?.email}
          {session?.user?.role ? ` · ${ROLE_BADGE[session.user.role] || session.user.role}` : ''}
        </p>
      </section>

      {/* ── Navegação principal ────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700 mb-5">
        <button
          onClick={() => setMainSection('producao')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            mainSection === 'producao'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          Tabela de Produção
        </button>
        <button
          onClick={() => setMainSection('trocas')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            mainSection === 'trocas'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          Trocas & Reposição
        </button>
      </div>

      {/* ── Seção: Trocas & Reposição ──────────────────────────────────────────── */}
      {mainSection === 'trocas' && (
        <RMATab userRole={session?.user?.role ?? 'PRODUCER'} />
      )}

      {/* ── Seção: Tabela de Produção — ocultada via CSS quando Trocas está ativa */}
      <div className={mainSection === 'trocas' ? 'hidden' : undefined}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
        <div>
          <h1 className="heading-1 text-2xl sm:text-3xl">Tabela de Produção</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Registo de contas no sistema</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-2xl">
            Fluxo: <strong>Pendente</strong> → <strong>Em análise (verificação)</strong> →{' '}
            <strong>Aprovada (verificada)</strong>. Use as abas <strong>Dados da conta</strong> e{' '}
            <strong>Senha</strong> no registo; após criar, o painel de edição abre na linha para conferência. Contas{' '}
            <strong>aprovadas</strong>: botão <strong>Conferir / ajustar</strong> (dados em leitura, senha e URLs
            editáveis). Na lista mostramos o <strong>identificador que você digitou</strong>, não o ID automático do
            sistema (referência interna só no painel e no tooltip).
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 font-mono tabular-nums">
            Atualizado em tempo real — {nowTick.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link
            href="/dashboard/producao-g2?openForm=1"
            className="btn-secondary text-sm"
            title="Abre o módulo G2 com o formulário de nova tarefa"
          >
            Produção Google G2
          </Link>
          <Link href="/dashboard/producao/metrics" className="btn-secondary text-sm">
            Métricas
          </Link>
          <Link href="/dashboard/producao/saldo" className="btn-secondary text-sm">
            Saldo e Saque
          </Link>
        </div>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 max-w-3xl">
        <span className="font-medium text-primary-600">ADS CORE</span> — Fábrica de contas: nicho e meta de verificação alinham site e documentos;
        domínio único reduz footprint; rodapé gerado para paridade com o Google. Gerência usa a{' '}
        <Link href="/dashboard/base" className="underline hover:text-primary-600">
          Base
        </Link>{' '}
        para atribuir lotes a produtores; produtores veem apenas o que lhes foi designado.
      </p>

      {(duplicateBanner || pdfRenameBanner) && (
        <div className="mb-4 space-y-2" role="region" aria-label="Mensagens do formulário">
          {duplicateBanner && (
            <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 px-4 py-3 text-sm text-red-900 dark:text-red-100">
              <span className="font-semibold">Alerta: </span>
              {duplicateBanner}
            </div>
          )}
          {pdfRenameBanner && (
            <div className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
              <span className="font-semibold">Sucesso: </span>
              {pdfRenameBanner}
            </div>
          )}
        </div>
      )}

      {loadError && (
        <div
          className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 text-sm border border-red-200 dark:border-red-800"
          role="alert"
        >
          {loadError}
        </div>
      )}

      {toast && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm border shadow-lg fixed bottom-6 right-6 z-[70] max-w-md ${
            toast.kind === 'success'
              ? 'bg-emerald-950/95 text-emerald-50 border-emerald-700/60'
              : 'bg-red-950/95 text-red-50 border-red-700/60'
          }`}
          role="status"
        >
          {toast.message}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? (
          <SkeletonCards count={4} />
        ) : (
          <>
            <div className="card transition-all duration-200 hover:shadow-ads-md">
              <p className="text-sm text-gray-500">Produção Diária (Total)</p>
              <p className="text-2xl font-bold text-primary-600">{kpis.daily}</p>
              <p className="text-xs text-slate-500 mt-1">
                Contas: {kpis.dailyProd ?? kpis.daily} · G2: {kpis.dailyG2 ?? 0}
              </p>
            </div>
            <div className="card transition-all duration-200 hover:shadow-ads-md">
              <p className="text-sm text-gray-500">Produção Mensal (Total)</p>
              <p className="text-2xl font-bold text-primary-600">{kpis.monthly}</p>
              <p className="text-xs text-slate-500 mt-1">
                Contas: {kpis.monthlyProd ?? kpis.monthly} · G2: {kpis.monthlyG2 ?? 0}
              </p>
            </div>
            <div className="card transition-all duration-200 hover:shadow-ads-md border-sky-200/60 dark:border-sky-800/40">
              <p className="text-sm text-gray-500">Em análise (pipeline)</p>
              <p className="text-2xl font-bold text-sky-600">{kpis.pendingReview ?? 0}</p>
              <p className="text-xs text-slate-500 mt-1">Aguardando conferência / aprovação</p>
            </div>
            <div className="card transition-all duration-200 hover:shadow-ads-md">
              <p className="text-sm text-gray-500">% da Meta</p>
              <p className="text-2xl font-bold text-primary-600">{percentMeta}%</p>
              <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-500 rounded-full transition-all duration-500"
                  style={{ width: `${percentMeta}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                {session?.user?.role === 'PRODUCER' ? (
                  <>Meta individual: {metaMensal.toLocaleString('pt-BR')} contas/mês.</>
                ) : (
                  <>Meta global: {metaMensal.toLocaleString('pt-BR')} contas/mês.</>
                )}
              </p>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Listagem de contas</h2>
          <div className="flex flex-wrap gap-2 items-center justify-end flex-1 min-w-[min(100%,280px)]">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input-field py-1.5 px-2 w-44 text-sm"
            >
              <option value="">Todos status</option>
              <option value="PENDING">Pendente</option>
              <option value="UNDER_REVIEW">Em análise / aguard. verificação</option>
              <option value="APPROVED">Aprovada</option>
              <option value="REJECTED">Rejeitada (erro)</option>
            </select>
            {canManageView && (
              <select
                value={managerProducerFilter}
                onChange={(e) => setManagerProducerFilter(e.target.value)}
                className="input-field py-1.5 px-2 w-52 text-sm"
                title="Filtrar por produtor"
              >
                <option value="">Todos os produtores</option>
                {producers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.email}
                  </option>
                ))}
              </select>
            )}
            <button type="button" onClick={() => setShowForm(!showForm)} className="btn-primary">
              {showForm ? 'Cancelar' : 'Registrar Produção'}
            </button>
          </div>
        </div>

        {canApprove && approvableIdList.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mb-4 px-3 py-2.5 rounded-lg border border-primary-500/20 bg-primary-500/5 dark:bg-primary-900/15">
            <button
              type="button"
              onClick={() => void handleBulkApprove()}
              disabled={bulkApproving || selectedIds.size === 0}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {bulkApproving ? 'Aprovando…' : `Aprovar selecionados (${selectedIds.size})`}
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={selectedIds.size === 0}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              Limpar seleção
            </button>
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {approvableIdList.length} conta(s) elegíveis nesta lista (pendente ou em análise).
            </span>
          </div>
        )}

        {showForm && (
          <div className="production-form-area mb-6 p-4 bg-gray-50 dark:bg-slate-900/85 rounded-lg border border-primary-600/5 dark:border-slate-600/40 space-y-4 shadow-sm dark:shadow-black/30">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Formulário de Cadastro de Produção</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Preencha os dados da conta; o PDF do cartão CNPJ é validado como application/pdf no servidor.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('manual')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'manual' ? 'bg-primary-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Informar manualmente
              </button>
              <button
                type="button"
                onClick={() => setMode('estoque')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'estoque' ? 'bg-primary-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Usar do estoque
              </button>
            </div>

            {mode === 'estoque' && (
              <div className="border-t border-gray-200 pt-4">
                <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Estoque de base (e-mails, CNPJs, perfis)</h3>
                {loadingStock ? (
                  <p className="text-sm text-gray-500">Carregando...</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="font-medium text-gray-600 mb-1">Disponível</p>
                      <p>
                        {stockDisponivel?.disponivel.emails ?? 0} e-mails · {stockDisponivel?.disponivel.cnpjs ?? 0} CNPJs ·{' '}
                        {stockDisponivel?.disponivel.perfisPagamento ?? 0} perfis
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-600 mb-1">Reservado para mim</p>
                      <p>
                        {stockDisponivel?.reservadoParaMim.emails ?? 0} e-mails · {stockDisponivel?.reservadoParaMim.cnpjs ?? 0} CNPJs ·{' '}
                        {stockDisponivel?.reservadoParaMim.perfisPagamento ?? 0} perfis
                      </p>
                    </div>
                    <div className="space-y-2">
                      {emailsDisponiveis.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500">E-mails disponíveis</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {emailsDisponiveis.slice(0, 3).map((e) => (
                              <button
                                key={e.id}
                                type="button"
                                onClick={() => reserveItem('email', e.id)}
                                disabled={reservingId === e.id}
                                className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded hover:bg-green-200"
                              >
                                Reservar {e.email?.slice(0, 12)}...
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {cnpjsDisponiveis.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500">CNPJs disponíveis</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {cnpjsDisponiveis.slice(0, 3).map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => reserveItem('cnpj', c.id)}
                                disabled={reservingId === c.id}
                                className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded hover:bg-green-200"
                              >
                                Reservar {c.cnpj?.slice(0, 10)}...
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {perfisDisponiveis.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500">Perfis disponíveis</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {perfisDisponiveis.slice(0, 3).map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => reserveItem('perfil', p.id)}
                                disabled={reservingId === p.id}
                                className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded hover:bg-green-200"
                              >
                                Reservar {p.type}/{p.gateway}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {(emailsDisponiveis.length === 0 && cnpjsDisponiveis.length === 0 && perfisDisponiveis.length === 0) && (
                        <p className="text-xs text-amber-600">Nenhum item disponível. O admin deve cadastrar em Base.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 border-b border-gray-200 dark:border-white/10 pb-2 mb-4">
              <button
                type="button"
                onClick={() => setFormTab('dados')}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium ${
                  formTab === 'dados'
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-gray-200'
                }`}
              >
                Dados da conta
              </button>
              <button
                type="button"
                onClick={() => setFormTab('senha')}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium inline-flex items-center gap-2 ${
                  formTab === 'senha'
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-gray-200'
                }`}
              >
                Senha
                <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-500/25 text-amber-900 dark:text-amber-100 px-1.5 py-0.5 rounded">
                  Obrigatória
                </span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {formTab === 'senha' ? (
                <div className="max-w-md space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Identificador da conta *</label>
                    <input
                      type="text"
                      value={form.accountCode}
                      onChange={(e) => setForm((f) => ({ ...f, accountCode: e.target.value }))}
                      className="input-field font-mono"
                      placeholder="Mesmo identificador da aba Dados"
                      required
                      minLength={2}
                      maxLength={120}
                    />
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    A senha é armazenada com segurança (hash bcrypt). Obrigatória no envio do cadastro — pode
                    conferir ou alterar depois em <strong>Editar</strong> (aba Senha).
                  </p>
                  <label className="block text-sm font-medium mb-1">Senha da conta *</label>
                  <div className="flex gap-2">
                    <input
                      type={showPasswordCreate ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      className="input-field flex-1"
                      placeholder="Obrigatória"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordCreate((v) => !v)}
                      className="btn-secondary px-3 shrink-0"
                      title={showPasswordCreate ? 'Ocultar' : 'Mostrar'}
                      aria-label={showPasswordCreate ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPasswordCreate ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Identificador da conta *</label>
                  <input
                    type="text"
                    value={form.accountCode}
                    onChange={(e) => setForm((f) => ({ ...f, accountCode: e.target.value }))}
                    className="input-field font-mono"
                    placeholder="ID que você usa para localizar esta conta (único)"
                    required
                    minLength={2}
                    maxLength={120}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Este código aparece na lista no lugar do ID interno do sistema.
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300/90 mt-1">
                    Antes de salvar, abra a aba <strong>Senha</strong> — a senha da conta é obrigatória.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Plataforma</label>
                  <select
                    value={form.platform}
                    onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                    className="input-field"
                    required
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Tipo</label>
                  <select
                    value={ACCOUNT_TYPES.some((t) => t.value === form.type) ? form.type : '__OUTRO__'}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        type: e.target.value,
                        typeCustom: e.target.value === '__OUTRO__' ? f.typeCustom : '',
                      }))
                    }
                    className="input-field"
                    required={form.type !== '__OUTRO__'}
                  >
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {form.type === '__OUTRO__' && (
                    <input
                      type="text"
                      value={form.typeCustom}
                      onChange={(e) => setForm((f) => ({ ...f, typeCustom: e.target.value }))}
                      className="input-field mt-2"
                      placeholder="Ex: Ads USD"
                      required
                    />
                  )}
                </div>

                <div className="md:col-span-2 border border-primary-500/20 rounded-lg p-3 bg-primary-500/5 dark:bg-primary-900/10">
                  <p className="text-xs font-medium text-primary-700 dark:text-primary-300 mb-2">
                    ADS CORE — nicho, meta e footprint
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Nicho *</label>
                      <select
                        value={form.productionNiche}
                        onChange={(e) => setForm((f) => ({ ...f, productionNiche: e.target.value }))}
                        className="input-field"
                        required
                      >
                        {PRODUCTION_NICHES.map((n) => (
                          <option key={n.value} value={n.value}>
                            {n.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Meta de verificação *</label>
                      <select
                        value={form.verificationGoal}
                        onChange={(e) => setForm((f) => ({ ...f, verificationGoal: e.target.value }))}
                        className="input-field"
                        required
                      >
                        {VERIFICATION_GOALS.map((g) => (
                          <option key={g.value} value={g.value}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1">Domínio principal (único no sistema)</label>
                      <input
                        type="text"
                        value={form.primaryDomain}
                        onChange={(e) => setForm((f) => ({ ...f, primaryDomain: e.target.value }))}
                        className="input-field"
                        placeholder="ex.: loja.com.br (sem duplicar em outra conta)"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1">Nota de proxy (Proxy Cheap / AdsPower)</label>
                      <input
                        type="text"
                        value={form.proxyNote}
                        onChange={(e) => setForm((f) => ({ ...f, proxyNote: e.target.value }))}
                        className="input-field"
                        placeholder="Identificador ou perfil usado"
                      />
                      <label className="inline-flex items-center gap-2 mt-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.proxyConfigured}
                          onChange={(e) => setForm((f) => ({ ...f, proxyConfigured: e.target.checked }))}
                        />
                        Proxy configurado nesta conta
                      </label>
                    </div>
                  </div>
                </div>

                {/* Checkpoint de Auditoria — Melhoria 15/04/2026 */}
                <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 bg-zinc-50 dark:bg-zinc-800/40">
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-3 uppercase tracking-wide">Checkpoint de Inventário</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Custo de Produção (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.productionCost}
                        onChange={(e) => setForm((f) => ({ ...f, productionCost: e.target.value }))}
                        className="input-field"
                        placeholder="Ex: 12.50 (chip + proxy)"
                      />
                      <p className="text-[10px] text-zinc-500 mt-0.5">Alimenta o BI de ROI da operação</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Status de Qualidade</label>
                      <select
                        value={form.warmupStatus}
                        onChange={(e) => setForm((f) => ({ ...f, warmupStatus: e.target.value }))}
                        className="input-field"
                      >
                        <option value="NORMAL">Normal</option>
                        <option value="WARM_UP">🔥 Aquecimento (Warm-up)</option>
                        <option value="READY_TO_SCALE">🚀 Pronta para Escalar</option>
                        <option value="FLAGGED">⚠️ Com Aviso (Flagged)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    ID da Conta Google Ads {form.platform === 'GOOGLE_ADS' ? <span className="text-red-500">*</span> : <span className="text-gray-400 font-normal">(opcional)</span>}
                  </label>
                  <input
                    type="text"
                    value={form.googleAdsCustomerId}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        googleAdsCustomerId: formatAccountId(e.target.value),
                      }))
                    }
                    onBlur={() =>
                      void validateFootprintRealtime({
                        googleAdsCustomerId: form.googleAdsCustomerId,
                        email: mode === 'manual' ? form.email : undefined,
                        cnpj: mode === 'manual' ? form.cnpj : undefined,
                        a2fCode: form.a2fCode,
                      })
                    }
                    className="input-field font-mono"
                    placeholder="000-000-0000"
                    maxLength={12}
                    inputMode="numeric"
                    autoComplete="off"
                  />
                  {form.platform === 'GOOGLE_ADS' && (
                    <p className="text-xs text-amber-700 dark:text-amber-300/90 mt-1">
                      Obrigatório para Google Ads (10 dígitos). Usado para evitar duplicidade entre o time.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Tipo de moeda (ISO 4217)</label>
                  <select
                    value={GLOBAL_CURRENCY_OPTIONS.some((o) => o.code === form.currency) ? form.currency : 'BRL'}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                    className="input-field"
                  >
                    {GLOBAL_CURRENCY_OPTIONS.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Código A2F (2FA)</label>
                  <input
                    type="text"
                    value={form.a2fCode}
                    onChange={(e) => setForm((f) => ({ ...f, a2fCode: e.target.value }))}
                    onBlur={() =>
                      void validateFootprintRealtime({
                        a2fCode: form.a2fCode,
                        googleAdsCustomerId: form.googleAdsCustomerId,
                      })
                    }
                    className="input-field font-mono"
                    placeholder="Chave secreta 2FA"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Código G2 Aprovada</label>
                  <input
                    type="text"
                    value={form.g2ApprovalCode}
                    onChange={(e) => setForm((f) => ({ ...f, g2ApprovalCode: e.target.value }))}
                    className="input-field"
                    placeholder="ID de aprovação G2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Site (URL da Landing)</label>
                  <input
                    type="url"
                    value={form.siteUrl}
                    onChange={(e) => setForm((f) => ({ ...f, siteUrl: e.target.value }))}
                    className="input-field"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Link CNPJ BIZ</label>
                  <input
                    type="url"
                    value={form.cnpjBizLink}
                    onChange={(e) => setForm((f) => ({ ...f, cnpjBizLink: e.target.value }))}
                    className="input-field"
                    placeholder="https://..."
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Cartão CNPJ (PDF)</label>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setCnpjPdfFile(e.target.files?.[0] || null)}
                    className="input-field file:mr-2 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary-500 file:text-white file:cursor-pointer"
                  />
                  {cnpjPdfFile && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      ✓ Será renomeado para cnpj_[ID].pdf
                    </p>
                  )}
                </div>

                {mode === 'manual' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">E-mail (opcional)</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        onBlur={() =>
                          void validateFootprintRealtime({
                            email: form.email,
                            cnpj: form.cnpj,
                            googleAdsCustomerId: form.googleAdsCustomerId,
                            a2fCode: form.a2fCode,
                          })
                        }
                        className="input-field"
                        placeholder="conta@email.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">CNPJ (opcional)</label>
                      <input
                        type="text"
                        value={form.cnpj}
                        onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))}
                        onBlur={() =>
                          void validateFootprintRealtime({
                            cnpj: form.cnpj,
                            email: form.email,
                            googleAdsCustomerId: form.googleAdsCustomerId,
                            a2fCode: form.a2fCode,
                          })
                        }
                        className="input-field"
                        placeholder="00.000.000/0001-00"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">E-mail (reservado)</label>
                      <select
                        value={form.emailId}
                        onChange={(e) => setForm((f) => ({ ...f, emailId: e.target.value }))}
                        className="input-field"
                      >
                        <option value="">— Nenhum —</option>
                        {emailsReservados.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.email}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">CNPJ (reservado)</label>
                      <select
                        value={form.cnpjId}
                        onChange={(e) => setForm((f) => ({ ...f, cnpjId: e.target.value }))}
                        className="input-field"
                      >
                        <option value="">— Nenhum —</option>
                        {cnpjsReservados.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.cnpj} — {c.razaoSocial || '—'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Perfil de pagamento (reservado)</label>
                      <select
                        value={form.paymentProfileId}
                        onChange={(e) => setForm((f) => ({ ...f, paymentProfileId: e.target.value }))}
                        className="input-field"
                      >
                        <option value="">— Nenhum —</option>
                        {perfisReservados.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.type} / {p.gateway}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
              )}
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? 'Salvando...' : 'Salvar'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                  Cancelar
                </button>
              </div>
            </form>
            <ProductionFeedback />
          </div>
        )}

        {accounts.some((a) => !a.accountCode) && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100 text-sm border border-amber-200/80 dark:border-amber-800/50">
            Existem registros sem identificador manual — use <strong>Editar</strong> para definir o código
            exibido na lista (substitui o ID interno do sistema).
          </div>
        )}

        <div className="overflow-x-auto">
          {loading ? (
            <SkeletonTable rows={6} />
          ) : accounts.length === 0 ? (
            <p className="text-gray-400 py-4">
              {searchQuery
                ? 'Nenhum resultado para esta busca. Tente outro termo ou limpe o campo de busca.'
                : 'Nenhum registro ainda.'}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  {canApprove && (
                    <th className="pb-2 pr-2 w-10">
                      <input
                        type="checkbox"
                        checked={allApprovableSelected}
                        onChange={toggleSelectAllApprovable}
                        aria-label="Selecionar todas as contas elegíveis para aprovação"
                      />
                    </th>
                  )}
                  <th className="pb-2 pr-4">Identificador</th>
                  <th className="pb-2 pr-4">Plataforma</th>
                  <th className="pb-2 pr-4">Tipo</th>
                  <th className="pb-2 pr-4">Nicho</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Produtor</th>
                  <th className="pb-2 pr-4">Checklist / credenciais</th>
                  <th
                    className="pb-2 pr-4"
                    title="Dias corridos desde o registro (fila ou aquecimento, conforme o status)"
                  >
                    Dias
                  </th>
                  <th className="pb-2 pr-4">Data</th>
                  <th className="pb-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <Fragment key={a.id}>
                  <tr
                    className="border-b border-gray-100 dark:border-white/5 last:border-0"
                    title={`Identificador: ${copyableAccountId(a)} · Ref. interna: ${a.id}`}
                  >
                    {canApprove && (
                      <td className="py-3 pr-2 align-middle">
                        {a.status === 'PENDING' || a.status === 'UNDER_REVIEW' ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(a.id)}
                            onChange={() => toggleRowSelected(a.id)}
                            aria-label={`Selecionar conta ${displayAccountId(a)}`}
                          />
                        ) : (
                          <span className="inline-block w-4" aria-hidden />
                        )}
                      </td>
                    )}
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {displayAccountId(a)}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyIdentifier(copyableAccountId(a), a.id)}
                          className="p-1 rounded text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-white/10"
                          title="Copiar identificador"
                          aria-label="Copiar identificador"
                        >
                          {copiedRowId === a.id ? (
                            <Check className="w-3.5 h-3.5 text-green-600" aria-hidden />
                          ) : (
                            <Copy className="w-3.5 h-3.5" aria-hidden />
                          )}
                        </button>
                      </div>
                      {accountIdSubtitle(a) && (
                        <span className="block text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 max-w-[14rem] leading-snug">
                          {accountIdSubtitle(a)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {PLATFORMS.find((p) => p.value === a.platform)?.label || a.platform}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{
                          backgroundColor: `${getTypeColor(a.type)}20`,
                          color: getTypeColor(a.type),
                        }}
                      >
                        {a.type}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-gray-600 dark:text-gray-400 text-xs">
                      {nicheLabel(a.productionNiche)}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={`px-2 py-0.5 rounded text-xs w-fit ${
                            a.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-800'
                              : a.status === 'UNDER_REVIEW'
                                ? 'bg-sky-100 text-sky-800'
                                : a.status === 'QUARANTINE'
                                  ? 'bg-purple-100 text-purple-800'
                                  : a.status === 'APPROVED'
                                    ? 'bg-green-100 text-green-800'
                                    : a.status === 'DEAD'
                                      ? 'bg-zinc-200 text-zinc-600 line-through'
                                      : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {statusLabel(a.status)}
                        </span>
                        {warmupBadge(a.warmupStatus)}
                        {quarantineBadge(a.quarantineUntil)}
                        {a.status === 'REJECTED' && a.rejectionReason && (
                          <span className="text-xs text-red-600 mt-1" title={a.rejectionReason}>
                            Motivo: {a.rejectionReason.slice(0, 40)}
                            {a.rejectionReason.length > 40 ? '...' : ''}
                          </span>
                        )}
                        {a.status === 'DEAD' && a.deadReason && (
                          <span className="text-xs text-zinc-500 mt-1" title={a.deadReason}>
                            💀 {a.deadReason.slice(0, 35)}
                            {a.deadReason.length > 35 ? '...' : ''}
                          </span>
                        )}
                        {a.productionCost && (
                          <span className="text-[10px] text-zinc-500">
                            Custo: R$ {Number(a.productionCost).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-4">{a.producer.name || '—'}</td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-col gap-1">
                        <ProductionChecklist
                          accountId={a.id}
                          isProducer={isProducer && a.producerId === session?.user?.id}
                          compact
                        />
                        <CredentialHints a={a} />
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-gray-500 tabular-nums">
                      {daysSinceRegistration(a.createdAt)}
                    </td>
                    <td className="py-3 pr-4 text-gray-500">
                      <div className="flex flex-col gap-1">
                        <span>{new Date(a.createdAt).toLocaleDateString('pt-BR')}</span>
                        {slaPendingBadge(a.createdAt, a.status)}
                      </div>
                    </td>
                    <td className="py-3">
                      {editingId !== a.id && (
                        <>
                          {(canManageView ||
                            (isProducer && a.producerId === session?.user?.id)) && (
                            <>
                              <button
                                type="button"
                                onClick={() => copyFooterText(a.id)}
                                className="inline-flex items-center gap-0.5 text-gray-600 hover:text-primary-600 text-xs mr-2"
                                title="Copiar texto de rodapé"
                              >
                                <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                <span>Rodapé</span>
                              </button>
                              {a.cnpjPdfUrl && (
                                <button
                                  type="button"
                                  onClick={() => setPdfPreviewId(a.id)}
                                  className="inline-flex items-center gap-0.5 text-gray-600 hover:text-primary-600 text-xs mr-2"
                                  title="Ver PDF do CNPJ"
                                >
                                  <span>PDF</span>
                                </button>
                              )}
                            </>
                          )}
                          {a.status === 'APPROVED' &&
                            (canManageView || (isProducer && a.producerId === session?.user?.id)) && (
                              <button
                                type="button"
                                onClick={() => openApprovedReview(a, 'dados')}
                                className="inline-flex items-center gap-0.5 text-primary-600 hover:underline text-xs mr-2"
                                title="Conferir dados, senha e URLs"
                              >
                                <Pencil className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                <span>Conferir / ajustar</span>
                              </button>
                            )}
                          {(a.status === 'PENDING' || a.status === 'UNDER_REVIEW') &&
                            (canApprove || (isProducer && a.producerId === session?.user?.id)) && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleEdit(a)}
                                className="inline-flex items-center gap-0.5 text-primary-600 hover:underline text-xs mr-2"
                                title="Editar"
                              >
                                <Pencil className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                <span>Editar</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(a.id)}
                                className="inline-flex items-center gap-0.5 text-red-600 hover:underline text-xs mr-2"
                                title="Excluir"
                              >
                                <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                <span>Excluir</span>
                              </button>
                            </>
                          )}
                          {isProducer &&
                            a.producerId === session?.user?.id &&
                            a.status === 'PENDING' && (
                              <button
                                type="button"
                                onClick={() => handleSendToReview(a.id)}
                                className="inline-flex items-center gap-0.5 text-sky-600 hover:underline text-xs mr-2"
                                title="Enviar para análise"
                              >
                                <Send className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                <span>Enviar p/ análise</span>
                              </button>
                            )}
                          {canApprove && (a.status === 'PENDING' || a.status === 'UNDER_REVIEW') && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApprove(a.id)}
                                className="text-green-600 hover:underline text-xs mr-2"
                              >
                                Aprovar
                              </button>
                              {rejectingId === a.id ? (
                              <div className="inline-block space-y-1">
                                <select
                                  value={rejectCode}
                                  onChange={(e) => setRejectCode(e.target.value)}
                                  className="input-field py-1 px-2 text-xs w-40 block"
                                >
                                  <option value="">Código (opcional)</option>
                                  {REJECTION_CODES.map((c) => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  value={rejectReason}
                                  onChange={(e) => setRejectReason(e.target.value)}
                                  placeholder="Motivo (obrigatório)"
                                  className="input-field py-1 px-2 text-xs w-40"
                                />
                                <div>
                                  <button type="button" onClick={() => handleReject(a.id)} className="text-red-600 text-xs mr-2">
                                    Ok
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRejectingId(null)
                                      setRejectReason('')
                                      setRejectCode('')
                                    }}
                                    className="text-gray-500 text-xs"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setRejectingId(a.id)}
                                className="text-red-600 hover:underline text-xs"
                              >
                                Rejeitar
                              </button>
                            )}
                            {/* Quarentena */}
                            {quarantineId === a.id ? (
                              <div className="flex items-center gap-1 mt-1">
                                <select
                                  value={quarantineHours}
                                  onChange={(e) => setQuarantineHours(Number(e.target.value))}
                                  className="input-field py-1 px-2 text-xs w-28"
                                >
                                  <option value={24}>24h</option>
                                  <option value={48}>48h</option>
                                  <option value={72}>72h</option>
                                  <option value={120}>5 dias</option>
                                  <option value={168}>7 dias</option>
                                </select>
                                <button type="button" onClick={() => handleQuarantine(a.id, quarantineHours)} className="text-purple-600 text-xs">Ok</button>
                                <button type="button" onClick={() => setQuarantineId(null)} className="text-gray-500 text-xs">✕</button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setQuarantineId(a.id)}
                                className="text-purple-600 hover:underline text-xs"
                              >
                                🔒 Quarentena
                              </button>
                            )}
                            </>
                          )}
                        </>
                      )}
                      {/* Dead Switch — disponível para qualquer status não entregue/morto */}
                      {canApprove && !['DELIVERED', 'DEAD'].includes(a.status) && (
                        <>
                          {deadSwitchId === a.id ? (
                            <div className="flex items-center gap-1 mt-1">
                              <input
                                type="text"
                                value={deadReason}
                                onChange={(e) => setDeadReason(e.target.value)}
                                placeholder="Motivo (ex: Ban pré-estoque)"
                                className="input-field py-1 px-2 text-xs w-44"
                              />
                              <button
                                type="button"
                                onClick={() => handleDeadSwitch(a.id, deadReason)}
                                disabled={deadSwitching}
                                className="text-red-700 font-semibold text-xs"
                              >
                                {deadSwitching ? '…' : 'Baixar'}
                              </button>
                              <button type="button" onClick={() => { setDeadSwitchId(null); setDeadReason('') }} className="text-gray-500 text-xs">✕</button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeadSwitchId(a.id)}
                              className="text-red-800 dark:text-red-400 hover:underline text-xs font-semibold mt-0.5"
                              title="Baixar conta morta do inventário"
                            >
                              💀 Dead Switch
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                  {editingId === a.id && (
                    <tr className="bg-gray-50 dark:bg-ads-dark-card/50 border-b border-gray-200 dark:border-white/10 ring-2 ring-inset ring-primary-500/20">
                      <td colSpan={canApprove ? 11 : 10} className="py-4 px-2">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                          {editKind === 'approved-review'
                            ? 'Conta aprovada — conferir dados, senha e URLs'
                            : 'Editar conta'}{' '}
                          <span className="font-mono">{displayAccountId(a)}</span>
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3 font-mono break-all">
                          Referência interna (suporte): {a.id}
                        </p>

                        {editKind === 'approved-review' && (
                          <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-white/10 pb-2 mb-3">
                            <button
                              type="button"
                              onClick={() => setEditTab('dados')}
                              className={`px-3 py-1.5 rounded text-xs font-medium ${
                                editTab === 'dados'
                                  ? 'bg-primary-500 text-white'
                                  : 'bg-gray-200 dark:bg-white/10'
                              }`}
                            >
                              Conferir dados
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditTab('senha')}
                              className={`px-3 py-1.5 rounded text-xs font-medium ${
                                editTab === 'senha'
                                  ? 'bg-primary-500 text-white'
                                  : 'bg-gray-200 dark:bg-white/10'
                              }`}
                            >
                              Senha
                              {a.hasPassword && (
                                <span className="ml-1 text-[10px] opacity-80">(definida)</span>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditTab('urls')}
                              className={`px-3 py-1.5 rounded text-xs font-medium ${
                                editTab === 'urls'
                                  ? 'bg-primary-500 text-white'
                                  : 'bg-gray-200 dark:bg-white/10'
                              }`}
                            >
                              URLs / domínio
                            </button>
                          </div>
                        )}

                        {editKind === 'approved-review' && editTab === 'dados' && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm max-w-3xl rounded-lg border border-gray-200 dark:border-white/10 p-3 bg-white/50 dark:bg-black/20">
                            <p className="sm:col-span-2 text-xs text-gray-500 mb-1">
                              Leitura apenas — os dados registados na produção permanecem visíveis após aprovação.
                            </p>
                            <div>
                              <span className="text-xs text-gray-500">Identificador manual</span>
                              <p className="font-mono font-medium">{a.accountCode?.trim() || '—'}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500">ID Google Ads</span>
                              <p className="font-mono">{a.googleAdsCustomerId?.trim() || '—'}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500">Plataforma</span>
                              <p>{PLATFORMS.find((p) => p.value === a.platform)?.label || a.platform}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500">Tipo</span>
                              <p>{a.type}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500">E-mail</span>
                              <p className="break-all">{a.email || '—'}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500">CNPJ</span>
                              <p className="font-mono">{a.cnpj || '—'}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500">Moeda</span>
                              <p>{a.currency || '—'}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500">Nicho / meta</span>
                              <p>
                                {nicheLabel(a.productionNiche)} ·{' '}
                                {VERIFICATION_GOALS.find((g) => g.value === a.verificationGoal)?.label ||
                                  a.verificationGoal ||
                                  '—'}
                              </p>
                            </div>
                            <div className="sm:col-span-2">
                              <span className="text-xs text-gray-500">2FA (A2F)</span>
                              <p className="font-mono text-xs break-all whitespace-pre-wrap">
                                {a.a2fCode?.trim() || '—'}
                              </p>
                            </div>
                            <div className="sm:col-span-2">
                              <span className="text-xs text-gray-500">Código G2</span>
                              <p className="font-mono">{a.g2ApprovalCode || '—'}</p>
                            </div>
                            <div className="sm:col-span-2">
                              <span className="text-xs text-gray-500">Site</span>
                              <p className="break-all">{a.siteUrl || '—'}</p>
                            </div>
                            <div className="sm:col-span-2">
                              <span className="text-xs text-gray-500">Domínio principal</span>
                              <p>{a.primaryDomain || '—'}</p>
                            </div>
                            <div className="sm:col-span-2">
                              <span className="text-xs text-gray-500">Senha atual</span>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-mono break-all">
                                  {a.passwordPlain?.trim() ? a.passwordPlain : '—'}
                                </p>
                                {a.passwordPlain?.trim() && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      copyQuickValue(
                                        a.passwordPlain || '',
                                        'Senha copiada para a área de transferência.',
                                        `dados-senha-${a.id}`
                                      )
                                    }
                                    className="btn-secondary text-xs"
                                  >
                                    <Copy className="w-3 h-3 inline mr-1" />
                                    {copiedQuickAction === `dados-senha-${a.id}` ? 'Copiado!' : 'Copiar senha'}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="sm:col-span-2">
                              <span className="text-xs text-gray-500">Cartão CNPJ</span>
                              {a.cnpjPdfUrl ? (
                                <div className="flex flex-wrap gap-2 mt-1">
                                  <button
                                    type="button"
                                    onClick={() => setPdfPreviewId(a.id)}
                                    className="btn-secondary text-xs"
                                  >
                                    Visualizar PDF
                                  </button>
                                  <a
                                    href={`/api/producao/${a.id}/arquivo/cnpj-pdf?download=1`}
                                    className="btn-secondary text-xs"
                                  >
                                    Baixar cartão CNPJ
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      copyQuickValue(
                                        cnpjPdfDownloadUrl(a.id),
                                        'Link do cartão CNPJ copiado para a área de transferência.',
                                        `dados-link-${a.id}`
                                      )
                                    }
                                    className="btn-secondary text-xs"
                                  >
                                    <Copy className="w-3 h-3 inline mr-1" />
                                    {copiedQuickAction === `dados-link-${a.id}` ? 'Copiado!' : 'Copiar link'}
                                  </button>
                                </div>
                              ) : (
                                <p>—</p>
                              )}
                            </div>
                            <div className="sm:col-span-2 flex gap-2 pt-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(null)
                                  setEditKind('full')
                                  setEditTab('dados')
                                }}
                                className="btn-secondary text-sm"
                              >
                                Fechar painel
                              </button>
                            </div>
                          </div>
                        )}

                        {editKind === 'approved-review' && editTab === 'urls' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm max-w-2xl">
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium mb-1">Site (URL)</label>
                              <input
                                value={editForm.siteUrl}
                                onChange={(e) => setEditForm((f) => ({ ...f, siteUrl: e.target.value }))}
                                className="input-field"
                                placeholder="https://..."
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium mb-1">Link CNPJ BIZ</label>
                              <input
                                value={editForm.cnpjBizLink}
                                onChange={(e) => setEditForm((f) => ({ ...f, cnpjBizLink: e.target.value }))}
                                className="input-field"
                                placeholder="https://..."
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium mb-1">Domínio principal</label>
                              <input
                                value={editForm.primaryDomain}
                                onChange={(e) => setEditForm((f) => ({ ...f, primaryDomain: e.target.value }))}
                                className="input-field"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium mb-1">Nota de proxy</label>
                              <input
                                value={editForm.proxyNote}
                                onChange={(e) => setEditForm((f) => ({ ...f, proxyNote: e.target.value }))}
                                className="input-field"
                              />
                              <label className="inline-flex items-center gap-2 mt-2 text-xs cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editForm.proxyConfigured}
                                  onChange={(e) =>
                                    setEditForm((f) => ({ ...f, proxyConfigured: e.target.checked }))
                                  }
                                />
                                Proxy configurado
                              </label>
                            </div>
                            <div className="md:col-span-2 flex gap-2 pt-2">
                              <button type="button" onClick={handleSaveEdit} className="btn-primary text-sm">
                                Salvar URLs / domínio
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(null)
                                  setEditKind('full')
                                  setEditTab('dados')
                                }}
                                className="btn-secondary text-sm"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}

                        {editKind === 'approved-review' && editTab === 'senha' && (
                          <div className="max-w-md space-y-3">
                            <div className="rounded border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-black/20 p-2">
                              <p className="text-[11px] text-gray-500">Senha atual</p>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-mono text-sm break-all">
                                  {editForm.currentPassword?.trim() ? editForm.currentPassword : '—'}
                                </p>
                                {editForm.currentPassword?.trim() && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      copyQuickValue(
                                        editForm.currentPassword,
                                        'Senha copiada para a área de transferência.',
                                        `approved-senha-${a.id}`
                                      )
                                    }
                                    className="btn-secondary text-xs"
                                  >
                                    <Copy className="w-3 h-3 inline mr-1" />
                                    {copiedQuickAction === `approved-senha-${a.id}` ? 'Copiado!' : 'Copiar senha'}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <input
                                type={editPasswordVisible ? 'text' : 'password'}
                                value={editForm.password}
                                onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                                className="input-field flex-1"
                                placeholder="Nova senha (mín. 4 caracteres)"
                                autoComplete="new-password"
                              />
                              <button
                                type="button"
                                onClick={() => setEditPasswordVisible((v) => !v)}
                                className="btn-secondary px-3"
                                aria-label={editPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'}
                              >
                                {editPasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                            {a.cnpjPdfUrl ? (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => setPdfPreviewId(a.id)}
                                  className="btn-secondary text-xs"
                                >
                                  Ver cartão CNPJ
                                </button>
                                <a
                                  href={`/api/producao/${a.id}/arquivo/cnpj-pdf?download=1`}
                                  className="btn-secondary text-xs"
                                >
                                  Baixar cartão CNPJ
                                </a>
                                <button
                                  type="button"
                                  onClick={() =>
                                    copyQuickValue(
                                      cnpjPdfDownloadUrl(a.id),
                                      'Link do cartão CNPJ copiado para a área de transferência.',
                                      `approved-link-${a.id}`
                                    )
                                  }
                                  className="btn-secondary text-xs"
                                >
                                  <Copy className="w-3 h-3 inline mr-1" />
                                  {copiedQuickAction === `approved-link-${a.id}` ? 'Copiado!' : 'Copiar link'}
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <p className="text-xs text-amber-600 font-medium">Cartão CNPJ não enviado.</p>
                                <div className="flex flex-wrap items-center gap-2">
                                  <label className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-dashed border-primary-400 text-xs text-primary-600 cursor-pointer hover:bg-primary-50 dark:hover:bg-primary-950/20 transition-colors">
                                    <FileText className="w-3.5 h-3.5" />
                                    {editCnpjPdfFile ? editCnpjPdfFile.name : 'Selecionar PDF'}
                                    <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setEditCnpjPdfFile(e.target.files?.[0] || null)} />
                                  </label>
                                  {editCnpjPdfFile && (
                                    <button type="button" onClick={() => handleEditCnpjUpload(a.id)} disabled={uploadingCnpj}
                                      className="btn-primary text-xs flex items-center gap-1">
                                      {uploadingCnpj ? <><Loader2 className="w-3 h-3 animate-spin" />Enviando...</> : 'Enviar cartão CNPJ'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                            {a.cnpjPdfUrl && (
                              <div className="space-y-1">
                                <p className="text-xs text-gray-500">Substituir cartão CNPJ:</p>
                                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-dashed border-gray-300 text-xs text-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                  <FileText className="w-3.5 h-3.5" />
                                  {editCnpjPdfFile ? editCnpjPdfFile.name : 'Selecionar novo PDF'}
                                  <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setEditCnpjPdfFile(e.target.files?.[0] || null)} />
                                </label>
                                {editCnpjPdfFile && (
                                  <button type="button" onClick={() => handleEditCnpjUpload(a.id)} disabled={uploadingCnpj}
                                    className="btn-primary text-xs flex items-center gap-1">
                                    {uploadingCnpj ? <><Loader2 className="w-3 h-3 animate-spin" />Enviando...</> : 'Substituir PDF'}
                                  </button>
                                )}
                              </div>
                            )}
                            <div className="flex gap-2 pt-1">
                              <button type="button" onClick={handleSaveEdit} className="btn-primary text-sm">
                                Atualizar senha
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(null)
                                  setEditKind('full')
                                  setEditTab('dados')
                                }}
                                className="btn-secondary text-sm"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}

                        {editKind === 'full' && (
                        <>
                        <div className="flex gap-2 border-b border-gray-200 dark:border-white/10 pb-2 mb-3">
                          <button
                            type="button"
                            onClick={() => setEditTab('dados')}
                            className={`px-3 py-1.5 rounded text-xs font-medium ${
                              editTab === 'dados'
                                ? 'bg-primary-500 text-white'
                                : 'bg-gray-200 dark:bg-white/10'
                            }`}
                          >
                            Dados da conta
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditTab('senha')}
                            className={`px-3 py-1.5 rounded text-xs font-medium ${
                              editTab === 'senha'
                                ? 'bg-primary-500 text-white'
                                : 'bg-gray-200 dark:bg-white/10'
                            }`}
                          >
                            Senha
                            {a.hasPassword && (
                              <span className="ml-1 text-[10px] opacity-80">(definida)</span>
                            )}
                          </button>
                        </div>
                        {editTab === 'senha' ? (
                          <div className="max-w-md space-y-2">
                            <div className="rounded border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-black/20 p-2">
                              <p className="text-[11px] text-gray-500">Senha atual</p>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-mono text-sm break-all">
                                  {editForm.currentPassword?.trim() ? editForm.currentPassword : '—'}
                                </p>
                                {editForm.currentPassword?.trim() && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      copyQuickValue(
                                        editForm.currentPassword,
                                        'Senha copiada para a área de transferência.',
                                        `full-senha-${a.id}`
                                      )
                                    }
                                    className="btn-secondary text-xs"
                                  >
                                    <Copy className="w-3 h-3 inline mr-1" />
                                    {copiedQuickAction === `full-senha-${a.id}` ? 'Copiado!' : 'Copiar senha'}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <input
                                type={editPasswordVisible ? 'text' : 'password'}
                                value={editForm.password}
                                onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                                className="input-field flex-1"
                                placeholder={a.hasPassword ? 'Nova senha (opcional)' : 'Senha da conta'}
                                autoComplete="new-password"
                              />
                              <button
                                type="button"
                                onClick={() => setEditPasswordVisible((v) => !v)}
                                className="btn-secondary px-3"
                                aria-label={editPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'}
                              >
                                {editPasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                            {a.cnpjPdfUrl ? (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => setPdfPreviewId(a.id)}
                                  className="btn-secondary text-xs"
                                >
                                  Ver cartão CNPJ
                                </button>
                                <a
                                  href={`/api/producao/${a.id}/arquivo/cnpj-pdf?download=1`}
                                  className="btn-secondary text-xs"
                                >
                                  Baixar cartão CNPJ
                                </a>
                                <button
                                  type="button"
                                  onClick={() =>
                                    copyQuickValue(
                                      cnpjPdfDownloadUrl(a.id),
                                      'Link do cartão CNPJ copiado para a área de transferência.',
                                      `full-link-${a.id}`
                                    )
                                  }
                                  className="btn-secondary text-xs"
                                >
                                  <Copy className="w-3 h-3 inline mr-1" />
                                  {copiedQuickAction === `full-link-${a.id}` ? 'Copiado!' : 'Copiar link'}
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <p className="text-xs text-amber-600 font-medium">Cartão CNPJ não enviado.</p>
                                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-dashed border-primary-400 text-xs text-primary-600 cursor-pointer hover:bg-primary-50 dark:hover:bg-primary-950/20 transition-colors w-fit">
                                  <FileText className="w-3.5 h-3.5" />
                                  {editCnpjPdfFile ? editCnpjPdfFile.name : 'Selecionar PDF'}
                                  <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setEditCnpjPdfFile(e.target.files?.[0] || null)} />
                                </label>
                                {editCnpjPdfFile && (
                                  <button type="button" onClick={() => handleEditCnpjUpload(a.id)} disabled={uploadingCnpj}
                                    className="btn-primary text-xs flex items-center gap-1">
                                    {uploadingCnpj ? <><Loader2 className="w-3 h-3 animate-spin" />Enviando...</> : 'Enviar cartão CNPJ'}
                                  </button>
                                )}
                              </div>
                            )}
                            {a.cnpjPdfUrl && (
                              <div className="space-y-1 mt-1">
                                <p className="text-xs text-gray-500">Substituir PDF:</p>
                                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-dashed border-gray-300 text-xs text-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors w-fit">
                                  <FileText className="w-3.5 h-3.5" />
                                  {editCnpjPdfFile ? editCnpjPdfFile.name : 'Novo PDF'}
                                  <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setEditCnpjPdfFile(e.target.files?.[0] || null)} />
                                </label>
                                {editCnpjPdfFile && (
                                  <button type="button" onClick={() => handleEditCnpjUpload(a.id)} disabled={uploadingCnpj}
                                    className="btn-primary text-xs flex items-center gap-1">
                                    {uploadingCnpj ? <><Loader2 className="w-3 h-3 animate-spin" />Enviando...</> : 'Substituir'}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium mb-1">Identificador *</label>
                              <input
                                value={editForm.accountCode}
                                onChange={(e) => setEditForm((f) => ({ ...f, accountCode: e.target.value }))}
                                className="input-field font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">Plataforma</label>
                              <select
                                value={editForm.platform}
                                onChange={(e) => setEditForm((f) => ({ ...f, platform: e.target.value }))}
                                className="input-field"
                              >
                                {PLATFORMS.map((p) => (
                                  <option key={p.value} value={p.value}>{p.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">Tipo</label>
                              <select
                                value={editForm.type}
                                onChange={(e) =>
                                  setEditForm((f) => ({
                                    ...f,
                                    type: e.target.value,
                                    typeCustom: e.target.value === '__OUTRO__' ? f.typeCustom : '',
                                  }))
                                }
                                className="input-field"
                              >
                                {ACCOUNT_TYPES.map((t) => (
                                  <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                              </select>
                              {editForm.type === '__OUTRO__' && (
                                <input
                                  type="text"
                                  value={editForm.typeCustom}
                                  onChange={(e) => setEditForm((f) => ({ ...f, typeCustom: e.target.value }))}
                                  className="input-field mt-2"
                                  placeholder="Tipo customizado"
                                />
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">ID Google Ads (opcional)</label>
                              <input
                                value={editForm.googleAdsCustomerId}
                                onChange={(e) =>
                                  setEditForm((f) => ({
                                    ...f,
                                    googleAdsCustomerId: formatAccountId(e.target.value),
                                  }))
                                }
                                className="input-field font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">Tipo de moeda (ISO)</label>
                              <select
                                value={
                                  GLOBAL_CURRENCY_OPTIONS.some((o) => o.code === editForm.currency)
                                    ? editForm.currency
                                    : 'BRL'
                                }
                                onChange={(e) => setEditForm((f) => ({ ...f, currency: e.target.value }))}
                                className="input-field"
                              >
                                {GLOBAL_CURRENCY_OPTIONS.map((o) => (
                                  <option key={o.code} value={o.code}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">Código A2F</label>
                              <input
                                value={editForm.a2fCode}
                                onChange={(e) => setEditForm((f) => ({ ...f, a2fCode: e.target.value }))}
                                className="input-field font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">Código G2</label>
                              <input
                                value={editForm.g2ApprovalCode}
                                onChange={(e) => setEditForm((f) => ({ ...f, g2ApprovalCode: e.target.value }))}
                                className="input-field"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium mb-1">Site (URL)</label>
                              <input
                                value={editForm.siteUrl}
                                onChange={(e) => setEditForm((f) => ({ ...f, siteUrl: e.target.value }))}
                                className="input-field"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium mb-1">Link CNPJ BIZ</label>
                              <input
                                value={editForm.cnpjBizLink}
                                onChange={(e) => setEditForm((f) => ({ ...f, cnpjBizLink: e.target.value }))}
                                className="input-field"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">E-mail</label>
                              <input
                                type="email"
                                value={editForm.email}
                                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                                className="input-field"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">CNPJ</label>
                              <input
                                value={editForm.cnpj}
                                onChange={(e) => setEditForm((f) => ({ ...f, cnpj: e.target.value }))}
                                className="input-field"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">Nicho</label>
                              <select
                                value={editForm.productionNiche}
                                onChange={(e) => setEditForm((f) => ({ ...f, productionNiche: e.target.value }))}
                                className="input-field"
                              >
                                {PRODUCTION_NICHES.map((n) => (
                                  <option key={n.value} value={n.value}>{n.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">Meta de verificação</label>
                              <select
                                value={editForm.verificationGoal}
                                onChange={(e) => setEditForm((f) => ({ ...f, verificationGoal: e.target.value }))}
                                className="input-field"
                              >
                                {VERIFICATION_GOALS.map((g) => (
                                  <option key={g.value} value={g.value}>{g.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium mb-1">Domínio principal</label>
                              <input
                                value={editForm.primaryDomain}
                                onChange={(e) => setEditForm((f) => ({ ...f, primaryDomain: e.target.value }))}
                                className="input-field"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium mb-1">Nota de proxy</label>
                              <input
                                value={editForm.proxyNote}
                                onChange={(e) => setEditForm((f) => ({ ...f, proxyNote: e.target.value }))}
                                className="input-field"
                              />
                              <label className="inline-flex items-center gap-2 mt-2 text-xs cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editForm.proxyConfigured}
                                  onChange={(e) =>
                                    setEditForm((f) => ({ ...f, proxyConfigured: e.target.checked }))
                                  }
                                />
                                Proxy configurado
                              </label>
                            </div>
                            {/* Cartão CNPJ inline na aba Dados */}
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium mb-1">Cartão CNPJ (PDF)</label>
                              {a.cnpjPdfUrl ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                                    <FileText className="w-3.5 h-3.5" /> PDF enviado
                                  </span>
                                  <button type="button" onClick={() => setPdfPreviewId(a.id)} className="btn-secondary text-xs">
                                    Visualizar
                                  </button>
                                  <a href={`/api/producao/${a.id}/arquivo/cnpj-pdf?download=1`} className="btn-secondary text-xs">
                                    Baixar
                                  </a>
                                  <label className="flex items-center gap-1 px-2.5 py-1 rounded border border-dashed border-gray-300 text-xs text-gray-500 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                    <FileText className="w-3 h-3" />
                                    {editCnpjPdfFile ? editCnpjPdfFile.name : 'Substituir PDF'}
                                    <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setEditCnpjPdfFile(e.target.files?.[0] || null)} />
                                  </label>
                                  {editCnpjPdfFile && (
                                    <button type="button" onClick={() => handleEditCnpjUpload(a.id)} disabled={uploadingCnpj}
                                      className="btn-primary text-xs flex items-center gap-1">
                                      {uploadingCnpj ? <><Loader2 className="w-3 h-3 animate-spin" />Enviando...</> : 'Substituir'}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs text-amber-600 font-medium">Não enviado</span>
                                  <label className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-dashed border-primary-400 text-xs text-primary-600 cursor-pointer hover:bg-primary-50 dark:hover:bg-primary-950/20 transition-colors">
                                    <FileText className="w-3.5 h-3.5" />
                                    {editCnpjPdfFile ? editCnpjPdfFile.name : 'Selecionar PDF'}
                                    <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setEditCnpjPdfFile(e.target.files?.[0] || null)} />
                                  </label>
                                  {editCnpjPdfFile && (
                                    <button type="button" onClick={() => handleEditCnpjUpload(a.id)} disabled={uploadingCnpj}
                                      className="btn-primary text-xs flex items-center gap-1">
                                      {uploadingCnpj ? <><Loader2 className="w-3 h-3 animate-spin" />Enviando...</> : 'Enviar cartão CNPJ'}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2 mt-4">
                          <button type="button" onClick={handleSaveEdit} className="btn-primary text-sm py-1.5">
                            Salvar alterações
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null)
                              setEditKind('full')
                            }}
                            className="btn-secondary text-sm py-1.5"
                          >
                            Cancelar
                          </button>
                        </div>
                        </>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {pdfPreviewId && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setPdfPreviewId(null)}
          role="presentation"
        >
          <div
            className="bg-white dark:bg-ads-dark-card rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Visualização do PDF do CNPJ"
          >
            <div className="flex justify-between items-center p-3 border-b border-gray-200 dark:border-white/10">
              <span className="text-sm font-medium">Cartão CNPJ (preview)</span>
              <button type="button" onClick={() => setPdfPreviewId(null)} className="btn-secondary text-xs">
                Fechar
              </button>
            </div>
            <iframe
              title="Cartão CNPJ"
              src={`/api/producao/${pdfPreviewId}/arquivo/cnpj-pdf`}
              className="w-full min-h-[70vh] rounded-b-lg border-0 bg-gray-100 dark:bg-gray-900"
            />
          </div>
        </div>
      )}
      </div> {/* fim wrapper producao */}
    </div>
  )
}
