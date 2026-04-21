'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, Building2, MapPin, Phone,
  TrendingUp, ShoppingCart, AlertTriangle,
  ChevronLeft, ChevronRight, Edit3, X, Save, Loader2,
  Instagram, Linkedin, ExternalLink, Star, Shield,
  Clock, DollarSign, Calendar, Globe, Hash, FileSearch
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
      setClients(data.clients)
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
          <h1 className="text-xl font-bold">Cadastro de Clientes</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{total} clientes cadastrados</p>
        </div>
        {nextClientCode && (
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700">
            <Hash className="w-4 h-4 text-primary-600 dark:text-primary-400" />
            <span className="text-xs text-zinc-500">Próximo código:</span>
            <span className="font-bold text-primary-700 dark:text-primary-300 font-mono text-sm">{nextClientCode}</span>
          </div>
        )}
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
        <div className="text-center py-20 text-zinc-400">Nenhum cliente encontrado.</div>
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
                {selectedClient.clientCode && (
                  <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/40 border border-primary-200 dark:border-primary-700">
                    <Hash className="w-3 h-3 text-primary-600" />
                    <span className="text-xs font-bold text-primary-700 dark:text-primary-300 font-mono">{selectedClient.clientCode}</span>
                  </div>
                )}
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
  const ltv = client.metrics?.ltvReal
  const churnRisk = client.metrics?.churnRisk
  const stars = client.trustLevelStars ?? 0

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-ads-dark-card hover:border-primary-400 hover:shadow-md transition-all p-4 group"
    >
      {/* Topo: avatar + status */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold text-sm shrink-0">
            {(client.user.name ?? client.user.email)[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{client.user.name ?? '—'}</p>
            <p className="text-xs text-zinc-400 truncate">{client.user.email}</p>
          </div>
        </div>
        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
          client.clientStatus === 'ATIVO' ? 'bg-green-100 text-green-800' :
          client.clientStatus === 'INATIVO' ? 'bg-zinc-200 text-zinc-500' :
          'bg-red-100 text-red-800'
        }`}>
          {client.clientStatus}
        </span>
      </div>

      {/* LTV */}
      <div className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 rounded-lg p-2.5 mb-3">
        <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">LTV Real</p>
        <p className="text-lg font-bold text-primary-700 dark:text-primary-300">
          {ltv != null ? Number(ltv).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-zinc-500">{client.totalAccountsBought} contas</span>
          {churnBadge(churnRisk)}
        </div>
      </div>

      {/* Código + Empresa + nicho */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {client.clientCode && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 text-[10px] font-bold text-primary-700 dark:text-primary-300 font-mono">
            <Hash className="w-2.5 h-2.5" />{client.clientCode}
          </span>
        )}
        {(client.companyName || client.operationNiche) && (
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            <Building2 className="w-3 h-3 shrink-0" />
            <span className="truncate">{client.companyName ?? client.operationNiche}</span>
          </div>
        )}
      </div>

      {/* Estrelas de confiança */}
      {stars > 0 && (
        <div className="flex items-center gap-0.5 mb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={`w-3 h-3 ${i < stars ? 'text-amber-400 fill-amber-400' : 'text-zinc-200 dark:text-zinc-700'}`} />
          ))}
        </div>
      )}

      {/* Tags */}
      {parseTags(client.segmentationTags).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {parseTags(client.segmentationTags).slice(0, 3).map((tag) => {
            const cfg = tagConfig(tag)
            return (
              <span key={tag} className={`px-1.5 py-0.5 rounded-full text-[10px] border font-medium ${cfg.color}`}>
                {cfg.label}
              </span>
            )
          })}
          {parseTags(client.segmentationTags).length > 3 && (
            <span className="text-[10px] text-zinc-400">+{parseTags(client.segmentationTags).length - 3}</span>
          )}
        </div>
      )}

      {/* Bloqueado */}
      {client.riskBlockCheckout && (
        <div className="mt-2 flex items-center gap-1 text-red-600 text-[10px] font-semibold">
          <Shield className="w-3 h-3" /> Bloqueado antifraude
        </div>
      )}
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
