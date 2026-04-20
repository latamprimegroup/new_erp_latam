'use client'

import { useCallback, useEffect, useState } from 'react'

type Intelligence = {
  contributionMargin: {
    receitaBruta: number
    revenue: number
    receitaLiquidaAposGateway: number
    gatewayFees: number
    cogs: number
    payoutProvision: number
    contributionMargin: number
    marginPct: number
  }
  breakEven: {
    fixedCostsMonthly: number
    grossAccumulated: number
    inNetProfitZone: boolean
    gapToBreakEven: number
  }
  liquiditySnapshot: {
    accountsReceivable: { count: number; value: number }
    pendingWithdrawals: number
    payablesTomorrow?: {
      expensesScheduled: number
      withdrawalsDue: number
      total: number
      expenseCount: number
      withdrawalCount: number
    }
  }
  supplyRenewalAlerts: { id: string; label: string; category: string; expiresAt: string; unitsRemaining: number }[]
}

type CashRow = {
  date: string
  cashNet: number
  receivable: number
  payablesEstimate: number
  payablesTomorrow?: number
}

type DreDemonstrativo = {
  faturamentoBruto: number
  impostosETaxasCartao: number
  detalheImpostos: number
  detalheTaxasGateway: number
  custosProducaoInsumosPayouts: number
  detalheCmv: number
  detalhePayouts: number
  lucroBruto: number
  despesasOperacionais: number
  lucroLiquidoReal: number
}

