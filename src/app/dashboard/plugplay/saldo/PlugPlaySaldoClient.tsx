'use client'

import { useState, useEffect, useCallback } from 'react'

const TIER_LABELS: Record<string, string> = {
  BRONZE: '🥉 Bronze',
  PRATA: '🥈 Prata',
  OURO: '🥇 Ouro',
  META_BATIDA: '🏆 Meta batida',
  ELITE: '⚡ Elite',
}

const ROW_STATUS_LABEL: Record<string, string> = {
  SUCESSO: 'Sucesso ✅',
  EM_ANALISE: 'Em análise ⏳',
  AGUARDANDO_24H: 'Aguardando +24h ⏳',
  QUEDA_TECNICA: 'Queda técnica ❌',
  BANIDA: 'Banida',
  EM_SETUP: 'Em setup',
}

type ExtratoRow = {
  id: string
  displayId: string
  platform: string
  dataSetup: string
  rowStatus: string
  valorComissao: number
  pendente: boolean
  notaValor: string | null
  technicalBanReason: 'PROXY' | 'LOGIN' | null
}

type SaldoPayload = {
  saldoDisponivel: number
  setupsComSucesso: number
  previsaoGanhosRapida: number
  previsaoMes: {
    contasSurvived24h: number
    baseSalary: number
    bonusTotal: number
    total: number
    tier: string | null
  }
  contasEmAnalise: number
  valoresUnitarios: { googleAds: number; facebook: number; legadoFallback: number }
  performance: { tier: string | null; metaPadraoContas: number; metaEliteContas: number }
  fechamentoAtual: { status: string; total: number; tier: string | null } | null
  config: { salarioBase: number; metaDiaria: number; metaMensal: number; metaElite: number }
  saque: { minimoReais: number; periodoAberto: boolean; podeSolicitar: boolean }
  extrato: ExtratoRow[]
  withdrawals: Array<{
    id: string
    createdAt: string
    netValue: number
    status: string
    gateway: string
    accountId: string | null
  }>
}

