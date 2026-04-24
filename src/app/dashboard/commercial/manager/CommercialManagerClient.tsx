'use client'

import { useEffect, useMemo, useState } from 'react'

type OverviewSeller = {
  sellerId: string
  sellerName: string
  totalBrl: number
  progressPct: number
  goalBrl: number
  unlocked: boolean
  remainingBrl: number
}

type OverviewPayload = {
  monthStart: string
  config: {
    sellerGoalBrl: number
    sellerCommissionPct: number
    managerOverridePct: number
    maxDiscountPct: number
  }
  team: {
    sellersCount: number
    totalRevenueBrl: number
    cpaMedioBrl: number | null
    overrideValueBrl: number
    performers: OverviewSeller[]
  }
}

type AuditRow = {
  source: 'ORDER' | 'QUICK_SALE'
  saleId: string
  paidAt: string | null
  sellerId: string | null
  sellerName: string
  product: string
  valueBrl: number
  supplierCostBrl: number
  netProfitBrl: number
  paymentMethod: string
  auditedAt: string | null
}

type PaydayPayload = {
  month: number
  year: number
  teamGrossBrl: number
  managerOverridePct: number
  managerOverrideBrl: number
  sellers: Array<{
    sellerId: string
    sellerName: string
    totalVendidoBrl: number
    metaBatida: boolean
    comissaoPagarBrl: number
    pedidos: number
  }>
  sellerGoalBrl: number
  sellerCommissionPct: number
}

type LeadOption = {
  id: string
  name: string | null
  email: string | null
  whatsapp: string | null
  funnelStep: string
  createdAt: string
  assignedCommercialId: string | null
}

type SellerOption = { id: string; name: string; email: string }
type SellersPayload = { sellers: SellerOption[] }
type LeadsResponse = { leads: LeadOption[] }

function currency(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  if (!text.trim()) throw new Error(`HTTP ${res.status} sem conteúdo`)
  const data = JSON.parse(text) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data as T
}

