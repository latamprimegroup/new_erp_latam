'use client'

import { useState, useEffect, useCallback } from 'react'
import { calculateMonthlyAmount, type ProductionPaymentConfig } from '@/lib/production-bonus-math'

const WITHDRAWAL_STATUS: Record<string, string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Processando',
  COMPLETED: 'Pago',
  HELD: 'Retido',
  FAILED: 'Falhou',
}

type ExtratoLinha = {
  id: string
  source: 'PRODUCTION' | 'G2'
  validatedAt: string
  valorVariavelConta: number
}

type SaldoData = {
  saldoDisponivel: number
  previsaoMes: {
    contasAprovadas: number
    baseSalary: number
    perAccountTotal: number
    bonusTotal: number
    total: number
  }
  fechamentoAtual: { status: string; total: number; closedAt: string | null } | null
  pixKey: string | null
  extratoMes?: ExtratoLinha[]
  withdrawals: Array<{
    id: string
    createdAt: string
    netValue: number
    status: string
    gateway: string
    accountId: string | null
  }>
  config: ProductionPaymentConfig
}

function LevelProgressBar({
  contas,
  metaMensal,
  metaElite,
}: {
  contas: number
  metaMensal: number
  metaElite: number
}) {
  const max = Math.max(metaElite, 1)
  const pct = Math.min(100, (contas / max) * 100)
  const markPadrao = (metaMensal / max) * 100
  return (
    <div className="space-y-2">
      <div className="h-3 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden relative">
        <div
          className="h-full rounded-full bg-primary-500/90 transition-all"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-amber-500 z-10"
          style={{ left: `${Math.min(100, markPadrao)}%`, transform: 'translateX(-50%)' }}
          title={`Meta padrão ${metaMensal}`}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>0</span>
        <span className="text-amber-600 dark:text-amber-400">Padrão {metaMensal}</span>
        <span className="text-primary-600 dark:text-primary-400">Elite {metaElite}</span>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Você está com <strong>{contas}</strong> conta(s) aprovadas no mês.
        {contas < metaMensal && (
          <> Faltam <strong>{metaMensal - contas}</strong> para a meta padrão.</>
        )}
        {contas >= metaMensal && contas < metaElite && (
          <> Faltam <strong>{metaElite - contas}</strong> para a meta elite.</>
        )}
        {contas >= metaElite && <> Meta elite atingida.</>}
      </p>
    </div>
  )
}