export function PlugPlaySaldoClient() {
  const [data, setData] = useState<SaldoPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [value, setValue] = useState('')
  const [gateway, setGateway] = useState('PIX')
  const [submitting, setSubmitting] = useState(false)
  const [modalRow, setModalRow] = useState<ExtratoRow | null>(null)
  const [savingReason, setSavingReason] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/plugplay/saldo')
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.saldoDisponivel === 'number') setData(d as SaldoPayload)
        else setData(null)
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function salvarMotivoTecnico(reason: 'PROXY' | 'LOGIN') {
    if (!modalRow) return
    setSavingReason(true)
    try {
      const res = await fetch(`/api/black/operations/${modalRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ technicalBanReason: reason }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert((d as { error?: string }).error || 'Erro ao salvar')
        return
      }
      setModalRow(null)
      load()
    } finally {
      setSavingReason(false)
    }
  }

  async function handleSolicitar(e: React.FormEvent) {
    e.preventDefault()
    const v = parseFloat(value.replace(',', '.'))
    if (isNaN(v) || v <= 0) {
      alert('Informe um valor válido')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/saques/solicitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: v, gateway }),
      })
      const d = await res.json()
      if (res.ok) {
        setValue('')
        setShowForm(false)
        load()
        alert('Solicitação de saque registrada.')
      } else {
        alert(d.error || 'Erro ao solicitar saque')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p className="text-gray-500 py-4">Carregando...</p>
  if (!data) return <p className="text-gray-500 py-4">Não foi possível carregar o saldo.</p>

  const pm = data.previsaoMes
  const perf = data.performance
  const tierLabel = pm.tier ? TIER_LABELS[pm.tier] || pm.tier : 'Em progresso'

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card border-l-4 border-l-green-600">
          <p className="text-sm text-gray-500 dark:text-gray-400">Saldo disponível</p>
          <p className="text-2xl font-bold text-green-700 dark:text-green-400 mt-1">
            R$ {data.saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Crédito após fechamentos mensais processados (e saldo já liberado pelo financeiro).
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Setups com sucesso</p>
          <p className="text-2xl font-bold text-primary-600 mt-1">{data.setupsComSucesso}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Contas que completaram +24h no ar (status Sucesso).
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Previsão de ganhos</p>
          <p className="text-2xl font-bold mt-1">
            R$ {data.previsaoGanhosRapida.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Saldo atual + {data.contasEmAnalise} conta(s) em análise (24h) × valor unitário por plataforma.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Previsão mensal (base + bônus): R$ {pm.total.toLocaleString('pt-BR')} · +24h no mês:{' '}
            {pm.contasSurvived24h}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Performance P&amp;P</p>
          <p className="text-lg font-bold mt-1">Nível: {tierLabel}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Padrão: {perf.metaPadraoContas} contas · Elite: {perf.metaEliteContas} contas
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Google R$ {data.valoresUnitarios.googleAds} · Facebook R$ {data.valoresUnitarios.facebook}
            {data.valoresUnitarios.legadoFallback !== data.valoresUnitarios.googleAds && (
              <> · fallback legado R$ {data.valoresUnitarios.legadoFallback}</>
            )}
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-slate-900 text-slate-100 border border-slate-700 p-6 shadow-lg">
        <h3 className="font-semibold text-lg mb-2">Solicitar saque</h3>
        <p className="text-sm text-slate-400 mb-4">
          Mínimo R$ {data.saque.minimoReais.toFixed(0)}. Período liberado:{' '}
          {data.saque.periodoAberto ? 'sim' : 'não'} (admin pode ajustar em SystemSetting:
          plugplay_saque_dia_inicio ou plugplay_saque_sempre_liberado=1).
        </p>
        {data.saldoDisponivel <= 0 ? (
          <p className="text-slate-400 text-sm">Sem saldo disponível após fechamentos e saques já solicitados.</p>
        ) : (
          <>
            {!data.saque.podeSolicitar && (
              <p className="text-amber-300 text-sm mb-3">
                {!data.saque.periodoAberto && 'Fora do período de saque. '}
                {data.saldoDisponivel < data.saque.minimoReais &&
                  `Saldo abaixo do mínimo (R$ ${data.saque.minimoReais}).`}
              </p>
            )}
            {!showForm ? (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="btn-primary"
                disabled={!data.saque.podeSolicitar}
              >
                Solicitar saque
              </button>
            ) : (
              <form onSubmit={handleSolicitar} className="space-y-3 max-w-sm">
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-300">Valor (R$)</label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="0,00"
                    className="input-field bg-slate-800 border-slate-600 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-300">Forma de recebimento</label>
                  <select
                    value={gateway}
                    onChange={(e) => setGateway(e.target.value)}
                    className="input-field bg-slate-800 border-slate-600 text-slate-100"
                  >
                    <option value="PIX">PIX</option>
                    <option value="TED">TED</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={submitting || !data.saque.podeSolicitar} className="btn-primary">
                    {submitting ? 'Enviando...' : 'Confirmar'}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>

      <div className="card overflow-hidden">
        <h3 className="font-semibold mb-4 text-gray-900 dark:text-gray-100">Detalhamento por conta</h3>
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                <th className="pb-2 pr-3 pl-4 sm:pl-0">ID conta</th>
                <th className="pb-2 pr-3">Plataforma</th>
                <th className="pb-2 pr-3">Data setup</th>
                <th className="pb-2 pr-3">Status final</th>
                <th className="pb-2 pr-4 sm:pr-0 text-right">Valor comissão</th>
              </tr>
            </thead>
            <tbody>
              {data.extrato.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500">
                    Nenhuma operação registrada.
                  </td>
                </tr>
              ) : (
                data.extrato.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <td className="py-2 pr-3 pl-4 sm:pl-0 font-mono text-xs">{row.displayId}</td>
                    <td className="py-2 pr-3">{row.platform}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {new Date(row.dataSetup).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-2 pr-3">
                      <span>{ROW_STATUS_LABEL[row.rowStatus] || row.rowStatus}</span>
                      {row.rowStatus === 'QUEDA_TECNICA' && (
                        <button
                          type="button"
                          onClick={() => setModalRow(row)}
                          className="ml-2 text-primary-600 hover:underline text-xs"
                        >
                          {row.technicalBanReason
                            ? row.technicalBanReason === 'PROXY'
                              ? '(Proxy)'
                              : '(Login)'
                            : 'Classificar motivo'}
                        </button>
                      )}
                    </td>
                    <td className="py-2 pr-4 sm:pr-0 text-right font-medium">
                      R$ {row.valorComissao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      {row.pendente && row.notaValor && (
                        <span className="block text-xs font-normal text-amber-600 dark:text-amber-400">
                          {row.notaValor}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data.withdrawals.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-4 text-gray-900 dark:text-gray-100">Histórico de saques</h3>
          <ul className="space-y-2 text-sm">
            {data.withdrawals.map((w) => (
              <li key={w.id} className="flex flex-wrap justify-between gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
                <span className="text-gray-500">
                  {new Date(w.createdAt).toLocaleString('pt-BR')} · {w.gateway}
                </span>
                <span className="font-medium">
                  R$ {w.netValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · {w.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {modalRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700">
            <h4 className="font-semibold text-lg mb-2">Motivo da queda técnica</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Indique se a falha foi de infraestrutura (proxy) ou de credencial (login), para contestação junto ao
              financeiro.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={savingReason}
                className="btn-primary w-full"
                onClick={() => salvarMotivoTecnico('PROXY')}
              >
                Erro de proxy (sistema)
              </button>
              <button
                type="button"
                disabled={savingReason}
                className="btn-secondary w-full"
                onClick={() => salvarMotivoTecnico('LOGIN')}
              >
                Erro de login (operador)
              </button>
              <button type="button" className="text-sm text-gray-500 mt-2" onClick={() => setModalRow(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
