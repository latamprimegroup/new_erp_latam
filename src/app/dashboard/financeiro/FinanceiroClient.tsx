'use client'

import { useState, useEffect } from 'react'
import { VaultIntelligenceTab } from './VaultIntelligenceTab'
import { FinanceiroPayoutTab } from './FinanceiroPayoutTab'
import { FinanceiroContasFiscalTab } from './FinanceiroContasFiscalTab'
import { FinanceiroCarteirasTab } from './FinanceiroCarteirasTab'
import { FinanceiroInadimplentesTab } from './FinanceiroInadimplentesTab'
import { FinanceiroNfeTab } from './FinanceiroNfeTab'
import { FinanceiroConciliacaoVendasTab } from './FinanceiroConciliacaoVendasTab'
import { FinanceiroOverviewTab } from './FinanceiroOverviewTab'

type Entry = {
  id: string
  type: string
  category: string
  costCenter: string | null
  value: { toString: () => string }
  date: string
  netProfit: { toString: () => string } | null
  description: string | null
  reconciled?: boolean
  orderId?: string | null
}

type DreData = {
  receipts: { category: string; value: number }[]
  expenses: { category: string; value: number }[]
  totalReceipts: number
  totalExpenses: number
  result: number
}

type ProjecaoData = {
  currentBalance: number
  avgIncome: number
  avgExpense: number
  projection: { month: string; balance: number; income: number; expense: number }[]
}

type Tab = 'overview' | 'lancamentos' | 'dre' | 'vault' | 'folha' | 'conciliacao' | 'contas_fiscal' | 'projecao' | 'carteiras' | 'inadimplentes' | 'nfe' | 'conciliacao_vendas'