export function SaldoSaqueClient() {
  const [data, setData] = useState<SaldoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [value, setValue] = useState('')
  const [gateway, setGateway] = useState('PIX')
  const [submitting, setSubmitting] = useState(false)
  const [pixInput, setPixInput] = useState('')
  const [pixSaving, setPixSaving] = useState(false)
  const [extraContas, setExtraContas] = useState('')
  const [saqueAlertDismissed, setSaqueAlertDismissed] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/producao/saldo')
      .then((r) => r.json())
      .then((d: SaldoData) => {
        setData(d)
        setPixInput(d.pixKey ?? '')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    try {
      const k = `producao-saldo-alerta-${new Date().getFullYear()}-${new Date().getMonth() + 1}`
      setSaqueAlertDismissed(sessionStorage.getItem(k) === '1')
    } catch {
      setSaqueAlertDismissed(false)
    }
  }, [])

  async function handleSolicitar(e: React.FormEvent) {
    e.preventDefault()
    const v = parseFloat(value.replace(',', '.'))
    if (isNaN(v) || v <= 0) {
      alert('Informe um valor válido')
      return
    }
    setSubmitting(true)
    try {
      const accountId = data?.pixKey?.trim() || undefined
      const res = await fetch('/api/saques/solicitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: v,
          gateway,
          ...(gateway === 'PIX' && accountId ? { accountId } : {}),
        }),
      })
      const d = await res.json()
      if (res.ok) {
        setValue('')
        setShowForm(false)
        load()
        alert('Solicitação de saque registrada. Aguarde processamento.')
      } else {
        alert(d.error || 'Erro ao solicitar saque')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSavePix(e: React.FormEvent) {
    e.preventDefault()
    setPixSaving(true)
    try {
      const res = await fetch('/api/producao/pix-key', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pixKey: pixInput }),
      })
      const d = await res.json()
      if (res.ok) {
        setData((prev) => (prev ? { ...prev, pixKey: d.pixKey ?? null } : prev))
        alert('Chave PIX salva.')
      } else {
        alert(d.error || 'Erro ao salvar')
      }
    } finally {
      setPixSaving(false)
    }
  }

  if (loading || !data) return <p className="text-gray-500 dark:text-gray-400 py-4">Carregando...</p>

  const previsao = data.previsaoMes
  const cfg = data.config
  const extra = Math.max(0, parseInt(extraContas.replace(/\D/g, ''), 10) || 0)
  const simulado = calculateMonthlyAmount(previsao.contasAprovadas + extra, cfg)
  const delta = simulado.total - previsao.total
  const extrato = data.extratoMes ?? []
  const mostrarAlertaSaque =
    data.saldoDisponivel > 0 &&
    data.fechamentoAtual?.status === 'CLOSED' &&
    !saqueAlertDismissed

  function dismissSaqueAlert() {
    try {
      const k = `producao-saldo-alerta-${new Date().getFullYear()}-${new Date().getMonth() + 1}`
      sessionStorage.setItem(k, '1')
    } catch {
      /* ignore */
    }
    setSaqueAlertDismissed(true)
  }

  return (
    <div className="space-y-6">
      {mostrarAlertaSaque && (
        <div
          className="rounded-xl border border-green-500/40 bg-green-50 dark:bg-green-950/30 px-4 py-3 text-sm text-green-950 dark:text-green-100 flex flex-wrap items-start justify-between gap-3"
          role="status"
        >
          <div>
            <p className="font-semibold">Saque liberado</p>
            <p className="mt-1 opacity-90">
              O fechamento do mês foi concluído e há saldo disponível. Você pode solicitar o saque quando quiser.
            </p>
          </div>
          <button type="button" onClick={dismissSaqueAlert} className="btn-secondary text-xs shrink-0">
            Entendi
          </button>
        </div>
      )}
      <div className="card dark:border-white/10">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Progresso até as metas</h3>
        <LevelProgressBar
          contas={previsao.contasAprovadas}
          metaMensal={cfg.metaMensal}
          metaElite={cfg.metaElite}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card border-l-4 border-l-green-600 dark:border-l-green-500">
          <p className="text-sm text-gray-500 dark:text-gray-400">Saldo disponível para saque</p>
          <p className="text-2xl font-bold text-green-700 dark:text-green-400">
            R$ {data.saldoDisponivel.toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="card dark:border-white/10">
          <p className="text-sm text-gray-500 dark:text-gray-400">Contas aprovadas (mês)</p>
          <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">{previsao.contasAprovadas}</p>
        </div>
        <div className="card dark:border-white/10">
          <p className="text-sm text-gray-500 dark:text-gray-400">Previsão do mês</p>
          <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">
            R$ {previsao.total.toLocaleString('pt-BR')}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Base R$ {previsao.baseSalary.toLocaleString('pt-BR')} + por conta R${' '}
            {previsao.perAccountTotal.toLocaleString('pt-BR')} + bônus R${' '}
            {previsao.bonusTotal.toLocaleString('pt-BR')}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">
            Valor por conta aprovada (config.):{' '}
            <strong>
              {cfg.valorPorConta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </strong>
            {previsao.contasAprovadas > 0 && (
              <span className="text-gray-500 dark:text-gray-400">
                {' '}
                × {previsao.contasAprovadas} ={' '}
                {previsao.perAccountTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} na
                previsão
              </span>
            )}
          </p>
        </div>
        <div className="card dark:border-white/10">
          <p className="text-sm text-gray-500 dark:text-gray-400">Metas (referência)</p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Padrão: {cfg.metaMensal} contas · Elite: {cfg.metaElite} contas
          </p>
        </div>
      </div>

      <div className="card dark:border-white/10">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Simulador de bônus</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Quantas contas a mais você pretende validar neste mês? Veja o impacto na previsão (bônus por faixa +
          valor por conta).
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Contas extras (simulação)
            </label>
            <input
              type="number"
              min={0}
              value={extraContas}
              onChange={(e) => setExtraContas(e.target.value)}
              className="input-field w-36"
              placeholder="0"
            />
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-300 pb-1">
            <span className="text-gray-500 dark:text-gray-400">Nova previsão: </span>
            <strong>R$ {simulado.total.toLocaleString('pt-BR')}</strong>
            {extra > 0 && (
              <span className={delta >= 0 ? ' text-green-600 dark:text-green-400' : ' text-red-600'}>
                {' '}
                ({delta >= 0 ? '+' : ''}
                {delta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="card dark:border-white/10">
        <h3 className="font-semibold mb-4 text-gray-900 dark:text-gray-100">Solicitar saque</h3>
        {data.saldoDisponivel <= 0 ? (
          <p className="text-gray-500 dark:text-gray-400">
            Não há saldo disponível. O saldo é liberado após o fechamento mensal pelo admin.
          </p>
        ) : (
          <>
            {!showForm ? (
              <button type="button" onClick={() => setShowForm(true)} className="btn-primary">
                Solicitar saque
              </button>
            ) : (
              <form onSubmit={handleSolicitar} className="space-y-3 max-w-sm">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Valor (R$)
                  </label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="0,00"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Forma de recebimento
                  </label>
                  <select
                    value={gateway}
                    onChange={(e) => setGateway(e.target.value)}
                    className="input-field"
                  >
                    <option value="PIX">PIX</option>
                    <option value="TED">TED</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </div>
                {gateway === 'PIX' && data.pixKey && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    A chave cadastrada abaixo será enviada junto ao pedido (campo de referência no financeiro).
                  </p>
                )}
                <div className="flex gap-2">
                  <button type="submit" disabled={submitting} className="btn-primary">
                    {submitting ? 'Enviando...' : 'Confirmar solicitação'}
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

      <div className="card dark:border-white/10">
        <h3 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">Extrato do mês (por conta)</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Cada linha mostra o valor variável por conta aprovada no mês. O bônus por faixa de meta é mensal e entra na
          previsão acima (não é rateado por linha).
        </p>
        {extrato.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma conta aprovada e conferida neste mês ainda.</p>
        ) : (
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-white/10 sticky top-0 bg-white dark:bg-gray-900">
                  <th className="pb-2 pr-4">Conta</th>
                  <th className="pb-2 pr-4">Origem</th>
                  <th className="pb-2 pr-4">Conferida em</th>
                  <th className="pb-2">Valor variável</th>
                </tr>
              </thead>
              <tbody>
                {extrato.map((row) => (
                  <tr key={`${row.source}-${row.id}`} className="border-b border-gray-100 dark:border-white/5">
                    <td className="py-2 pr-4 font-mono text-xs">{row.id.slice(0, 12)}…</td>
                    <td className="py-2 pr-4">{row.source === 'G2' ? 'Produção G2' : 'Produção'}</td>
                    <td className="py-2 pr-4">{new Date(row.validatedAt).toLocaleString('pt-BR')}</td>
                    <td className="py-2">
                      {row.valorVariavelConta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card dark:border-white/10">
        <h3 className="font-semibold mb-4 text-gray-900 dark:text-gray-100">Histórico de saques</h3>
        {data.withdrawals.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum saque registrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-white/10">
                  <th className="pb-2 pr-4">Data</th>
                  <th className="pb-2 pr-4">Valor líquido</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Canal</th>
                  <th className="pb-2">Ref. PIX</th>
                </tr>
              </thead>
              <tbody>
                {data.withdrawals.map((w) => (
                  <tr key={w.id} className="border-b border-gray-100 dark:border-white/5">
                    <td className="py-2 pr-4">
                      {new Date(w.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-2 pr-4">R$ {w.netValue.toLocaleString('pt-BR')}</td>
                    <td className="py-2 pr-4">{WITHDRAWAL_STATUS[w.status] || w.status}</td>
                    <td className="py-2 pr-4">{w.gateway}</td>
                    <td className="py-2 text-xs font-mono text-gray-600 dark:text-gray-400 max-w-[140px] truncate" title={w.accountId || undefined}>
                      {w.accountId || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card dark:border-white/10">
        <h3 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">Chave PIX para recebimento</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Cadastre a chave usada no pagamento de saques (CPF, e-mail, telefone ou chave aleatória). O financeiro
          pode usar este dado ao processar no Banco Inter.
        </p>
        <form onSubmit={handleSavePix} className="flex flex-wrap gap-3 items-end max-w-xl">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Chave PIX</label>
            <input
              type="text"
              value={pixInput}
              onChange={(e) => setPixInput(e.target.value)}
              className="input-field w-full"
              placeholder="Sua chave PIX"
              maxLength={120}
              autoComplete="off"
            />
          </div>
          <button type="submit" disabled={pixSaving} className="btn-primary">
            {pixSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </form>
      </div>

    </div>
  )
}
