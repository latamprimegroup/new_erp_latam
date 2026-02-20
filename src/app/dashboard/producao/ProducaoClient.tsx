'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { SkeletonCards, SkeletonTable } from '@/components/Skeleton'
import { ProductionChecklist } from '@/components/producao/ProductionChecklist'

const PLATFORMS = [
  { value: 'GOOGLE_ADS', label: 'Google Ads' },
  { value: 'META_ADS', label: 'Meta Ads' },
  { value: 'KWAI_ADS', label: 'Kwai Ads' },
  { value: 'TIKTOK_ADS', label: 'TikTok Ads' },
  { value: 'OTHER', label: 'Outro' },
]

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
    email: '',
    cnpj: '',
    emailId: '',
    cnpjId: '',
    paymentProfileId: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [metaMensal] = useState(330)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectCode, setRejectCode] = useState('')

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const payload =
      mode === 'estoque' && (form.emailId || form.cnpjId || form.paymentProfileId)
        ? {
            platform: form.platform,
            type: form.type,
            emailId: form.emailId || undefined,
            cnpjId: form.cnpjId || undefined,
            paymentProfileId: form.paymentProfileId || undefined,
          }
        : {
            platform: form.platform,
            type: form.type,
            email: form.email || undefined,
            cnpj: form.cnpj || undefined,
          }
    const res = await fetch('/api/producao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      setForm({
        platform: 'GOOGLE_ADS',
        type: '',
        email: '',
        cnpj: '',
        emailId: '',
        cnpjId: '',
        paymentProfileId: '',
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
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-primary-600/5 space-y-4">
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
                <h3 className="font-medium text-[#1F2937] mb-3">Estoque de base (e-mails, CNPJs, perfis)</h3>
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
                  <input
                    type="text"
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                    className="input-field"
                    placeholder="Ex: Ads USD"
                    required
                  />
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
                  {canApprove && <th className="pb-2">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4 font-mono text-xs">{a.id.slice(0, 8)}</td>
                    <td className="py-3 pr-4">{PLATFORMS.find((p) => p.value === a.platform)?.label || a.platform}</td>
                    <td className="py-3 pr-4">{a.type}</td>
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
                    {canApprove && (
                      <td className="py-3">
                        {a.status === 'PENDING' && (
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
                      </td>
                    )}
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