export function FinanceiroClient() {
  const [tab, setTab] = useState<Tab>('overview')
  const [entries, setEntries] = useState<Entry[]>([])
  const [flow, setFlow] = useState({
    income: 0,
    expense: 0,
    balance: 0,
    reconciledCount: 0,
    entryCount: 0,
  })
  const [dre, setDre] = useState<DreData | null>(null)
  const [projecao, setProjecao] = useState<ProjecaoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingDre, setLoadingDre] = useState(false)
  const [loadingProjecao, setLoadingProjecao] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [month, setMonth] = useState(String(new Date().getMonth() + 1))
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [form, setForm] = useState({
    type: 'INCOME' as 'INCOME' | 'EXPENSE',
    category: '',
    costCenter: '',
    value: 0,
    description: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [gatewayConc, setGatewayConc] = useState<{
    summary: {
      ordersPaidInPeriod: number
      ordersWithIncomeEntry: number
      ordersWithoutIncomeEntry: number
      ordersWithAlignedAmount: number
    }
    rows: {
      orderId: string
      paidAt: string | null
      orderValue: number
      gatewayHint: string
      incomeEntryCount: number
      matchedAmount: boolean
      incomeReconciledAll: boolean
      entries: { id: string; value: number; reconciled: boolean }[]
    }[]
  } | null>(null)
  const [loadingGateway, setLoadingGateway] = useState(false)

  function loadEntries() {
    setLoading(true)
    fetch(`/api/financeiro?month=${month}&year=${year}`)
      .then((r) => r.json())
      .then((data) => {
        setEntries(data.entries || [])
        setFlow(
          data.flow || {
            income: 0,
            expense: 0,
            balance: 0,
            reconciledCount: 0,
            entryCount: 0,
          }
        )
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadEntries()
  }, [month, year])

  // Permite que o FinanceiroOverviewTab navegue para outras abas via evento customizado
  useEffect(() => {
    const handler = (e: Event) => {
      const target = (e as CustomEvent<string>).detail as Tab
      if (target) setTab(target)
    }
    window.addEventListener('financeTabChange', handler)
    return () => window.removeEventListener('financeTabChange', handler)
  }, [])

  useEffect(() => {
    if (tab === 'dre') {
      setLoadingDre(true)
      fetch(`/api/financeiro/dre?month=${month}&year=${year}`)
        .then((r) => r.json())
        .then(setDre)
        .finally(() => setLoadingDre(false))
    }
  }, [tab, month, year])

  useEffect(() => {
    if (tab === 'projecao') {
      setLoadingProjecao(true)
      fetch('/api/financeiro/projecao?months=6')
        .then((r) => r.json())
        .then(setProjecao)
        .finally(() => setLoadingProjecao(false))
    }
  }, [tab])

  useEffect(() => {
    if (tab !== 'conciliacao') return
    setLoadingGateway(true)
    fetch(`/api/financeiro/conciliacao-gateway?month=${month}&year=${year}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setGatewayConc({ summary: d.summary, rows: d.rows })
        else setGatewayConc(null)
      })
      .catch(() => setGatewayConc(null))
      .finally(() => setLoadingGateway(false))
  }, [tab, month, year])

  function presetCustoFixo(category: string) {
    setForm((f) => ({ ...f, type: 'EXPENSE', category }))
    setTab('lancamentos')
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const res = await fetch('/api/financeiro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        value: Number(form.value),
        costCenter: form.costCenter || undefined,
        description: form.description || undefined,
      }),
    })
    if (res.ok) {
      setForm({ type: 'INCOME', category: '', costCenter: '', value: 0, description: '' })
      setShowForm(false)
      loadEntries()
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao registrar')
    }
    setSubmitting(false)
  }

  async function toggleReconciled(entryId: string, reconciled: boolean) {
    const res = await fetch(`/api/financeiro/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reconciled }),
    })
    if (res.ok) loadEntries()
    else alert('Erro ao atualizar conciliação')
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: '🏠 Painel' },
    { id: 'lancamentos', label: 'Lançamentos' },
    { id: 'dre', label: 'DRE' },
    { id: 'vault', label: 'Vault Intelligence' },
    { id: 'folha', label: 'Folha / Payout' },
    { id: 'conciliacao', label: 'Conciliação' },
    { id: 'contas_fiscal', label: 'Contas & Fiscal' },
    { id: 'projecao', label: 'Fluxo Projetado' },
    { id: 'conciliacao_vendas', label: '🔗 Conciliação Vendas' },
    { id: 'carteiras', label: '🏦 Carteiras' },
    { id: 'inadimplentes', label: '⚠️ Inadimplência' },
    { id: 'nfe', label: '📄 NF-e' },
  ]

  return (
    <div>
      <h1 className="heading-1 mb-2">Financeiro</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Guardião do fluxo de caixa: da receita bruta ao lucro líquido, folha de produção e obrigações.
      </p>

      <div className="flex flex-wrap gap-2 items-center mb-4">
        <span className="text-sm text-gray-500">Período:</span>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="input-field py-1.5 px-2 w-24 text-sm"
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, '0')}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="input-field py-1.5 px-2 w-28 text-sm"
        >
          {[2024, 2025, 2026, 2027].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="card mb-6">
        <h2 className="font-semibold mb-1">Fluxo de caixa consolidado</h2>
        <p className="text-xs text-gray-500 mb-4">
          Receitas e despesas registradas no período {String(month).padStart(2, '0')}/{year} (lançamentos manuais e
          rotinas que gravam no razão interno).
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500">Entradas (receitas)</p>
            <p className="text-xl font-bold text-green-600">R$ {flow.income.toLocaleString('pt-BR')}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Saídas (custos/despesas)</p>
            <p className="text-xl font-bold text-red-600">R$ {flow.expense.toLocaleString('pt-BR')}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Saldo líquido</p>
            <p className={`text-xl font-bold ${flow.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              R$ {flow.balance.toLocaleString('pt-BR')}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Lançamentos conciliados</p>
            <p className="text-xl font-bold text-blue-600">
              {flow.reconciledCount} / {flow.entryCount}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-4 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <FinanceiroOverviewTab onTabChange={(t) => setTab(t as Tab)} />
      )}

      {tab === 'lancamentos' && (
        <div className="card">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
            <h2 className="font-semibold">Lançamentos</h2>
            <button onClick={() => setShowForm(!showForm)} className="btn-primary">
              {showForm ? 'Cancelar' : 'Registrar Entrada/Saída'}
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-3 border border-primary-600/5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Tipo</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as 'INCOME' | 'EXPENSE' }))}
                    className="input-field"
                  >
                    <option value="INCOME">Entrada</option>
                    <option value="EXPENSE">Saída</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Categoria *</label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="input-field"
                    placeholder="Ex: Vendas"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Centro de Custo</label>
                  <input
                    type="text"
                    value={form.costCenter}
                    onChange={(e) => setForm((f) => ({ ...f, costCenter: e.target.value }))}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Valor (R$) *</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.value || ''}
                    onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) || 0 }))}
                    className="input-field"
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Descrição</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    className="input-field"
                  />
                </div>
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
          )}

          <div className="overflow-x-auto">
            {loading ? (
              <p className="text-gray-500 py-4">Carregando...</p>
            ) : entries.length === 0 ? (
              <p className="text-gray-400 py-4">Nenhum lançamento neste período.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2 pr-4">Tipo</th>
                    <th className="pb-2 pr-4">Categoria</th>
                    <th className="pb-2 pr-4">Valor</th>
                    <th className="pb-2 pr-4">Data</th>
                    <th className="pb-2">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 pr-4">
                        <span className={e.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}>
                          {e.type === 'INCOME' ? 'Entrada' : 'Saída'}
                        </span>
                      </td>
                      <td className="py-3 pr-4">{e.category}</td>
                      <td className="py-3 pr-4">R$ {Number(e.value).toLocaleString('pt-BR')}</td>
                      <td className="py-3 pr-4">{new Date(e.date).toLocaleDateString('pt-BR')}</td>
                      <td className="py-3">{e.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'dre' && (
        <div className="card">
          {loadingDre ? (
            <p className="text-gray-500 py-4">Carregando DRE...</p>
          ) : dre ? (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-green-700 mb-2">Receitas</h3>
                <ul className="space-y-1">
                  {dre.receipts.length === 0 ? (
                    <li className="text-gray-500">Nenhuma receita</li>
                  ) : (
                    dre.receipts.map((r) => (
                      <li key={r.category} className="flex justify-between">
                        <span>{r.category}</span>
                        <span className="text-green-600">R$ {r.value.toLocaleString('pt-BR')}</span>
                      </li>
                    ))
                  )}
                  <li className="flex justify-between font-bold pt-2 border-t">
                    <span>Total Receitas</span>
                    <span className="text-green-600">R$ {dre.totalReceipts.toLocaleString('pt-BR')}</span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-red-700 mb-2">Despesas</h3>
                <ul className="space-y-1">
                  {dre.expenses.length === 0 ? (
                    <li className="text-gray-500">Nenhuma despesa</li>
                  ) : (
                    dre.expenses.map((e) => (
                      <li key={e.category} className="flex justify-between">
                        <span>{e.category}</span>
                        <span className="text-red-600">R$ {e.value.toLocaleString('pt-BR')}</span>
                      </li>
                    ))
                  )}
                  <li className="flex justify-between font-bold pt-2 border-t">
                    <span>Total Despesas</span>
                    <span className="text-red-600">R$ {dre.totalExpenses.toLocaleString('pt-BR')}</span>
                  </li>
                </ul>
              </div>
              <div className="pt-4 border-t-2">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold">Resultado do Período</span>
                  <span
                    className={`text-xl font-bold ${
                      dre.result >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    R$ {dre.result.toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {tab === 'conciliacao' && (
        <div className="space-y-6">
          <div className="card overflow-x-auto">
            <h2 className="font-semibold mb-2">Gateways vs pedidos aprovados</h2>
            <p className="text-sm text-gray-500 mb-4">
              Pedidos marcados como pagos no período (PIX Inter, Asaas, etc.) confrontados com lançamentos de{' '}
              <strong>receita</strong> vinculados ao <code className="text-xs">orderId</code> no razão interno. Quando o
              webhook só atualiza o pedido, registre a entrada manualmente ou automatize o lançamento na próxima
              evolução.
            </p>
            {loadingGateway ? (
              <p className="text-gray-500 py-4">Carregando conciliação de pedidos...</p>
            ) : gatewayConc ? (
              <>
                <div className="flex flex-wrap gap-3 text-sm mb-4">
                  <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800">
                    Pagos no mês: {gatewayConc.summary.ordersPaidInPeriod}
                  </span>
                  <span className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/40">
                    Sem lançamento de receita: {gatewayConc.summary.ordersWithoutIncomeEntry}
                  </span>
                  <span className="px-2 py-1 rounded bg-green-100 dark:bg-green-900/30">
                    Valor alinhado ao pedido: {gatewayConc.summary.ordersWithAlignedAmount}
                  </span>
                </div>
                <table className="w-full text-sm min-w-[800px]">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2 pr-2">Pedido</th>
                      <th className="pb-2 pr-2">Pago em</th>
                      <th className="pb-2 pr-2">Valor</th>
                      <th className="pb-2 pr-2">Gateway</th>
                      <th className="pb-2 pr-2">Receitas vinc.</th>
                      <th className="pb-2 pr-2">Valor OK</th>
                      <th className="pb-2">Conciliado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gatewayConc.rows.map((r) => (
                      <tr
                        key={r.orderId}
                        className={`border-b border-gray-100 ${
                          r.incomeEntryCount === 0 ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''
                        }`}
                      >
                        <td className="py-2 pr-2 font-mono text-xs">{r.orderId.slice(-12)}</td>
                        <td className="py-2 pr-2 text-xs whitespace-nowrap">
                          {r.paidAt ? new Date(r.paidAt).toLocaleString('pt-BR') : '—'}
                        </td>
                        <td className="py-2 pr-2">R$ {r.orderValue.toLocaleString('pt-BR')}</td>
                        <td className="py-2 pr-2 text-xs">{r.gatewayHint}</td>
                        <td className="py-2 pr-2">{r.incomeEntryCount}</td>
                        <td className="py-2 pr-2">{r.matchedAmount ? 'Sim' : 'Não'}</td>
                        <td className="py-2 pr-2">{r.incomeReconciledAll ? 'Sim' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="text-gray-500">Sem dados.</p>
            )}
          </div>

          <div className="card overflow-x-auto">
            <h2 className="font-semibold mb-2">Lançamentos do período</h2>
            <p className="text-sm text-gray-500 mb-4">
              Marque como conciliado após confrontar com extrato bancário ou extrato do gateway.
            </p>
            {loading ? (
              <p className="text-gray-500 py-4">Carregando...</p>
            ) : entries.length === 0 ? (
              <p className="text-gray-400 py-4">Nenhum lançamento neste período.</p>
            ) : (
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2 pr-4">Conciliado</th>
                    <th className="pb-2 pr-4">Tipo</th>
                    <th className="pb-2 pr-4">Categoria</th>
                    <th className="pb-2 pr-4">Valor</th>
                    <th className="pb-2 pr-4">Data</th>
                    <th className="pb-2 pr-4">Pedido</th>
                    <th className="pb-2">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 pr-4">
                        <input
                          type="checkbox"
                          checked={!!e.reconciled}
                          onChange={() => toggleReconciled(e.id, !e.reconciled)}
                          className="rounded"
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <span className={e.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}>
                          {e.type === 'INCOME' ? 'Entrada' : 'Saída'}
                        </span>
                      </td>
                      <td className="py-3 pr-4">{e.category}</td>
                      <td className="py-3 pr-4">R$ {Number(e.value).toLocaleString('pt-BR')}</td>
                      <td className="py-3 pr-4">{new Date(e.date).toLocaleDateString('pt-BR')}</td>
                      <td className="py-3 pr-4 font-mono text-xs">{e.orderId ? e.orderId.slice(-10) : '—'}</td>
                      <td className="py-3">{e.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'vault' && <VaultIntelligenceTab month={month} year={year} />}

      {tab === 'folha' && <FinanceiroPayoutTab onPayoutLiquidated={loadEntries} />}

      {tab === 'contas_fiscal' && (
        <FinanceiroContasFiscalTab month={month} year={year} onPresetExpense={presetCustoFixo} />
      )}

      {tab === 'projecao' && (
        <div className="card">
          <h2 className="font-semibold mb-4">Fluxo de Caixa Projetado</h2>
          <p className="text-sm text-gray-500 mb-4">
            Projeção baseada na média dos últimos 6 meses.
          </p>
          {loadingProjecao ? (
            <p className="text-gray-500 py-4">Carregando projeção...</p>
          ) : projecao ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm text-gray-500">Saldo atual</p>
                  <p
                    className={`text-lg font-bold ${
                      projecao.currentBalance >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    R$ {projecao.currentBalance.toLocaleString('pt-BR')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Média receitas/mês</p>
                  <p className="text-lg font-bold text-green-600">
                    R$ {projecao.avgIncome.toLocaleString('pt-BR')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Média despesas/mês</p>
                  <p className="text-lg font-bold text-red-600">
                    R$ {projecao.avgExpense.toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2 pr-4">Mês</th>
                    <th className="pb-2 pr-4">Receita projetada</th>
                    <th className="pb-2 pr-4">Despesa projetada</th>
                    <th className="pb-2">Saldo projetado</th>
                  </tr>
                </thead>
                <tbody>
                  {projecao.projection.map((p) => (
                    <tr key={p.month} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 pr-4">{p.month}</td>
                      <td className="py-3 pr-4 text-green-600">
                        R$ {p.income.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 pr-4 text-red-600">
                        R$ {p.expense.toLocaleString('pt-BR')}
                      </td>
                      <td
                        className={`py-3 font-medium ${
                          p.balance >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        R$ {p.balance.toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}

      {tab === 'conciliacao_vendas' && (
        <div className="card">
          <FinanceiroConciliacaoVendasTab />
        </div>
      )}

      {tab === 'carteiras' && (
        <div className="card">
          <FinanceiroCarteirasTab />
        </div>
      )}

      {tab === 'inadimplentes' && (
        <div className="card">
          <FinanceiroInadimplentesTab />
        </div>
      )}

      {tab === 'nfe' && (
        <div className="card">
          <FinanceiroNfeTab />
        </div>
      )}
    </div>
  )
}
