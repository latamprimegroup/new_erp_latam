'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { SkeletonCards, SkeletonTable } from '@/components/Skeleton'
import { ProductionChecklist } from '@/components/producao/ProductionChecklist'
import { ProductionFeedback } from '@/components/producao/ProductionFeedback'

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

const CURRENCIES = [
  { value: 'BRL', label: 'BRL (Real)' },
  { value: 'USD', label: 'USD (Dólar)' },
  { value: 'EUR', label: 'EUR (Euro)' },
  { value: 'GBP', label: 'GBP (Libra)' },
  { value: 'ARS', label: 'ARS (Peso Argentino)' },
  { value: 'CLP', label: 'CLP (Peso Chileno)' },
  { value: 'MXN', label: 'MXN (Peso Mexicano)' },
  { value: 'COP', label: 'COP (Peso Colombiano)' },
  { value: 'PEN', label: 'PEN (Sol)' },
]

function formatAccountId(v: string): string {
  const d = v.replace(/\D/g, '')
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 10)}`
}

type Account = {
  id: string
  platform: string
  type: string
  email: string | null
  status: string
  rejectionReason: string | null
  producerId: string
  producer: { name: string | null }
  createdAt: string
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
  const [accounts, setAccounts] = useState<Account[]>([])
  const [kpis, setKpis] = useState({
    daily: 0,
    monthly: 0,
    dailyProd: 0,
    monthlyProd: 0,
    dailyG2: 0,
    monthlyG2: 0,
  })
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [mode, setMode] = useState<'manual' | 'estoque'>('manual')
  const [form, setForm] = useState({
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
  })
  const [cnpjPdfFile, setCnpjPdfFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [metaMensal] = useState(330)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectCode, setRejectCode] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ platform: '', type: '', typeCustom: '' })

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

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    const res = await fetch(`/api/producao?${params}`)
    const data = await res.json()
    if (res.ok) {
      setAccounts(data.accounts)
      setKpis(data.kpis)
    }
    setLoading(false)
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
    load()
  }, [filterStatus])

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

  const resolvedType = form.type === '__OUTRO__' ? form.typeCustom : form.type

  const basePayload = {
    platform: form.platform,
    type: resolvedType.trim(),
    googleAdsCustomerId: form.googleAdsCustomerId || undefined,
    currency: form.currency,
    a2fCode: form.a2fCode || undefined,
    g2ApprovalCode: form.g2ApprovalCode || undefined,
    siteUrl: form.siteUrl || undefined,
    cnpjBizLink: form.cnpjBizLink || undefined,
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!resolvedType.trim()) {
      alert('Selecione ou informe o tipo da conta')
      return
    }
    setSubmitting(true)
    const payload =
      mode === 'estoque' && (form.emailId || form.cnpjId || form.paymentProfileId)
        ? { ...basePayload, emailId: form.emailId || undefined, cnpjId: form.cnpjId || undefined, paymentProfileId: form.paymentProfileId || undefined }
        : { ...basePayload, email: form.email || undefined, cnpj: form.cnpj || undefined }
    const res = await fetch('/api/producao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = res.ok ? await res.json() : null
    if (res.ok) {
      if (cnpjPdfFile && data?.id) {
        const fd = new FormData()
        fd.append('file', cnpjPdfFile)
        await fetch(`/api/producao/${data.id}/cnpj-pdf`, { method: 'POST', body: fd })
        setCnpjPdfFile(null)
      }
      setForm({
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
      })
      setShowForm(false)
      load()
      if (mode === 'estoque') loadStock()
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao registrar')
    }
    setSubmitting(false)
  }

  async function handleApprove(id: string) {
    const res = await fetch(`/api/producao/${id}/aprovar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    })
    if (res.ok) load()
    else { const e = await res.json(); alert(e.error || 'Erro') }
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

  async function handleEdit(account: Account) {
    setEditingId(account.id)
    const isPredefined = ACCOUNT_TYPES.some((t) => t.value === account.type && t.value !== '__OUTRO__')
    setEditForm({
      platform: account.platform,
      type: isPredefined ? account.type : '__OUTRO__',
      typeCustom: isPredefined ? '' : account.type,
    })
  }

  async function handleSaveEdit() {
    if (!editingId) return
    const typeVal = editForm.type === '__OUTRO__' ? editForm.typeCustom : editForm.type
    if (!typeVal.trim()) {
      alert('Informe o tipo')
      return
    }
    const res = await fetch(`/api/producao/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: editForm.platform,
        type: typeVal.trim(),
      }),
    })
    if (res.ok) {
      setEditingId(null)
      load()
    } else {
      const e = await res.json()
      alert(e.error || 'Erro ao salvar')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta conta da produção? Esta ação não pode ser desfeita.')) return
    const res = await fetch(`/api/producao/${id}`, { method: 'DELETE' })
    if (res.ok) load()
    else {
      const e = await res.json()
      alert(e.error || 'Erro ao excluir')
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="heading-1">Produção de Contas</h1>
        <div className="flex gap-2">
          <Link href="/dashboard/producao-g2" className="btn-secondary text-sm">
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {loading ? (
          <SkeletonCards count={3} />
        ) : (
          <>
            <div className="card transition-all duration-200 hover:shadow-ads-md">
              <p className="text-sm text-gray-500">Produção Diária (Total)</p>
              <p className="text-2xl font-bold text-primary-600">{kpis.daily}</p>
              {(kpis.dailyProd !== undefined || kpis.dailyG2 !== undefined) && (
                <p className="text-xs text-slate-500 mt-1">
                  Contas: {kpis.dailyProd ?? kpis.daily} · G2: {kpis.dailyG2 ?? 0}
                </p>
              )}
            </div>
            <div className="card transition-all duration-200 hover:shadow-ads-md">
              <p className="text-sm text-gray-500">Produção Mensal (Total)</p>
              <p className="text-2xl font-bold text-primary-600">{kpis.monthly}</p>
              {(kpis.monthlyProd !== undefined || kpis.monthlyG2 !== undefined) && (
                <p className="text-xs text-slate-500 mt-1">
                  Contas: {kpis.monthlyProd ?? kpis.monthly} · G2: {kpis.monthlyG2 ?? 0}
                </p>
              )}
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
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          <h2 className="font-semibold">Tabela de Produção</h2>
          <div className="flex gap-2 items-center">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input-field py-1.5 px-2 w-40 text-sm"
            >
              <option value="">Todos status</option>
              <option value="PENDING">Pendente</option>
              <option value="APPROVED">Aprovado</option>
              <option value="REJECTED">Rejeitado</option>
            </select>
            <button onClick={() => setShowForm(!showForm)} className="btn-primary">
              {showForm ? 'Cancelar' : 'Registrar Produção'}
            </button>
          </div>
        </div>

        {showForm && (
          <div className="production-form-area mb-6 p-4 bg-gray-50 dark:bg-ads-dark-card/80 rounded-lg border border-primary-600/5 dark:border-white/10 space-y-4">
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

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

                <div>
                  <label className="block text-sm font-medium mb-1">ID da Conta (opcional)</label>
                  <input
                    type="text"
                    value={form.googleAdsCustomerId}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        googleAdsCustomerId: formatAccountId(e.target.value),
                      }))
                    }
                    className="input-field font-mono"
                    placeholder="000-000-0000"
                    maxLength={12}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Moeda</label>
                  <select
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                    className="input-field"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
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
              <div className="flex gap-2">
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

        <div className="overflow-x-auto">
          {loading ? (
            <SkeletonTable rows={6} />
          ) : accounts.length === 0 ? (
            <p className="text-gray-400 py-4">Nenhum registro ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">ID</th>
                  <th className="pb-2 pr-4">Plataforma</th>
                  <th className="pb-2 pr-4">Tipo</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Produtor</th>
                  <th className="pb-2 pr-4">Checklist</th>
                  <th className="pb-2 pr-4">Data</th>
                  <th className="pb-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100 dark:border-white/5 last:border-0">
                    <td className="py-3 pr-4 font-mono text-xs">{a.id.slice(0, 8)}</td>
                    <td className="py-3 pr-4">
                      {editingId === a.id ? (
                        <select
                          value={editForm.platform}
                          onChange={(e) => setEditForm((f) => ({ ...f, platform: e.target.value }))}
                          className="input-field py-1 px-2 text-sm"
                        >
                          {PLATFORMS.map((p) => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </select>
                      ) : (
                        PLATFORMS.find((p) => p.value === a.platform)?.label || a.platform
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {editingId === a.id ? (
                        <div>
                          <select
                            value={editForm.type}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                type: e.target.value,
                                typeCustom: e.target.value === '__OUTRO__' ? f.typeCustom : '',
                              }))
                            }
                            className="input-field py-1 px-2 text-sm"
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
                              className="input-field py-1 px-2 text-sm mt-1"
                              placeholder="Ex: Ads USD"
                            />
                          )}
                        </div>
                      ) : (
                        <span
                          className="px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor: `${getTypeColor(a.type)}20`,
                            color: getTypeColor(a.type),
                          }}
                        >
                          {a.type}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          a.status === 'PENDING'
                            ? 'bg-amber-100 text-amber-800'
                            : a.status === 'APPROVED'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {a.status === 'PENDING' ? 'Pendente' : a.status === 'APPROVED' ? 'Aprovado' : 'Rejeitado'}
                      </span>
                      {a.status === 'REJECTED' && a.rejectionReason && (
                        <span className="block text-xs text-red-600 mt-1" title={a.rejectionReason}>
                          Motivo: {a.rejectionReason.slice(0, 40)}
                          {a.rejectionReason.length > 40 ? '...' : ''}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">{a.producer.name || '—'}</td>
                    <td className="py-3 pr-4">
                      {a.status === 'PENDING' && (
                        <ProductionChecklist
                          accountId={a.id}
                          isProducer={isProducer && a.producerId === session?.user?.id}
                          compact
                        />
                      )}
                    </td>
                    <td className="py-3 pr-4 text-gray-500">{new Date(a.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className="py-3">
                      {editingId === a.id ? (
                        <>
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            className="text-green-600 hover:underline text-xs mr-2"
                          >
                            Salvar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="text-gray-500 hover:underline text-xs"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          {a.status === 'PENDING' && (canApprove || (isProducer && a.producerId === session?.user?.id)) && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleEdit(a)}
                                className="text-primary-500 hover:underline text-xs mr-2"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(a.id)}
                                className="text-red-600 hover:underline text-xs mr-2"
                              >
                                Excluir
                              </button>
                            </>
                          )}
                          {canApprove && a.status === 'PENDING' && (
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
                            </>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
