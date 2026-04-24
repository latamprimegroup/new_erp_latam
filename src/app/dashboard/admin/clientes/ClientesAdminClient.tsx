'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, Building2, MapPin, Phone,
  TrendingUp, ShoppingCart, AlertTriangle,
  ChevronLeft, ChevronRight, Edit3, X, Save, Loader2,
  Instagram, Linkedin, ExternalLink, Star, Shield,
  Clock, DollarSign, Calendar, Globe, Hash, FileSearch,
  UserPlus, CheckCircle2, Pencil, Check
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ClientMetrics = {
  ltvReal?: number | null
  ltvProjetado12m?: number | null
  revenueTotal?: number | null
  churnRisk?: string | null
  ticketMedio?: number | null
  diasSemCompra?: number | null
}

type Client = {
  id: string
  clientCode?: string | null
  clientStatus: string
  whatsapp?: string | null
  taxId?: string | null
  companyName?: string | null
  jobTitle?: string | null
  country?: string | null
  preferredCurrency: string
  operationNiche?: string | null
  trustLevelStars?: number | null
  trustScore?: number | null
  leadAcquisitionSource?: string | null
  lastPurchaseAt?: string | null
  totalSpent?: number | null
  totalAccountsBought: number
  refundCount: number
  averageTicketBrl?: number | null
  segmentationTags: string[] | unknown
  roiCrmStatus: string
  commercialNotes?: string | null
  riskBlockCheckout: boolean
  // Endereço
  addressZip?: string | null
  addressStreet?: string | null
  addressNumber?: string | null
  addressComplement?: string | null
  addressNeighborhood?: string | null
  addressCity?: string | null
  addressState?: string | null
  // Redes sociais
  instagramHandle?: string | null
  facebookUrl?: string | null
  linkedinUrl?: string | null
  whatsappGroupLink?: string | null
  telegramUsername?: string | null
  // Financeiro
  creditLimit?: number | null
  preferredDueDay?: number | null
  // Relações
  user: { id: string; name: string | null; email: string; phone?: string | null; createdAt: string }
  metrics?: ClientMetrics | null
  accountManager?: { id: string; name: string | null } | null
}

type Order = {
  id: string
  product?: string | null
  value?: number | null
  currency?: string | null
  status?: string | null
  paidAt?: string | null
  paymentMethod?: string | null
  orderSource?: string | null
}

const TAG_OPTIONS = [
  { value: 'VIP', label: '⭐ VIP', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'HIGH_TICKET', label: '💎 High Ticket', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { value: 'CHURN_RISK', label: '⚠️ Risco Churn', color: 'bg-red-100 text-red-800 border-red-300' },
  { value: 'UPSELL_CANDIDATE', label: '🚀 Upsell', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'INADIMPLENTE', label: '🚫 Inadimplente', color: 'bg-rose-100 text-rose-800 border-rose-300' },
  { value: 'BLACK_FRIDAY', label: '🖤 Black Friday', color: 'bg-zinc-800 text-zinc-100 border-zinc-600' },
  { value: 'NOVO', label: '🌱 Novo', color: 'bg-green-100 text-green-800 border-green-300' },
]

function parseTags(raw: string[] | unknown): string[] {
  if (Array.isArray(raw)) return raw as string[]
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : [] } catch { return [] }
  }
  return []
}

function tagConfig(tag: string) {
  return TAG_OPTIONS.find((t) => t.value === tag) ?? {
    value: tag, label: tag, color: 'bg-zinc-100 text-zinc-700 border-zinc-300',
  }
}