export function CommercialManagerClient() {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [overview, setOverview] = useState<OverviewPayload | null>(null)
  const [auditRows, setAuditRows] = useState<AuditRow[]>([])
  const [payday, setPayday] = useState<PaydayPayload | null>(null)
  const [leads, setLeads] = useState<LeadOption[]>([])
  const [sellers, setSellers] = useState<SellerOption[]>([])

  const [sellerFilter, setSellerFilter] = useState<string>('all')
  const [auditingId, setAuditingId] = useState<string | null>(null)

  const [leadId, setLeadId] = useState<string>('')
  const [targetSellerId, setTargetSellerId] = useState<string>('')
  const [assigningLead, setAssigningLead] = useState(false)
  const [assignMsg, setAssignMsg] = useState<string | null>(null)

  const [assetId, setAssetId] = useState<string>('')
  const [markupPct, setMarkupPct] = useState<number>(50)
  const [floorMarginPct, setFloorMarginPct] = useState<number>(40)
  const [discountCapPct, setDiscountCapPct] = useState<number>(15)
  const [pricingSaving, setPricingSaving] = useState(false)
  const [pricingMsg, setPricingMsg] = useState<string | null>(null)
  const [discountSaving, setDiscountSaving] = useState(false)
  const [discountMsg, setDiscountMsg] = useState<string | null>(null)

  async function loadAll() {
    setLoading(true)
    setErr(null)
    try {
      const [ov, au, pd, leadsRes, sellersRes] = await Promise.all([
        fetch('/api/commercial/manager/overview').then(safeJson<OverviewPayload>),
        fetch(`/api/commercial/manager/auditoria-vendas${sellerFilter !== 'all' ? `?sellerId=${encodeURIComponent(sellerFilter)}` : ''}`)
          .then(safeJson<{ rows: AuditRow[] }>),
        fetch('/api/commercial/manager/comissoes-payday').then(safeJson<PaydayPayload>),
        fetch('/api/commercial/leads').then(safeJson<LeadsResponse>),
        fetch('/api/commercial/manager/leads/distribuir').then(safeJson<SellersPayload>),
      ])

      setOverview(ov)
      setAuditRows(au.rows || [])
      setPayday(pd)
      setLeads(leadsRes.leads || [])
      setSellers(sellersRes.sellers || [])
      setDiscountCapPct(ov.config.maxDiscountPct)
      if (!targetSellerId && sellersRes.sellers?.[0]) setTargetSellerId(sellersRes.sellers[0].id)
      if (!leadId && leadsRes.leads?.[0]) setLeadId(leadsRes.leads[0].id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao carregar dashboard do gerente')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerFilter])

  const pendingLeads = useMemo(
    () => leads.filter((l) => !l.assignedCommercialId && l.funnelStep !== 'STEP_7_CONVERSAO').slice(0, 30),
    [leads],
  )

  async function auditSale(source: 'ORDER' | 'QUICK_SALE', saleId: string) {
    setAuditingId(saleId)
    try {
      await fetch('/api/commercial/manager/auditoria-vendas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, saleId }),
      }).then(safeJson<{ ok: boolean }>)
      await loadAll()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Falha ao auditar venda')
    } finally {
      setAuditingId(null)
    }
  }

  async function assignLead() {
    if (!leadId || !targetSellerId) return
    setAssigningLead(true)
    setAssignMsg(null)
    try {
      await fetch('/api/commercial/manager/leads/distribuir', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, sellerId: targetSellerId }),
      }).then(safeJson<{ id: string }>)
      setAssignMsg('Lead distribuído com sucesso.')
      await loadAll()
    } catch (e) {
      setAssignMsg(e instanceof Error ? e.message : 'Falha ao distribuir lead')
    } finally {
      setAssigningLead(false)
    }
  }

  async function applyMarkup() {
    if (!assetId.trim()) {
      setPricingMsg('Informe o ID interno do ativo para aplicar markup.')
      return
    }
    setPricingSaving(true)
    setPricingMsg(null)
    try {
      const res = await fetch('/api/commercial/manager/markup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: assetId.trim(),
          markupPct,
          minMarginPct: floorMarginPct,
        }),
      }).then(safeJson<{ ok: boolean; asset: { adsId: string } }>)
      setPricingMsg(`Markup aplicado ao ativo ${res.asset.adsId}.`)
    } catch (e) {
      setPricingMsg(e instanceof Error ? e.message : 'Falha ao aplicar markup')
    } finally {
      setPricingSaving(false)
    }
  }

  async function saveDiscountCap() {
    setDiscountSaving(true)
    setDiscountMsg(null)
    try {
      await fetch('/api/commercial/manager/descontos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxDiscountPct: Math.max(0, Math.min(90, discountCapPct)) }),
      }).then(safeJson<{ ok: true; maxDiscountPct: number }>)
      setDiscountMsg('Teto de desconto autorizado atualizado.')
      await loadAll()
    } catch (e) {
      setDiscountMsg(e instanceof Error ? e.message : 'Falha ao salvar teto de desconto')
    } finally {
      setDiscountSaving(false)
    }
  }

  if (loading && !overview) {
    return <p className="text-gray-500">Carregando visão gerencial...</p>
  }

  if (err) {
    return (
      <p className="text-red-600">
        {err}{' '}
        <button className="underline" type="button" onClick={() => void loadAll()}>
          Recarregar
        </button>
      </p>
    )
  }

  if (!overview || !payday) return <p className="text-gray-500">Sem dados.</p>

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="font-semibold mb-3">Performance da equipe</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <p className="text-xs text-gray-500">Faturamento do time</p>
            <p className="text-xl font-bold">{currency(overview.team.totalRevenueBrl)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <p className="text-xs text-gray-500">Override gerente ({overview.config.managerOverridePct}%)</p>
            <p className="text-xl font-bold">{currency(overview.team.overrideValueBrl)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <p className="text-xs text-gray-500">CPA médio da equipe</p>
            <p className="text-xl font-bold">
              {overview.team.cpaMedioBrl != null ? currency(overview.team.cpaMedioBrl) : 'Sem dados'}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <p className="text-xs text-gray-500">Meta individual base</p>
            <p className="text-xl font-bold">{currency(overview.config.sellerGoalBrl)}</p>
          </div>
        </div>

        <div className="space-y-2">
          {overview.team.performers.map((s) => (
            <div key={s.sellerId} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <div className="flex justify-between gap-3 text-sm">
                <span className="font-medium">{s.sellerName}</span>
                <span>
                  {currency(s.totalBrl)} / {currency(s.goalBrl)}
                </span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-primary-500 rounded-full" style={{ width: `${Math.min(100, s.progressPct)}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {s.progressPct}% · {s.unlocked ? 'meta liberada' : `faltam ${currency(s.remainingBrl)}`} · CPA médio{' '}
                {overview.team.cpaMedioBrl != null ? currency(overview.team.cpaMedioBrl) : 'n/d'}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold">Painel de auditoria de vendas</h2>
          <select
            className="input-field text-sm w-[220px]"
            value={sellerFilter}
            onChange={(e) => setSellerFilter(e.target.value)}
          >
            <option value="all">Todos os vendedores</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[920px]">
            <thead>
              <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                <th className="pb-2">Pedido</th>
                <th className="pb-2">Origem</th>
                <th className="pb-2">Vendedor</th>
                <th className="pb-2">Produto</th>
                <th className="pb-2">Valor</th>
                <th className="pb-2">Auditoria</th>
                <th className="pb-2 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map((r) => (
                <tr key={`${r.source}-${r.saleId}`} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 font-mono text-xs">{r.saleId.slice(0, 8)}</td>
                  <td className="py-2">
                    {r.source}
                    <div className="text-xs text-gray-500">{r.paymentMethod}</div>
                  </td>
                  <td className="py-2">{r.sellerName}</td>
                  <td className="py-2">{r.product}</td>
                  <td className="py-2 font-medium">{currency(r.valueBrl)}</td>
                  <td className="py-2 text-xs">
                    {r.auditedAt ? `Auditado em ${new Date(r.auditedAt).toLocaleString('pt-BR')}` : 'Pendente'}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      className="btn-secondary text-xs"
                      disabled={Boolean(r.auditedAt) || auditingId === r.saleId}
                      onClick={() => void auditSale(r.source, r.saleId)}
                    >
                      {r.auditedAt ? 'Auditado' : auditingId === r.saleId ? 'Auditando...' : 'Auditar venda'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card space-y-3">
          <h2 className="font-semibold">Distribuição manual de leads</h2>
          <p className="text-xs text-gray-500">
            Use para direcionar clientes “baleia” para o vendedor com melhor desempenho.
          </p>
          <select className="input-field text-sm" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
            <option value="">Selecione um lead pendente</option>
            {pendingLeads.map((l) => (
              <option key={l.id} value={l.id}>
                {(l.name || l.email || l.whatsapp || 'Lead')} · {new Date(l.createdAt).toLocaleDateString('pt-BR')}
              </option>
            ))}
          </select>
          <select className="input-field text-sm" value={targetSellerId} onChange={(e) => setTargetSellerId(e.target.value)}>
            <option value="">Selecione o vendedor</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="btn-primary text-sm" disabled={assigningLead || !leadId || !targetSellerId} onClick={() => void assignLead()}>
            {assigningLead ? 'Distribuindo...' : 'Distribuir lead'}
          </button>
          {assignMsg ? <p className="text-xs text-gray-500">{assignMsg}</p> : null}
        </div>

        <div className="card space-y-4">
          <div className="space-y-3">
            <h2 className="font-semibold">Controle de Markup</h2>
            <p className="text-xs text-gray-500">
              Ajuste por ativo para manter governança de margem e piso mínimo liberado ao time.
            </p>
            <input
              className="input-field text-sm"
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              placeholder="ID interno do ativo (assetId)"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">
                Markup %
                <input
                  type="number"
                  className="input-field text-sm mt-1"
                  min={0}
                  max={300}
                  value={markupPct}
                  onChange={(e) => setMarkupPct(Number.parseFloat(e.target.value) || 0)}
                />
              </label>
              <label className="text-xs">
                Floor (margem mínima %)
                <input
                  type="number"
                  className="input-field text-sm mt-1"
                  min={0}
                  max={300}
                  value={floorMarginPct}
                  onChange={(e) => setFloorMarginPct(Number.parseFloat(e.target.value) || 0)}
                />
              </label>
            </div>
            <button className="btn-primary text-sm" disabled={pricingSaving} onClick={() => void applyMarkup()}>
              {pricingSaving ? 'Aplicando...' : 'Aplicar markup no ativo'}
            </button>
            {pricingMsg ? <p className="text-xs text-gray-500">{pricingMsg}</p> : null}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800 pt-3 space-y-2">
            <h3 className="font-semibold text-sm">Controle de desconto autorizado</h3>
            <p className="text-xs text-gray-500">
              Teto atual: {overview.config.maxDiscountPct}% (usado para validar criação de cupom no comercial).
            </p>
            <label className="text-xs block">
              Novo teto de desconto %
              <input
                type="number"
                className="input-field text-sm mt-1"
                min={0}
                max={90}
                value={discountCapPct}
                onChange={(e) => setDiscountCapPct(Number.parseFloat(e.target.value) || 0)}
              />
            </label>
            <button className="btn-secondary text-sm" disabled={discountSaving} onClick={() => void saveDiscountCap()}>
              {discountSaving ? 'Salvando...' : 'Salvar teto de desconto'}
            </button>
            {discountMsg ? <p className="text-xs text-gray-500">{discountMsg}</p> : null}
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-3">Relatório de Comissionamento (Payday)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <p className="text-xs text-gray-500">Total equipe</p>
            <p className="text-xl font-bold">{currency(payday.teamGrossBrl)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <p className="text-xs text-gray-500">Override gerente</p>
            <p className="text-xl font-bold">
              {payday.managerOverridePct}% · {currency(payday.managerOverrideBrl)}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <p className="text-xs text-gray-500">Período</p>
            <p className="text-xl font-bold">{`${String(payday.month).padStart(2, '0')}/${payday.year}`}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                <th className="pb-2">Vendedor</th>
                <th className="pb-2">Total vendido</th>
                <th className="pb-2">Meta</th>
                <th className="pb-2">Meta batida</th>
                <th className="pb-2">Comissão a pagar</th>
              </tr>
            </thead>
            <tbody>
              {payday.sellers.map((r) => (
                <tr key={r.sellerId} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2">{r.sellerName}</td>
                  <td className="py-2">{currency(r.totalVendidoBrl)}</td>
                  <td className="py-2">{currency(payday.sellerGoalBrl)}</td>
                  <td className="py-2">{r.metaBatida ? 'Sim' : 'Não'}</td>
                  <td className="py-2 font-semibold">{currency(r.comissaoPagarBrl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