export function VaultIntelligenceTab({ month, year }: { month: string; year: string }) {
  const [intel, setIntel] = useState<Intelligence | null>(null)
  const [cash, setCash] = useState<{ days: number; series: CashRow[] } | null>(null)
  const [dre, setDre] = useState<DreDemonstrativo | null>(null)
  const [garantia, setGarantia] = useState<{
    repositionUnits: number
    estimatedCost: number
    revenue: number
    pctOfRevenue: number
    alertLowQuality: boolean
  } | null>(null)
  const [ledger, setLedger] = useState<{ id: string; occurredAt: string; memo: string | null; source: string; lines: { account: string; debit: string; credit: string }[] }[]>([])
  const [chargebacks, setChargebacks] = useState<{ id: string; orderId: string; amount: string; status: string; createdAt: string }[]>([])
  const [supplyLots, setSupplyLots] = useState<{ id: string; label: string; category: string; unitsRemaining: number; expiresAt: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [cbOrder, setCbOrder] = useState('')
  const [cbAmount, setCbAmount] = useState('')
  const [cbNotes, setCbNotes] = useState('')
  const [depClient, setDepClient] = useState('')
  const [depAmount, setDepAmount] = useState('')
  const [supLabel, setSupLabel] = useState('')
  const [supCat, setSupCat] = useState('PROXY_RESIDENTIAL')
  const [supCost, setSupCost] = useState('')
  const [supUnits, setSupUnits] = useState('')
  const [supExp, setSupExp] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setErr(null)
    const q = `month=${month}&year=${year}`
    Promise.all([
      fetch(`/api/financeiro/vault/intelligence?${q}`).then((r) => r.json()),
      fetch('/api/financeiro/vault/cash-flow?days=14').then((r) => r.json()),
      fetch(`/api/financeiro/vault/dre-vault?${q}`).then((r) => r.json()),
      fetch(`/api/financeiro/vault/garantia-audit?${q}`).then((r) => r.json()),
      fetch('/api/financeiro/vault/ledger?take=25').then((r) => r.json()),
      fetch('/api/financeiro/vault/chargebacks').then((r) => r.json()),
      fetch('/api/financeiro/vault/supply-lots').then((r) => r.json()),
    ])
      .then(([i, c, d, g, l, ch, s]) => {
        if (i.error) throw new Error(i.error)
        setIntel(i)
        if (!c.error) setCash(c)
        if (!d.error) setDre(d.demonstrativo ?? null)
        if (!g.error) setGarantia(g)
        if (!l.error) setLedger(l.journals || [])
        if (!ch.error) setChargebacks(ch.chargebacks || [])
        if (!s.error) setSupplyLots(s.lots || [])
      })
      .catch((e) => setErr(e.message || 'Erro ao carregar Vault'))
      .finally(() => setLoading(false))
  }, [month, year])

  useEffect(() => {
    load()
  }, [load])

  async function submitChargeback(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(cbAmount.replace(',', '.'))
    if (!cbOrder.trim() || !Number.isFinite(amount) || amount <= 0) {
      alert('Pedido e valor válidos são obrigatórios')
      return
    }
    const res = await fetch('/api/financeiro/vault/chargebacks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: cbOrder.trim(), amount, notes: cbNotes || undefined }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert((d as { error?: string }).error || 'Erro')
      return
    }
    setCbOrder('')
    setCbAmount('')
    setCbNotes('')
    load()
  }

  async function submitDeposit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(depAmount.replace(',', '.'))
    if (!depClient.trim() || !Number.isFinite(amount) || amount <= 0) return
    const res = await fetch('/api/financeiro/vault/wallet/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: depClient.trim(), amount }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert((d as { error?: string }).error || 'Erro')
      return
    }
    setDepClient('')
    setDepAmount('')
    alert(`Saldo após depósito: R$ ${Number(d.balanceAfter).toLocaleString('pt-BR')}`)
    load()
  }

  async function submitSupply(e: React.FormEvent) {
    e.preventDefault()
    const totalCost = parseFloat(supCost.replace(',', '.'))
    const units = parseInt(supUnits, 10)
    if (!supLabel.trim() || !Number.isFinite(totalCost) || !units || units < 1) return
    const res = await fetch('/api/financeiro/vault/supply-lots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: supLabel.trim(),
        category: supCat,
        totalCost,
        unitsPurchased: units,
        expiresAt: supExp.trim() ? new Date(supExp).toISOString() : null,
      }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert((d as { error?: string }).error || 'Erro')
      return
    }
    setSupLabel('')
    setSupCost('')
    setSupUnits('')
    setSupExp('')
    load()
  }

  if (loading && !intel) {
    return <p className="text-gray-500 py-6">Carregando Vault Intelligence...</p>
  }
  if (err) {
    return (
      <p className="text-red-600 py-4">
        {err}{' '}
        <button type="button" className="underline" onClick={load}>
          Tentar novamente
        </button>
      </p>
    )
  }

  const m = intel?.contributionMargin

  return (
    <div className="space-y-8">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Visão executiva: margem de contribuição real (centavos via Decimal no servidor), break-even, liquidez e DRE
        enriquecido. Apenas ADMIN e FINANCE.
      </p>

      {m && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card border-l-4 border-l-sky-600">
            <h3 className="text-xs font-semibold text-gray-500 uppercase">Receita bruta vs líquida</h3>
            <p className="text-lg font-bold mt-1">
              Bruta: R$ {(m.receitaBruta ?? m.revenue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-lg font-semibold text-sky-800 dark:text-sky-200 mt-1">
              Líquida (pós-gateway): R${' '}
              {(m.receitaLiquidaAposGateway ?? m.revenue - m.gatewayFees).toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
              })}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Taxas Pix/cartão estimadas: R$ {m.gatewayFees.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="card border-l-4 border-l-emerald-600">
            <h3 className="text-xs font-semibold text-gray-500 uppercase">Margem de contribuição real</h3>
            <p className="text-2xl font-bold mt-1">
              R$ {m.contributionMargin.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Após gateway: CMV por conta + provisão payout (produção/G2 + elite)
            </p>
            <p className="text-sm mt-2">{m.marginPct}% sobre receita líquida pós-gateway</p>
          </div>
          <div className="card">
            <h3 className="text-xs font-semibold text-gray-500 uppercase">Custos diretos do mês</h3>
            <ul className="text-sm mt-2 space-y-1">
              <li>CMV (insumos / purchasePrice): R$ {m.cogs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>
              <li>Payout estimado: R$ {m.payoutProvision.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>
            </ul>
          </div>
          {intel?.breakEven && (
            <div
              className={`card border-l-4 ${
                intel.breakEven.inNetProfitZone ? 'border-l-green-500' : 'border-l-amber-500'
              }`}
            >
              <h3 className="text-xs font-semibold text-gray-500 uppercase">Break-even (mês)</h3>
              <p className="text-lg font-bold mt-1">
                {intel.breakEven.inNetProfitZone ? 'Acima dos custos fixos' : 'Ainda abaixo do fixo'}
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Fixo cadastrado: R${' '}
                {intel.breakEven.fixedCostsMonthly.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-sm">
                Lucro bruto acum. (após var.): R${' '}
                {intel.breakEven.grossAccumulated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              {!intel.breakEven.inNetProfitZone && (
                <p className="text-xs text-amber-800 mt-2">
                  Falta R$ {intel.breakEven.gapToBreakEven.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} para
                  cobrir o fixo.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {intel?.liquiditySnapshot && (
        <div className="card">
          <h3 className="font-semibold mb-2">Previsibilidade de caixa</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Saldo a receber (pedidos)</p>
              <p className="text-lg font-bold">
                R$ {intel.liquiditySnapshot.accountsReceivable.value.toLocaleString('pt-BR')}
              </p>
              <p className="text-xs text-gray-500">{intel.liquiditySnapshot.accountsReceivable.count} pedidos</p>
            </div>
            <div>
              <p className="text-gray-500">Contas a pagar (saques pendentes)</p>
              <p className="text-lg font-bold text-red-700">
                R$ {intel.liquiditySnapshot.pendingWithdrawals.toLocaleString('pt-BR')}
              </p>
            </div>
            {intel.liquiditySnapshot.payablesTomorrow && (
              <div className="sm:col-span-2 lg:col-span-2 rounded-lg border border-amber-200 dark:border-amber-800 p-3 bg-amber-50/50 dark:bg-amber-950/20">
                <p className="text-gray-600 dark:text-gray-300 font-medium">A pagar amanhã (agendado)</p>
                <p className="text-xl font-bold text-amber-900 dark:text-amber-100">
                  R$ {intel.liquiditySnapshot.payablesTomorrow.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Despesas com data amanhã: R${' '}
                  {intel.liquiditySnapshot.payablesTomorrow.expensesScheduled.toLocaleString('pt-BR')} (
                  {intel.liquiditySnapshot.payablesTomorrow.expenseCount} lanç.) · Saques com vencimento amanhã: R${' '}
                  {intel.liquiditySnapshot.payablesTomorrow.withdrawalsDue.toLocaleString('pt-BR')} (
                  {intel.liquiditySnapshot.payablesTomorrow.withdrawalCount})
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {cash?.series && (
        <div className="card overflow-x-auto">
          <h3 className="font-semibold mb-2">Fluxo de caixa registrado (últimos {cash.days} dias)</h3>
          <p className="text-xs text-gray-500 mb-3">
            Na linha de hoje: saldo a receber, saques pendentes e total a pagar amanhã (lançamentos + saques com
            vencimento).
          </p>
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">Dia</th>
                <th className="pb-2">Caixa líquido</th>
                <th className="pb-2">A receber</th>
                <th className="pb-2">A pagar (saques)</th>
                <th className="pb-2">A pagar amanhã</th>
              </tr>
            </thead>
            <tbody>
              {cash.series.map((row) => (
                <tr key={row.date} className="border-b border-gray-100">
                  <td className="py-2">{row.date}</td>
                  <td className="py-2">R$ {row.cashNet.toLocaleString('pt-BR')}</td>
                  <td className="py-2">R$ {row.receivable.toLocaleString('pt-BR')}</td>
                  <td className="py-2">R$ {row.payablesEstimate.toLocaleString('pt-BR')}</td>
                  <td className="py-2">
                    {row.payablesTomorrow != null
                      ? `R$ ${row.payablesTomorrow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dre && (
        <div className="card">
          <h3 className="font-semibold mb-3">DRE automatizada (mês)</h3>
          <table className="w-full text-sm max-w-xl">
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4">(+) Faturamento bruto</td>
                <td className="py-2 text-right font-medium">
                  R$ {dre.faturamentoBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4 pl-3 text-gray-600">
                  (−) Impostos e taxas (imposto est. + gateway)
                </td>
                <td className="py-2 text-right text-red-700">
                  R$ {dre.impostosETaxasCartao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
              </tr>
              <tr className="text-xs text-gray-500">
                <td className="py-1 pl-6" colSpan={2}>
                  Detalhe: impostos R$ {dre.detalheImpostos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ·
                  gateway R$ {dre.detalheTaxasGateway.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4 pl-3 text-gray-600">(−) Custos de produção (CMV + payouts)</td>
                <td className="py-2 text-right text-red-700">
                  R$ {dre.custosProducaoInsumosPayouts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
              </tr>
              <tr className="text-xs text-gray-500">
                <td className="py-1 pl-6" colSpan={2}>
                  CMV R$ {dre.detalheCmv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · payouts R${' '}
                  {dre.detalhePayouts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
              </tr>
              <tr className="border-b-2 border-gray-300 font-semibold">
                <td className="py-2 pr-4">(=) Lucro bruto</td>
                <td className="py-2 text-right">
                  R$ {dre.lucroBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4 pl-3 text-gray-600">(−) Despesas operacionais</td>
                <td className="py-2 text-right text-red-700">
                  R$ {dre.despesasOperacionais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
              </tr>
              <tr className="font-bold text-lg">
                <td className="py-3 pr-4">(=) Lucro líquido real</td>
                <td className="py-3 text-right text-primary-600">
                  R$ {dre.lucroLiquidoReal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {garantia && (
        <div
          className={`card ${garantia.alertLowQuality ? 'border-2 border-red-400' : ''}`}
        >
          <h3 className="font-semibold mb-2">Auditoria de garantia (reposições)</h3>
          <p className="text-sm">
            Reposições concluídas: {garantia.repositionUnits} · Custo estimado: R${' '}
            {garantia.estimatedCost.toLocaleString('pt-BR')} ({garantia.pctOfRevenue}% da receita do mês)
          </p>
          {garantia.alertLowQuality && (
            <p className="text-sm text-red-700 mt-2 font-medium">
              Alerta: custo de garantia acima do limite configurado (vault_garantia_alert_pct). Revisar qualidade
              técnica.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold mb-3">Chargeback — anti-fraude</h3>
          <form onSubmit={submitChargeback} className="space-y-2 text-sm">
            <input
              className="input-field font-mono text-sm"
              placeholder="ID do pedido (cuid)"
              value={cbOrder}
              onChange={(e) => setCbOrder(e.target.value)}
            />
            <input
              className="input-field text-sm"
              placeholder="Valor (R$)"
              value={cbAmount}
              onChange={(e) => setCbAmount(e.target.value)}
            />
            <input
              className="input-field text-sm"
              placeholder="Notas"
              value={cbNotes}
              onChange={(e) => setCbNotes(e.target.value)}
            />
            <button type="submit" className="btn-primary text-sm">
              Registrar e marcar ativos
            </button>
          </form>
          <p className="text-xs text-gray-500 mt-2">
            Contas do pedido passam a CRITICAL + compromised (CHARGEBACK). Lançamento em razão automático.
          </p>
          <ul className="mt-4 text-xs space-y-1 max-h-32 overflow-y-auto">
            {chargebacks.map((c) => (
              <li key={c.id}>
                {new Date(c.createdAt).toLocaleDateString('pt-BR')} — pedido {c.orderId.slice(-8)} — R${' '}
                {c.amount} — {c.status}
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-3">Wallet cliente (depósito baleia)</h3>
          <form onSubmit={submitDeposit} className="space-y-2 text-sm">
            <input
              className="input-field font-mono text-sm"
              placeholder="clientProfile id"
              value={depClient}
              onChange={(e) => setDepClient(e.target.value)}
            />
            <input
              className="input-field text-sm"
              placeholder="Valor (R$)"
              value={depAmount}
              onChange={(e) => setDepAmount(e.target.value)}
            />
            <button type="submit" className="btn-primary text-sm">
              Registrar depósito
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">Lotes de insumos (CMV / renovação)</h3>
        <p className="text-xs text-gray-500 mb-3">
          Estoque valorizado: cada compra vira ativo com custo unitário. O CMV na margem usa principalmente o{' '}
          <code className="text-xs">purchasePrice</code> da conta vendida; abatimento automático FIFO por lote pode ser
          ligado na entrega num passo seguinte.
        </p>
        <form onSubmit={submitSupply} className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mb-4">
          <input className="input-field" placeholder="Descrição do lote" value={supLabel} onChange={(e) => setSupLabel(e.target.value)} />
          <select className="input-field" value={supCat} onChange={(e) => setSupCat(e.target.value)}>
            <option value="DOMAIN">Domínio</option>
            <option value="PROXY_RESIDENTIAL">Proxy residencial</option>
            <option value="PROXY_MOBILE">Proxy móvel</option>
            <option value="OTHER">Outro</option>
          </select>
          <input className="input-field" placeholder="Custo total (R$)" value={supCost} onChange={(e) => setSupCost(e.target.value)} />
          <input className="input-field" placeholder="Unidades" value={supUnits} onChange={(e) => setSupUnits(e.target.value)} />
          <input
            className="input-field md:col-span-2"
            type="datetime-local"
            placeholder="Expira"
            value={supExp}
            onChange={(e) => setSupExp(e.target.value)}
          />
          <button type="submit" className="btn-primary text-sm md:col-span-2">
            Criar lote
          </button>
        </form>
        {intel?.supplyRenewalAlerts && intel.supplyRenewalAlerts.length > 0 && (
          <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
            <strong>Renovação próxima:</strong>
            <ul className="mt-1">
              {intel.supplyRenewalAlerts.map((a) => (
                <li key={a.id}>
                  {a.label} ({a.category}) — expira {new Date(a.expiresAt).toLocaleDateString('pt-BR')}
                </li>
              ))}
            </ul>
          </div>
        )}
        <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
          {supplyLots.map((l) => (
            <li key={l.id}>
              {l.label} — {l.unitsRemaining} un. — {l.expiresAt ? new Date(l.expiresAt).toLocaleDateString('pt-BR') : '—'}
            </li>
          ))}
        </ul>
      </div>

      <div className="card overflow-x-auto">
        <h3 className="font-semibold mb-2">Razão (últimos lançamentos)</h3>
        <table className="w-full text-xs min-w-[600px]">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2">Data</th>
              <th className="pb-2">Origem</th>
              <th className="pb-2">Contas</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((j) => (
              <tr key={j.id} className="border-b border-gray-100 align-top">
                <td className="py-2 whitespace-nowrap">{new Date(j.occurredAt).toLocaleString('pt-BR')}</td>
                <td className="py-2">{j.source}</td>
                <td className="py-2">
                  {j.lines.map((l) => (
                    <div key={`${j.id}-${l.account}`}>
                      {l.account}: D {l.debit} / C {l.credit}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Settings: vault_gateway_fee_pct, vault_fixed_costs_monthly, vault_default_cogs_per_unit, vault_tax_estimate_pct,
        vault_reposition_unit_cost, vault_garantia_alert_pct — via tabela system_settings.
      </p>
    </div>
  )
}