function brl(v?: number | null) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function churnBadge(risk?: string | null) {
  if (!risk) return null
  const map: Record<string, string> = {
    HIGH: 'bg-red-100 text-red-800',
    MEDIUM: 'bg-amber-100 text-amber-800',
    LOW: 'bg-green-100 text-green-800',
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${map[risk] ?? 'bg-zinc-100 text-zinc-600'}`}>
      Churn {risk}
    </span>
  )
}

// ─── Países com ISO, DDI e label do Tax ID ────────────────────────────────────

const COUNTRIES = [
  { code: 'BR', name: 'Brasil 🇧🇷',          ddi: '+55', taxLabel: 'CPF / CNPJ',           taxPlaceholder: '000.000.000-00 ou CNPJ' },
  { code: 'US', name: 'Estados Unidos 🇺🇸',   ddi: '+1',  taxLabel: 'EIN / SSN / Tax ID',   taxPlaceholder: 'XX-XXXXXXX' },
  { code: 'PT', name: 'Portugal 🇵🇹',          ddi: '+351', taxLabel: 'NIF',                 taxPlaceholder: '123456789' },
  { code: 'ES', name: 'Espanha 🇪🇸',           ddi: '+34', taxLabel: 'NIF / VAT',            taxPlaceholder: 'ESX1234567X' },
  { code: 'GB', name: 'Reino Unido 🇬🇧',       ddi: '+44', taxLabel: 'UTR / VAT Number',     taxPlaceholder: 'GB123456789' },
  { code: 'DE', name: 'Alemanha 🇩🇪',          ddi: '+49', taxLabel: 'Steuernummer / VAT',   taxPlaceholder: 'DE123456789' },
  { code: 'FR', name: 'França 🇫🇷',            ddi: '+33', taxLabel: 'SIRET / TVA',          taxPlaceholder: 'FR12345678901' },
  { code: 'IT', name: 'Itália 🇮🇹',            ddi: '+39', taxLabel: 'P.IVA / CF',           taxPlaceholder: 'IT12345678901' },
  { code: 'MX', name: 'México 🇲🇽',            ddi: '+52', taxLabel: 'RFC',                  taxPlaceholder: 'XAXX010101000' },
  { code: 'AR', name: 'Argentina 🇦🇷',         ddi: '+54', taxLabel: 'CUIT / CUIL',          taxPlaceholder: '20-12345678-9' },
  { code: 'CO', name: 'Colômbia 🇨🇴',          ddi: '+57', taxLabel: 'NIT',                  taxPlaceholder: '123456789-0' },
  { code: 'CL', name: 'Chile 🇨🇱',             ddi: '+56', taxLabel: 'RUT',                  taxPlaceholder: '12.345.678-9' },
  { code: 'AE', name: 'Emirados Árabes 🇦🇪',   ddi: '+971', taxLabel: 'TRN',                 taxPlaceholder: '100123456700003' },
  { code: 'CA', name: 'Canadá 🇨🇦',            ddi: '+1',  taxLabel: 'BN / SIN',            taxPlaceholder: '123456789' },
  { code: 'AU', name: 'Austrália 🇦🇺',         ddi: '+61', taxLabel: 'ABN / TFN',            taxPlaceholder: '51 824 753 556' },
  { code: 'OTHER', name: 'Outro país 🌍',      ddi: '+',   taxLabel: 'Tax ID / VAT / Doc',   taxPlaceholder: 'Número de identificação' },
] as const

type CountryCode = typeof COUNTRIES[number]['code']

function getCountry(code: string) {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[COUNTRIES.length - 1]
}

// ─── Tipos do formulário de cadastro ─────────────────────────────────────────

type CreateForm = {
  name: string
  email: string
  phone: string
  ddi: string
  whatsapp: string
  taxId: string
  country: string
  companyName: string
  jobTitle: string
  instagramHandle: string
  whatsappGroupLink: string
  operationNiche: string
  leadAcquisitionSource: string
  clientStatus: 'ATIVO' | 'INATIVO' | 'BLOQUEADO'
  preferredCurrency: 'BRL' | 'USD'
  commercialNotes: string
  segmentationTags: string[]
}

const EMPTY_CREATE: CreateForm = {
  name: '', email: '', phone: '', ddi: '+55', whatsapp: '', taxId: '', country: 'BR',
  companyName: '', jobTitle: '', instagramHandle: '', whatsappGroupLink: '',
  operationNiche: '', leadAcquisitionSource: '',
  clientStatus: 'ATIVO', preferredCurrency: 'BRL', commercialNotes: '', segmentationTags: [],
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ClientesAdminClient() {
  const [clients, setClients] = useState<Client[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [detailTab, setDetailTab] = useState<'dados' | 'endereco' | 'historico' | 'financeiro'>('dados')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Client & { name: string; phone: string; email: string }>>({})
  const [cepLoading, setCepLoading] = useState(false)
  const [cnpjLoading, setCnpjLoading] = useState(false)
  const [nextClientCode, setNextClientCode] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  // ── Estado do modal de cadastro ──
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE)
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({})
  const [creating, setCreating] = useState(false)
  const [createStep, setCreateStep] = useState<'form' | 'success'>('form')

  // ── Estado do ajuste de sequência (próximo código global) ──
  const [editingCode, setEditingCode] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [savingCode, setSavingCode] = useState(false)

  // ── Estado do ajuste de código do cliente selecionado ──
  const [editingClientCode, setEditingClientCode] = useState(false)
  const [clientCodeInput, setClientCodeInput] = useState('')
  const [savingClientCode, setSavingClientCode] = useState(false)

  // Debounce de busca
  useEffect(() => {
    const t = setTimeout(() => { setSearchQuery(searchInput); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [searchInput])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (searchQuery) params.set('q', searchQuery)
      if (statusFilter) params.set('status', statusFilter)
      if (tagFilter) params.set('tag', tagFilter)
      const res = await fetch(`/api/clientes?${params}`)
      if (!res.ok) throw new Error('Erro ao carregar')
      const data = await res.json()
      setClients(data.clients ?? [])
      setTotal(data.total)
      setPages(data.pages)
    } catch {
      showToast('error', 'Erro ao carregar clientes')
    } finally {
      setLoading(false)
    }
  }, [page, searchQuery, statusFilter, tagFilter])

  useEffect(() => { load() }, [load])

  // Busca o próximo código de cliente ao montar
  useEffect(() => {
    fetch('/api/admin/clientes/next-id')
      .then((r) => r.json())
      .then((d) => { if (d.nextClientId) setNextClientCode(d.nextClientId) })
      .catch(() => {})
  }, [])

  function showToast(kind: 'success' | 'error', message: string) {
    setToast({ kind, message })
    setTimeout(() => setToast(null), 4000)
  }

  async function openDetail(c: Client) {
    setSelectedClient(c)
    setDetailTab('dados')
    setEditing(false)
    setEditingClientCode(false)
    setEditForm({
      name: c.user.name ?? '',
      phone: c.user.phone ?? '',
      email: c.user.email,
      companyName: c.companyName ?? '',
      taxId: c.taxId ?? '',
      jobTitle: c.jobTitle ?? '',
      whatsapp: c.whatsapp ?? '',
      operationNiche: c.operationNiche ?? '',
      clientStatus: c.clientStatus,
      leadAcquisitionSource: c.leadAcquisitionSource ?? '',
      commercialNotes: c.commercialNotes ?? '',
      instagramHandle: c.instagramHandle ?? '',
      facebookUrl: c.facebookUrl ?? '',
      linkedinUrl: c.linkedinUrl ?? '',
      telegramUsername: c.telegramUsername ?? '',
      addressZip: c.addressZip ?? '',
      addressStreet: c.addressStreet ?? '',
      addressNumber: c.addressNumber ?? '',
      addressComplement: c.addressComplement ?? '',
      addressNeighborhood: c.addressNeighborhood ?? '',
      addressCity: c.addressCity ?? '',
      addressState: c.addressState ?? '',
      creditLimit: c.creditLimit ?? undefined,
      preferredDueDay: c.preferredDueDay ?? undefined,
      segmentationTags: parseTags(c.segmentationTags),
    })
    // Busca pedidos
    const res = await fetch(`/api/admin/clientes/${c.id}`)
    if (res.ok) {
      const d = await res.json()
      setOrders(d.recentOrders ?? [])
    }
  }

  async function lookupCep(cep: string) {
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    try {
      const res = await fetch(`/api/utils/cep?cep=${digits}`)
      if (!res.ok) { showToast('error', 'CEP não encontrado'); return }
      const d = await res.json()
      setEditForm((f) => ({
        ...f,
        addressStreet: d.logradouro || f.addressStreet,
        addressNeighborhood: d.bairro || f.addressNeighborhood,
        addressCity: d.cidade || f.addressCity,
        addressState: d.estado || f.addressState,
        addressComplement: d.complemento || f.addressComplement,
      }))
    } finally {
      setCepLoading(false)
    }
  }

  async function lookupCnpj(cnpj: string) {
    const digits = cnpj.replace(/\D/g, '')
    if (digits.length !== 14) {
      showToast('error', 'CNPJ deve ter 14 dígitos')
      return
    }
    setCnpjLoading(true)
    try {
      const res = await fetch(`/api/receita/consulta-cnpj?cnpj=${digits}`)
      if (!res.ok) {
        const e = await res.json()
        showToast('error', e.error || 'CNPJ não encontrado ou serviço indisponível')
        return
      }
      const d = await res.json()
      setEditForm((f) => ({
        ...f,
        companyName: d.razaoSocial || f.companyName,
        addressStreet: d.logradouro || f.addressStreet,
        addressNumber: d.numero || f.addressNumber,
        addressComplement: d.complemento || f.addressComplement,
        addressNeighborhood: d.bairro || f.addressNeighborhood,
        addressCity: d.municipio || f.addressCity,
        addressState: d.uf || f.addressState,
        addressZip: d.cep ? d.cep.replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2') : f.addressZip,
      }))
      showToast('success', `Dados preenchidos: ${d.razaoSocial}`)
    } finally {
      setCnpjLoading(false)
    }
  }

  async function saveEdit() {
    if (!selectedClient) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/clientes/${selectedClient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) {
        const e = await res.json()
        showToast('error', e.error || 'Erro ao salvar')
        return
      }
      showToast('success', 'Cliente atualizado com sucesso')
      setEditing(false)
      load()
      // Atualiza o selecionado
      const updated = await res.json()
      setSelectedClient({ ...selectedClient, ...updated })
    } finally {
      setSaving(false)
    }
  }

  function toggleTag(tag: string) {
    setEditForm((f) => {
      const tags = parseTags(f.segmentationTags)
      return {
        ...f,
        segmentationTags: tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag],
      }
    })
  }

  function toggleCreateTag(tag: string) {
    setCreateForm((f) => ({
      ...f,
      segmentationTags: f.segmentationTags.includes(tag)
        ? f.segmentationTags.filter((t) => t !== tag)
        : [...f.segmentationTags, tag],
    }))
  }

  function validateCreate(): boolean {
    const errs: Record<string, string> = {}
    if (!createForm.name.trim() || createForm.name.trim().length < 2) errs.name = 'Nome obrigatório (mín. 2 caracteres)'
    if (!createForm.email.trim() || !/^[^@]+@[^@]+\.[^@]+$/.test(createForm.email)) errs.email = 'E-mail inválido'
    // Validação de Tax ID apenas para Brasil (CPF/CNPJ); outros países aceitam qualquer formato
    if (createForm.country === 'BR' && createForm.taxId) {
      const digits = createForm.taxId.replace(/\D/g, '')
      if (digits.length !== 0 && digits.length !== 11 && digits.length !== 14) errs.taxId = 'CPF (11 dígitos) ou CNPJ (14 dígitos)'
    }
    setCreateErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!validateCreate()) return
    setCreating(true)
    try {
      const res = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...createForm,
          phone: createForm.phone ? `${createForm.ddi}${createForm.phone.replace(/\D/g, '')}` : null,
          whatsapp: createForm.whatsapp ? `${createForm.ddi}${createForm.whatsapp.replace(/\D/g, '')}` : null,
          country: createForm.country || null,
          taxId: createForm.taxId || null,
          companyName: createForm.companyName || null,
          jobTitle: createForm.jobTitle || null,
          instagramHandle: createForm.instagramHandle || null,
          whatsappGroupLink: createForm.whatsappGroupLink || null,
          operationNiche: createForm.operationNiche || null,
          leadAcquisitionSource: createForm.leadAcquisitionSource || null,
          commercialNotes: createForm.commercialNotes || null,
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        showToast('error', d.error || 'Erro ao cadastrar cliente')
        return
      }
      setCreateStep('success')
      // Atualiza o próximo código
      fetch('/api/admin/clientes/next-id').then(r => r.json()).then(d => { if (d.nextClientId) setNextClientCode(d.nextClientId) }).catch(() => {})
      load()
    } finally {
      setCreating(false)
    }
  }

  async function saveClientCode() {
    if (!selectedClient) return
    const raw = clientCodeInput.trim().toUpperCase()
    if (!raw) { showToast('error', 'Digite um código válido (ex: C303)'); return }
    if (!/^C\d{1,6}$/.test(raw)) { showToast('error', 'Formato inválido — use C seguido de números, ex: C303'); return }
    setSavingClientCode(true)
    try {
      const res = await fetch(`/api/admin/clientes/${selectedClient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientCode: raw }),
      })
      const d = await res.json()
      if (!res.ok) { showToast('error', d.error || 'Erro ao salvar código'); return }
      setSelectedClient({ ...selectedClient, clientCode: raw })
      setClients((prev) => prev.map((c) => c.id === selectedClient.id ? { ...c, clientCode: raw } : c))
      showToast('success', `Código atualizado para ${raw}`)
      setEditingClientCode(false)
    } finally {
      setSavingClientCode(false)
    }
  }

  async function saveSequence() {
    const raw = codeInput.trim().replace(/^C/i, '')
    const n = parseInt(raw, 10)
    if (!n || n < 1) { showToast('error', 'Número inválido'); return }
    setSavingCode(true)
    try {
      const res = await fetch('/api/admin/clientes/next-id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextNumber: n }),
      })
      const d = await res.json()
      if (!res.ok) { showToast('error', d.error || 'Erro ao ajustar'); return }
      setNextClientCode(d.nextClientId)
      showToast('success', `Sequência ajustada → próximo: ${d.nextClientId}`)
      setEditingCode(false)
    } finally {
      setSavingCode(false)
    }
  }

  function closeCreate() {
    setShowCreate(false)
    setCreateForm(EMPTY_CREATE)
    setCreateErrors({})
    setCreateStep('form')
  }

  return (
    <div className="p-4 md:p-6 max-w-screen-2xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toast.kind === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold">Cadastro de Clientes (CRM)</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{total} cliente{total !== 1 ? 's' : ''} cadastrado{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {nextClientCode && (
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700">
              <Hash className="w-4 h-4 text-primary-600 dark:text-primary-400 shrink-0" />
              <span className="text-xs text-zinc-500 shrink-0">Próximo código:</span>
              {editingCode ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); saveSequence() }}
                  className="flex items-center gap-1"
                >
                  <span className="font-bold text-primary-700 dark:text-primary-300 font-mono text-sm">C</span>
                  <input
                    type="number"
                    min="1"
                    max="999999"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    className="w-20 px-1.5 py-0.5 rounded border border-primary-300 dark:border-primary-600 bg-white dark:bg-zinc-800 text-sm font-mono font-bold text-primary-700 dark:text-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-400"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Escape') setEditingCode(false) }}
                  />
                  <button type="submit" disabled={savingCode} className="p-1 rounded hover:bg-primary-100 dark:hover:bg-primary-800 text-primary-600 disabled:opacity-60">
                    {savingCode ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button type="button" onClick={() => setEditingCode(false)} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="font-bold text-primary-700 dark:text-primary-300 font-mono text-sm">{nextClientCode}</span>
                  <button
                    type="button"
                    title="Ajustar sequência"
                    onClick={() => { setCodeInput(nextClientCode.replace(/^C/i, '')); setEditingCode(true) }}
                    className="p-1 rounded hover:bg-primary-100 dark:hover:bg-primary-800 text-primary-400 hover:text-primary-600 transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => { setShowCreate(true); setCreateStep('form') }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold shadow-sm transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Novo Cliente
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por nome, e-mail, CPF/CNPJ, WhatsApp..."
            className="input-field pl-9 w-full"
          />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} className="input-field w-40">
          <option value="">Todos os status</option>
          <option value="ATIVO">Ativo</option>
          <option value="INATIVO">Inativo</option>
          <option value="BLOQUEADO">Bloqueado</option>
        </select>
        <select value={tagFilter} onChange={(e) => { setTagFilter(e.target.value); setPage(1) }} className="input-field w-44">
          <option value="">Todas as tags</option>
          {TAG_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Grid de cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando...
        </div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
            <UserPlus className="w-8 h-8 text-zinc-400" />
          </div>
          <div>
            <p className="font-semibold text-zinc-600 dark:text-zinc-300 text-base">
              {searchQuery || statusFilter || tagFilter ? 'Nenhum cliente encontrado para os filtros.' : 'Nenhum cliente cadastrado ainda.'}
            </p>
            {!searchQuery && !statusFilter && !tagFilter && (
              <p className="text-sm text-zinc-400 mt-1">Clique em <strong>Novo Cliente</strong> para começar.</p>
            )}
          </div>
          {!searchQuery && !statusFilter && !tagFilter && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold"
            >
              <UserPlus className="w-4 h-4" /> Cadastrar primeiro cliente
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {clients.map((c) => (
            <ClientCard key={c.id} client={c} onClick={() => openDetail(c)} />
          ))}
        </div>
      )}

      {/* Paginação */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded border border-zinc-200 dark:border-zinc-700 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-zinc-500">Página {page} de {pages}</span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="p-2 rounded border border-zinc-200 dark:border-zinc-700 disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Modal de Cadastro de Novo Cliente ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 md:p-8">
          <div className="w-full max-w-2xl bg-white dark:bg-ads-dark-card rounded-2xl shadow-2xl my-auto">

            {/* Cabeçalho */}
            <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <h2 className="font-bold text-lg">Novo Cliente</h2>
                  {nextClientCode && (
                    <p className="text-xs text-zinc-500">Código a ser gerado: <span className="font-bold text-primary-600 font-mono">{nextClientCode}</span></p>
                  )}
                </div>
              </div>
              <button onClick={closeCreate} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo */}
            {createStep === 'success' ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-green-700 dark:text-green-400">Cliente cadastrado com sucesso!</p>
                  <p className="text-sm text-zinc-500 mt-1">O perfil foi criado e já aparece na listagem.</p>
                </div>
                <div className="flex gap-3 mt-2">
                  <button
                    onClick={() => { setCreateForm(EMPTY_CREATE); setCreateStep('form') }}
                    className="px-4 py-2 rounded-lg border border-primary-300 text-primary-700 dark:border-primary-600 dark:text-primary-300 text-sm font-medium hover:bg-primary-50 dark:hover:bg-primary-900/20"
                  >
                    Cadastrar outro
                  </button>
                  <button
                    onClick={closeCreate}
                    className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="p-5 space-y-5">

                {/* Identificação */}
                <div>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Identificação</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        Nome Completo / Razão Social <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={createForm.name}
                        onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                        className={`input-field w-full ${createErrors.name ? 'border-red-400' : ''}`}
                        placeholder="Ex: João Silva ou Empresa LTDA"
                      />
                      {createErrors.name && <p className="text-xs text-red-500 mt-1">{createErrors.name}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        E-mail <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={createForm.email}
                        onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                        className={`input-field w-full ${createErrors.email ? 'border-red-400' : ''}`}
                        placeholder="cliente@email.com"
                      />
                      {createErrors.email && <p className="text-xs text-red-500 mt-1">{createErrors.email}</p>}
                    </div>
                    {/* País — controla label do Tax ID e DDI do telefone */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">🌍 País do Cliente</label>
                      <select
                        value={createForm.country}
                        onChange={(e) => {
                          const c = getCountry(e.target.value)
                          setCreateForm((f) => ({ ...f, country: e.target.value, ddi: c.ddi }))
                        }}
                        className="input-field w-full"
                      >
                        {COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Tax ID dinâmico por país */}
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        {getCountry(createForm.country).taxLabel}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={createForm.taxId}
                          onChange={(e) => setCreateForm((f) => ({ ...f, taxId: e.target.value }))}
                          className={`input-field flex-1 ${createErrors.taxId ? 'border-red-400' : ''}`}
                          placeholder={getCountry(createForm.country).taxPlaceholder}
                          maxLength={50}
                        />
                        {createForm.country === 'BR' && createForm.taxId.replace(/\D/g, '').length === 14 && (
                          <button
                            type="button"
                            onClick={() => {
                              const digits = createForm.taxId.replace(/\D/g, '')
                              setCnpjLoading(true)
                              fetch(`/api/receita/consulta-cnpj?cnpj=${digits}`)
                                .then(r => r.json())
                                .then(d => {
                                  if (d.razaoSocial) {
                                    setCreateForm(f => ({ ...f, companyName: d.razaoSocial || f.companyName }))
                                    showToast('success', `Empresa: ${d.razaoSocial}`)
                                  } else {
                                    showToast('error', d.error || 'CNPJ não encontrado')
                                  }
                                })
                                .catch(() => showToast('error', 'Erro ao consultar CNPJ'))
                                .finally(() => setCnpjLoading(false))
                            }}
                            disabled={cnpjLoading}
                            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-60"
                          >
                            {cnpjLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSearch className="w-3.5 h-3.5" />}
                            CNPJ
                          </button>
                        )}
                      </div>
                      {createErrors.taxId && <p className="text-xs text-red-500 mt-1">{createErrors.taxId}</p>}
                    </div>

                    {/* WhatsApp com DDI */}
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">WhatsApp</label>
                      <div className="flex gap-1">
                        <select
                          value={createForm.ddi}
                          onChange={(e) => setCreateForm((f) => ({ ...f, ddi: e.target.value }))}
                          className="input-field w-24 shrink-0 text-xs"
                        >
                          {COUNTRIES.filter((c) => c.code !== 'OTHER').map((c) => (
                            <option key={c.code} value={c.ddi}>{c.ddi} {c.code}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={createForm.whatsapp}
                          onChange={(e) => setCreateForm((f) => ({ ...f, whatsapp: e.target.value }))}
                          className="input-field flex-1"
                          placeholder="(11) 99999-9999"
                        />
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-0.5">Será salvo em formato E.164: {createForm.ddi}{createForm.whatsapp.replace(/\D/g,'') || 'XXXXXXXXXX'}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Telefone</label>
                      <div className="flex gap-1">
                        <span className="input-field w-16 shrink-0 text-xs flex items-center justify-center bg-zinc-50 dark:bg-zinc-800 text-zinc-500">
                          {createForm.ddi}
                        </span>
                        <input
                          type="text"
                          value={createForm.phone}
                          onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                          className="input-field flex-1"
                          placeholder="(11) 3333-4444"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Empresa / Nome Fantasia</label>
                      <input
                        type="text"
                        value={createForm.companyName}
                        onChange={(e) => setCreateForm((f) => ({ ...f, companyName: e.target.value }))}
                        className="input-field w-full"
                        placeholder="Nome da empresa"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Cargo</label>
                      <input
                        type="text"
                        value={createForm.jobTitle}
                        onChange={(e) => setCreateForm((f) => ({ ...f, jobTitle: e.target.value }))}
                        className="input-field w-full"
                        placeholder="Ex: Gestor de Tráfego"
                      />
                    </div>

                    {/* Instagram */}
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        <span className="inline-flex items-center gap-1">
                          <Instagram className="w-3.5 h-3.5 text-pink-500" /> Instagram
                        </span>
                      </label>
                      <input
                        type="text"
                        value={createForm.instagramHandle}
                        onChange={(e) => setCreateForm((f) => ({ ...f, instagramHandle: e.target.value }))}
                        className="input-field w-full"
                        placeholder="@usuario"
                      />
                    </div>

                    {/* Grupo WhatsApp */}
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        <span className="inline-flex items-center gap-1">
                          <span className="text-green-500 text-xs">💬</span> Link do Grupo WhatsApp
                        </span>
                      </label>
                      <input
                        type="text"
                        value={createForm.whatsappGroupLink}
                        onChange={(e) => setCreateForm((f) => ({ ...f, whatsappGroupLink: e.target.value }))}
                        className="input-field w-full"
                        placeholder="https://chat.whatsapp.com/..."
                      />
                    </div>

                    {/* Código do cliente — preview */}
                    {nextClientCode && (
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                          <span className="inline-flex items-center gap-1"><Hash className="w-3.5 h-3.5 text-primary-500" /> Código do Cliente (gerado automaticamente)</span>
                        </label>
                        <div className="input-field w-full bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 font-mono text-sm cursor-not-allowed select-none">
                          {nextClientCode}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Comercial */}
                <div>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Informações Comerciais</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Nicho de Operação</label>
                      <input
                        type="text"
                        value={createForm.operationNiche}
                        onChange={(e) => setCreateForm((f) => ({ ...f, operationNiche: e.target.value }))}
                        className="input-field w-full"
                        placeholder="Ex: E-commerce, Info produto..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Origem do Lead</label>
                      <select
                        value={createForm.leadAcquisitionSource}
                        onChange={(e) => setCreateForm((f) => ({ ...f, leadAcquisitionSource: e.target.value }))}
                        className="input-field w-full"
                      >
                        <option value="">Selecionar...</option>
                        <option value="INSTAGRAM">Instagram</option>
                        <option value="WHATSAPP">WhatsApp</option>
                        <option value="INDICACAO">Indicação</option>
                        <option value="GOOGLE_ADS">Google Ads</option>
                        <option value="YOUTUBE">YouTube</option>
                        <option value="GRUPO_TELEGRAM">Grupo Telegram</option>
                        <option value="EVENTO">Evento</option>
                        <option value="OUTROS">Outros</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Status</label>
                      <select
                        value={createForm.clientStatus}
                        onChange={(e) => setCreateForm((f) => ({ ...f, clientStatus: e.target.value as CreateForm['clientStatus'] }))}
                        className="input-field w-full"
                      >
                        <option value="ATIVO">Ativo</option>
                        <option value="INATIVO">Inativo</option>
                        <option value="BLOQUEADO">Bloqueado</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Moeda Preferencial</label>
                      <select
                        value={createForm.preferredCurrency}
                        onChange={(e) => setCreateForm((f) => ({ ...f, preferredCurrency: e.target.value as 'BRL' | 'USD' }))}
                        className="input-field w-full"
                      >
                        <option value="BRL">BRL — Real Brasileiro</option>
                        <option value="USD">USD — Dólar</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Notas Comerciais</label>
                      <textarea
                        value={createForm.commercialNotes}
                        onChange={(e) => setCreateForm((f) => ({ ...f, commercialNotes: e.target.value }))}
                        rows={2}
                        className="input-field w-full text-sm resize-none"
                        placeholder="Observações internas (visível apenas pelo time)..."
                      />
                    </div>
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Tags de Segmentação</p>
                  <div className="flex flex-wrap gap-2">
                    {TAG_OPTIONS.map((t) => {
                      const active = createForm.segmentationTags.includes(t.value)
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => toggleCreateTag(t.value)}
                          className={`px-2.5 py-1 rounded-full text-xs border font-medium transition-all ${
                            active ? t.color : 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-700 dark:text-zinc-400 dark:border-zinc-600'
                          }`}
                        >
                          {t.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Ações */}
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-200 dark:border-white/10">
                  <button type="button" onClick={closeCreate} className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Cadastrando…</> : <><UserPlus className="w-4 h-4" /> Cadastrar Cliente</>}
                  </button>
                </div>

              </form>
            )}
          </div>
        </div>
      )}

      {/* Drawer de detalhe */}
      {selectedClient && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/40" onClick={() => setSelectedClient(null)} />
          <div className="w-full max-w-2xl bg-white dark:bg-ads-dark-card shadow-2xl flex flex-col overflow-hidden">
            {/* Cabeçalho do drawer */}
            <div className="flex items-start justify-between p-5 border-b border-zinc-200 dark:border-white/10">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold">{selectedClient.user.name ?? '—'}</h2>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                    selectedClient.clientStatus === 'ATIVO' ? 'bg-green-100 text-green-800' :
                    selectedClient.clientStatus === 'INATIVO' ? 'bg-zinc-200 text-zinc-600' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {selectedClient.clientStatus}
                  </span>
                  {selectedClient.riskBlockCheckout && (
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-600 text-white">🛑 Bloqueado</span>
                  )}
                </div>
                <p className="text-sm text-zinc-500 mt-0.5">{selectedClient.user.email}</p>
                {/* Código do cliente — editável inline */}
                <div className="mt-1">
                  {editingClientCode ? (
                    <form
                      onSubmit={(e) => { e.preventDefault(); saveClientCode() }}
                      className="inline-flex items-center gap-1"
                    >
                      <Hash className="w-3 h-3 text-primary-600 shrink-0" />
                      <input
                        type="text"
                        value={clientCodeInput}
                        onChange={(e) => setClientCodeInput(e.target.value.toUpperCase())}
                        className="w-20 px-1.5 py-0.5 rounded border border-primary-300 dark:border-primary-600 bg-white dark:bg-zinc-800 text-xs font-mono font-bold text-primary-700 dark:text-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-400 uppercase"
                        placeholder="C303"
                        maxLength={8}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Escape') setEditingClientCode(false) }}
                      />
                      <button type="submit" disabled={savingClientCode} className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 disabled:opacity-60">
                        {savingClientCode ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      </button>
                      <button type="button" onClick={() => setEditingClientCode(false)} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400">
                        <X className="w-3 h-3" />
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      title="Clique para editar o código"
                      onClick={() => { setClientCodeInput(selectedClient.clientCode ?? ''); setEditingClientCode(true) }}
                      className="group inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/40 border border-primary-200 dark:border-primary-700 hover:border-primary-400 transition-colors"
                    >
                      <Hash className="w-3 h-3 text-primary-600" />
                      <span className="text-xs font-bold text-primary-700 dark:text-primary-300 font-mono">
                        {selectedClient.clientCode ?? '— sem código'}
                      </span>
                      <Pencil className="w-2.5 h-2.5 text-primary-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!editing ? (
                  <button onClick={() => setEditing(true)} className="p-2 rounded hover:bg-zinc-100 dark:hover:bg-white/10">
                    <Edit3 className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-primary-600 text-white text-sm font-medium disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Salvar
                  </button>
                )}
                <button onClick={() => setSelectedClient(null)} className="p-2 rounded hover:bg-zinc-100 dark:hover:bg-white/10">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-zinc-200 dark:border-white/10 px-5 gap-1">
              {([
                { id: 'dados', label: 'Dados Gerais' },
                { id: 'endereco', label: 'Endereço' },
                { id: 'financeiro', label: 'Financeiro' },
                { id: 'historico', label: 'Histórico' },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDetailTab(tab.id)}
                  className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    detailTab === tab.id
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Conteúdo das tabs */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* ── Dados Gerais ── */}
              {detailTab === 'dados' && (
                <>
                  {/* Cards de LTV */}
                  {selectedClient.metrics && (
                    <div className="grid grid-cols-3 gap-3">
                      <MetricBox label="LTV Real" value={brl(selectedClient.metrics.ltvReal)} icon={<TrendingUp className="w-4 h-4 text-green-600" />} />
                      <MetricBox label="LTV Projetado 12m" value={brl(selectedClient.metrics.ltvProjetado12m)} icon={<TrendingUp className="w-4 h-4 text-blue-600" />} />
                      <MetricBox label="Ticket Médio" value={brl(selectedClient.metrics.ticketMedio)} icon={<ShoppingCart className="w-4 h-4 text-purple-600" />} />
                    </div>
                  )}

                  {/* Tags de segmentação */}
                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Tags de Segmentação</p>
                    <div className="flex flex-wrap gap-1.5">
                      {editing ? (
                        TAG_OPTIONS.map((t) => {
                          const active = parseTags(editForm.segmentationTags).includes(t.value)
                          return (
                            <button
                              key={t.value}
                              type="button"
                              onClick={() => toggleTag(t.value)}
                              className={`px-2 py-1 rounded-full text-xs border font-medium transition-all ${
                                active ? t.color : 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-700 dark:text-zinc-400 dark:border-zinc-600'
                              }`}
                            >
                              {t.label}
                            </button>
                          )
                        })
                      ) : (
                        parseTags(selectedClient.segmentationTags).length > 0 ? (
                          parseTags(selectedClient.segmentationTags).map((tag) => {
                            const cfg = tagConfig(tag)
                            return (
                              <span key={tag} className={`px-2 py-0.5 rounded-full text-xs border font-medium ${cfg.color}`}>
                                {cfg.label}
                              </span>
                            )
                          })
                        ) : (
                          <span className="text-xs text-zinc-400">Nenhuma tag</span>
                        )
                      )}
                    </div>
                  </div>

                  <FormGrid editing={editing}>
                    <FormField label="Nome Completo / Razão Social" editing={editing}
                      value={editing ? editForm.name ?? '' : (selectedClient.user.name ?? '—')}
                      onChange={(v) => setEditForm((f) => ({ ...f, name: v }))}
                    />
                    <FormField label="Empresa" editing={editing}
                      value={editing ? editForm.companyName ?? '' : (selectedClient.companyName ?? '—')}
                      onChange={(v) => setEditForm((f) => ({ ...f, companyName: v }))}
                    />
                    {/* CPF / CNPJ com botão de consulta */}
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">CPF / CNPJ</label>
                      {editing ? (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editForm.taxId ?? ''}
                            onChange={(e) => setEditForm((f) => ({ ...f, taxId: e.target.value }))}
                            className="input-field flex-1 text-sm"
                            placeholder="00.000.000/0001-00"
                          />
                          {(editForm.taxId ?? '').replace(/\D/g, '').length === 14 && (
                            <button
                              type="button"
                              onClick={() => lookupCnpj(editForm.taxId ?? '')}
                              disabled={cnpjLoading}
                              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-60"
                              title="Buscar dados na Receita Federal (BrasilAPI)"
                            >
                              {cnpjLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSearch className="w-3.5 h-3.5" />}
                              {cnpjLoading ? 'Buscando…' : 'CNPJ'}
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-zinc-800 dark:text-zinc-200">{selectedClient.taxId ?? '—'}</p>
                      )}
                    </div>
                    <FormField label="Cargo" editing={editing}
                      value={editing ? editForm.jobTitle ?? '' : (selectedClient.jobTitle ?? '—')}
                      onChange={(v) => setEditForm((f) => ({ ...f, jobTitle: v }))}
                    />
                    <FormField label="WhatsApp" editing={editing}
                      value={editing ? editForm.whatsapp ?? '' : (selectedClient.whatsapp ?? '—')}
                      onChange={(v) => setEditForm((f) => ({ ...f, whatsapp: v }))}
                      placeholder="(11) 99999-9999"
                    />
                    <FormField label="Telefone" editing={editing}
                      value={editing ? editForm.phone ?? '' : (selectedClient.user.phone ?? '—')}
                      onChange={(v) => setEditForm((f) => ({ ...f, phone: v }))}
                    />
                    <FormField label="E-mail" editing={false} value={selectedClient.user.email} onChange={() => {}} />
                    <FormField label="Nicho de Operação" editing={editing}
                      value={editing ? editForm.operationNiche ?? '' : (selectedClient.operationNiche ?? '—')}
                      onChange={(v) => setEditForm((f) => ({ ...f, operationNiche: v }))}
                    />
                    <FormField label="Origem do Lead" editing={editing}
                      value={editing ? editForm.leadAcquisitionSource ?? '' : (selectedClient.leadAcquisitionSource ?? '—')}
                      onChange={(v) => setEditForm((f) => ({ ...f, leadAcquisitionSource: v }))}
                    />
                  </FormGrid>

                  {/* Redes sociais */}
                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Redes Sociais</p>
                    <div className="grid grid-cols-2 gap-3">
                      <FormFieldIcon label="Instagram" icon={<Instagram className="w-3.5 h-3.5" />} editing={editing}
                        value={editing ? editForm.instagramHandle ?? '' : (selectedClient.instagramHandle ?? '—')}
                        onChange={(v) => setEditForm((f) => ({ ...f, instagramHandle: v }))}
                        placeholder="@usuario"
                      />
                      <FormFieldIcon label="Telegram" icon={<Phone className="w-3.5 h-3.5" />} editing={editing}
                        value={editing ? editForm.telegramUsername ?? '' : (selectedClient.telegramUsername ?? '—')}
                        onChange={(v) => setEditForm((f) => ({ ...f, telegramUsername: v }))}
                        placeholder="@username"
                      />
                      <FormFieldIcon label="LinkedIn" icon={<Linkedin className="w-3.5 h-3.5" />} editing={editing}
                        value={editing ? editForm.linkedinUrl ?? '' : (selectedClient.linkedinUrl ?? '—')}
                        onChange={(v) => setEditForm((f) => ({ ...f, linkedinUrl: v }))}
                        placeholder="https://linkedin.com/in/..."
                      />
                      <FormFieldIcon label="Facebook" icon={<Globe className="w-3.5 h-3.5" />} editing={editing}
                        value={editing ? editForm.facebookUrl ?? '' : (selectedClient.facebookUrl ?? '—')}
                        onChange={(v) => setEditForm((f) => ({ ...f, facebookUrl: v }))}
                        placeholder="https://facebook.com/..."
                      />
                      <div className="col-span-2">
                        <FormFieldIcon label="💬 Grupo WhatsApp" icon={<></>} editing={editing}
                          value={editing ? editForm.whatsappGroupLink ?? '' : (selectedClient.whatsappGroupLink ?? '—')}
                          onChange={(v) => setEditForm((f) => ({ ...f, whatsappGroupLink: v }))}
                          placeholder="https://chat.whatsapp.com/..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Notas comerciais */}
                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">Notas Comerciais</p>
                    {editing ? (
                      <textarea
                        value={editForm.commercialNotes ?? ''}
                        onChange={(e) => setEditForm((f) => ({ ...f, commercialNotes: e.target.value }))}
                        rows={3}
                        className="input-field w-full text-sm resize-none"
                        placeholder="Observações internas do comercial..."
                      />
                    ) : (
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                        {selectedClient.commercialNotes || <span className="text-zinc-400 italic">Sem notas</span>}
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* ── Endereço ── */}
              {detailTab === 'endereco' && (
                <div className="space-y-4">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">CEP</label>
                      {editing ? (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editForm.addressZip ?? ''}
                            onChange={(e) => setEditForm((f) => ({ ...f, addressZip: e.target.value }))}
                            onBlur={(e) => lookupCep(e.target.value)}
                            className="input-field flex-1"
                            placeholder="00000-000"
                            maxLength={9}
                          />
                          {cepLoading && <Loader2 className="w-4 h-4 animate-spin self-center text-zinc-400" />}
                        </div>
                      ) : (
                        <p className="text-sm">{selectedClient.addressZip ?? '—'}</p>
                      )}
                    </div>
                  </div>
                  <FormGrid editing={editing}>
                    <FormField label="Logradouro" editing={editing}
                      value={editing ? editForm.addressStreet ?? '' : (selectedClient.addressStreet ?? '—')}
                      onChange={(v) => setEditForm((f) => ({ ...f, addressStreet: v }))}
                    />
                    <FormField label="Número" editing={editing}
                      value={editing ? editForm.addressNumber ?? '' : (selectedClient.addressNumber ?? '—')}
                      onChange={(v) => setEditForm((f) => ({ ...f, addressNumber: v }))}
                    />
                    <FormField label="Complemento" editing={editing}
                      value={editing ? editForm.addressComplement ?? '' : (selectedClient.addressComplement ?? '—')}
                      onChange={(v) => setEditForm((f) => ({ ...f, addressComplement: v }))}
                    />
                    <FormField label="Bairro" editing={editing}
                      value={editing ? editForm.addressNeighborhood ?? '' : (selectedClient.addressNeighborhood ?? '—')}
                      onChange={(v) => setEditForm((f) => ({ ...f, addressNeighborhood: v }))}
                    />
                    <FormField label="Cidade" editing={editing}
                      value={editing ? editForm.addressCity ?? '' : (selectedClient.addressCity ?? '—')}
                      onChange={(v) => setEditForm((f) => ({ ...f, addressCity: v }))}
                    />
                    <FormField label="Estado (UF)" editing={editing}
                      value={editing ? editForm.addressState ?? '' : (selectedClient.addressState ?? '—')}
                      onChange={(v) => setEditForm((f) => ({ ...f, addressState: v.toUpperCase().slice(0, 2) }))}
                      placeholder="SP"
                    />
                  </FormGrid>
                  {!editing && (selectedClient.addressCity || selectedClient.addressState) && (
                    <div className="flex items-center gap-1.5 text-sm text-zinc-500 mt-1">
                      <MapPin className="w-4 h-4" />
                      {[selectedClient.addressStreet, selectedClient.addressNumber, selectedClient.addressNeighborhood,
                        selectedClient.addressCity, selectedClient.addressState].filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
              )}

              {/* ── Financeiro ── */}
              {detailTab === 'financeiro' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <MetricBox label="Total Gasto" value={brl(Number(selectedClient.totalSpent))} icon={<DollarSign className="w-4 h-4 text-green-600" />} />
                    <MetricBox label="Contas Compradas" value={String(selectedClient.totalAccountsBought)} icon={<ShoppingCart className="w-4 h-4 text-blue-600" />} />
                    <MetricBox label="Ticket Médio" value={brl(Number(selectedClient.averageTicketBrl))} icon={<TrendingUp className="w-4 h-4 text-purple-600" />} />
                    <MetricBox label="Reembolsos" value={String(selectedClient.refundCount)} icon={<AlertTriangle className="w-4 h-4 text-amber-500" />} />
                  </div>
                  <FormGrid editing={editing}>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Limite de Crédito (R$)</label>
                      {editing ? (
                        <input type="number" min="0" step="0.01"
                          value={editForm.creditLimit ?? ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, creditLimit: e.target.value ? parseFloat(e.target.value) : undefined }))}
                          className="input-field" placeholder="0.00"
                        />
                      ) : (
                        <p className="text-sm font-semibold">{brl(selectedClient.creditLimit)}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Dia de Vencimento Preferencial</label>
                      {editing ? (
                        <input type="number" min="1" max="28"
                          value={editForm.preferredDueDay ?? ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, preferredDueDay: e.target.value ? parseInt(e.target.value) : undefined }))}
                          className="input-field" placeholder="Ex: 10"
                        />
                      ) : (
                        <p className="text-sm font-semibold">{selectedClient.preferredDueDay ? `Dia ${selectedClient.preferredDueDay}` : '—'}</p>
                      )}
                    </div>
                  </FormGrid>
                  {selectedClient.metrics && (
                    <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 bg-zinc-50 dark:bg-zinc-800/40">
                      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">LTV Projetado</p>
                      <div className="grid grid-cols-3 gap-3">
                        <MetricBox label="3 meses" value={brl(selectedClient.metrics.ltvProjetado12m)} icon={<Calendar className="w-3.5 h-3.5 text-zinc-400" />} small />
                        <MetricBox label="6 meses" value={brl(selectedClient.metrics.ltvProjetado12m)} icon={<Calendar className="w-3.5 h-3.5 text-zinc-400" />} small />
                        <MetricBox label="12 meses" value={brl(selectedClient.metrics.ltvProjetado12m)} icon={<Calendar className="w-3.5 h-3.5 text-zinc-400" />} small />
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        {churnBadge(selectedClient.metrics.churnRisk)}
                        {selectedClient.metrics.diasSemCompra != null && (
                          <span className="text-xs text-zinc-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {selectedClient.metrics.diasSemCompra}d sem comprar
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Histórico / Timeline ── */}
              {detailTab === 'historico' && (
                <div>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-4">Linha do Tempo de Compras</p>
                  {orders.length === 0 ? (
                    <p className="text-sm text-zinc-400 text-center py-10">Nenhum pedido encontrado.</p>
                  ) : (
                    <ol className="relative border-l-2 border-zinc-200 dark:border-zinc-700 ml-3 space-y-5">
                      {orders.map((o) => (
                        <li key={o.id} className="ml-5 relative">
                          <div className="absolute -left-[27px] top-1 w-4 h-4 rounded-full border-2 border-zinc-300 dark:border-zinc-600 bg-white dark:bg-ads-dark-card flex items-center justify-center">
                            <div className={`w-2 h-2 rounded-full ${
                              o.status === 'PAID' ? 'bg-green-500' :
                              o.status === 'REFUNDED' ? 'bg-red-500' :
                              'bg-amber-400'
                            }`} />
                          </div>
                          <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-lg p-3 border border-zinc-200 dark:border-zinc-700">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium truncate">{o.product ?? 'Produto'}</p>
                              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                o.status === 'PAID' ? 'bg-green-100 text-green-800' :
                                o.status === 'REFUNDED' ? 'bg-red-100 text-red-800' :
                                'bg-amber-100 text-amber-800'
                              }`}>
                                {o.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 flex-wrap">
                              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                                {o.value != null ? o.value.toLocaleString('pt-BR', { style: 'currency', currency: o.currency ?? 'BRL' }) : '—'}
                              </span>
                              {o.paidAt && (
                                <span>{new Date(o.paidAt).toLocaleDateString('pt-BR')}</span>
                              )}
                              {o.paymentMethod && <span>· {o.paymentMethod}</span>}
                              {o.orderSource && <span>· {o.orderSource}</span>}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Componente: Card de Cliente (LTV View) ───────────────────────────────────

function ClientCard({ client, onClick }: { client: Client; onClick: () => void }) {
  const ltv        = client.metrics?.ltvReal
  const churnRisk  = client.metrics?.churnRisk
  const stars      = client.trustLevelStars ?? 0
  const tags       = parseTags(client.segmentationTags)
  const displayName = client.user.name ?? client.companyName ?? client.user.email.split('@')[0]
  const company    = client.companyName ?? client.operationNiche

  const statusColor = client.clientStatus === 'ATIVO'
    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    : client.clientStatus === 'INATIVO'
    ? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left w-full h-full flex flex-col rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-ads-dark-card hover:border-primary-400 hover:shadow-lg transition-all p-4 group"
    >
      {/* ── Topo: avatar + nome + status ─────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold text-sm shrink-0 uppercase">
            {displayName[0]}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight line-clamp-1 text-zinc-800 dark:text-zinc-100">
              {displayName}
            </p>
            <p className="text-[11px] text-zinc-400 truncate">{client.user.email}</p>
          </div>
        </div>
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor}`}>
          {client.clientStatus}
        </span>
      </div>

      {/* ── Empresa / nicho ───────────────────────────────────────────────────── */}
      {company && (
        <div className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400 mb-2 min-w-0">
          <Building2 className="w-3 h-3 shrink-0 text-zinc-400" />
          <span className="truncate">{company}</span>
        </div>
      )}

      {/* ── LTV + Contas ──────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-zinc-100 dark:border-zinc-700/60 bg-zinc-50 dark:bg-zinc-800/40 px-3 py-2 mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wider mb-0.5">Faturamento Total</p>
          <p className={`text-base font-black leading-tight ${ltv && Number(ltv) > 0 ? 'text-green-600 dark:text-green-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
            {ltv != null && Number(ltv) > 0
              ? Number(ltv).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
              : 'Sem compras'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wider mb-0.5">Contas</p>
          <p className="text-base font-black text-zinc-700 dark:text-zinc-300">{client.totalAccountsBought ?? 0}</p>
        </div>
      </div>

      {/* ── Spacer para empurrar rodapé para baixo ────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Rodapé: código + churn + tags ────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {client.clientCode && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 text-[10px] font-bold text-primary-700 dark:text-primary-300 font-mono">
            <Hash className="w-2.5 h-2.5" />{client.clientCode}
          </span>
        )}
        {churnBadge(churnRisk)}
        {stars > 0 && (
          <div className="flex items-center gap-0.5">
            {Array.from({ length: stars }).map((_, i) => (
              <Star key={i} className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
            ))}
          </div>
        )}
        {tags.slice(0, 2).map((tag) => {
          const cfg = tagConfig(tag)
          return (
            <span key={tag} className={`px-1.5 py-0.5 rounded-full text-[10px] border font-medium ${cfg.color}`}>
              {cfg.label}
            </span>
          )
        })}
        {tags.length > 2 && (
          <span className="text-[10px] text-zinc-400">+{tags.length - 2}</span>
        )}
        {client.riskBlockCheckout && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600">
            <Shield className="w-2.5 h-2.5" /> Bloqueado
          </span>
        )}
      </div>
    </button>
  )
}

// ─── Auxiliares de formulário ─────────────────────────────────────────────────

function MetricBox({ label, value, icon, small }: { label: string; value: string; icon: React.ReactNode; small?: boolean }) {
  return (
    <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-lg p-3 border border-zinc-200 dark:border-zinc-700">
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className={`text-zinc-500 ${small ? 'text-[10px]' : 'text-xs'}`}>{label}</span></div>
      <p className={`font-bold text-zinc-800 dark:text-zinc-100 ${small ? 'text-sm' : 'text-base'}`}>{value}</p>
    </div>
  )
}

function FormGrid({ children, editing }: { children: React.ReactNode; editing: boolean }) {
  return (
    <div className={`grid gap-3 ${editing ? 'grid-cols-2' : 'grid-cols-2'}`}>
      {children}
    </div>
  )
}

function FormField({
  label, value, onChange, editing, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; editing: boolean; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">{label}</label>
      {editing ? (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="input-field w-full text-sm" placeholder={placeholder} />
      ) : (
        <p className="text-sm text-zinc-800 dark:text-zinc-200">{value || '—'}</p>
      )}
    </div>
  )
}

function FormFieldIcon({
  label, value, onChange, editing, icon, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; editing: boolean; icon: React.ReactNode; placeholder?: string
}) {
  return (
    <div>
      <label className="flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
        {icon} {label}
      </label>
      {editing ? (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="input-field w-full text-sm" placeholder={placeholder} />
      ) : value && value !== '—' ? (
        <a href={value.startsWith('http') ? value : `https://instagram.com/${value.replace('@', '')}`}
          target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline">
          {value} <ExternalLink className="w-3 h-3" />
        </a>
      ) : (
        <p className="text-sm text-zinc-400">—</p>
      )}
    </div>
  )
}
