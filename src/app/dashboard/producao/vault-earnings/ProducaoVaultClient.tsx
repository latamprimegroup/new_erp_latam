'use client'

import { useCallback, useEffect, useState } from 'react'

type Live = {
  unitsProduction: number
  unitsElite: number
  provisionedProduction: string
  provisionedElite: string
  total: string
  config: { valorPorConta: number; bonusElite: number }
}

type LogLine = {
  kind: string
  occurredAt: string
  ref: string
  description: string
  amount: number
}

export function ProducaoVaultClient() {
  const [data, setData] = useState<{
    cycle: { id: string; openedAt: string }
    live: Live
    commissionLog?: { lines: LogLine[]; subtotalBase: number; subtotalElite: number; total: number }
  } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setErr(null)
    fetch('/api/financeiro/vault/payout-cycle')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setData(d)
      })
      .catch((e) => setErr(e.message || 'Erro'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function liquidar() {
    if (!confirm('Liquidar ciclo atual? Será gerado relatório e aberto novo período.')) return
    setClosing(true)
    try {
      const res = await fetch('/api/financeiro/vault/payout-cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert((d as { error?: string }).error || 'Erro')
        return
      }
      alert('Ciclo liquidado. Novo ciclo aberto.')
      load()
    } finally {
      setClosing(false)
    }
  }

  if (loading && !data) return <p className="text-gray-500 py-8">Carregando extrato Vault...</p>
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
  if (!data) return null

  const total = parseFloat(data.live.total) || 0
  const log = data.commissionLog

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="font-semibold mb-2">Ciclo aberto</h2>
        <p className="text-sm text-gray-600">Desde {new Date(data.cycle.openedAt).toLocaleString('pt-BR')}</p>
        <p className="text-xs text-gray-500 mt-1">ID: {data.cycle.id}</p>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-4">Provisão em tempo real (sincronizada com produção)</h2>
        <p className="text-sm text-gray-600 mb-4">
          Unidades G1 + G2 validadas no ciclo: {data.live.unitsProduction} × R${' '}
          {data.live.config.valorPorConta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </p>
        <p className="text-sm text-gray-600 mb-4">
          Bônus Elite (conta entregue há ≥24h e ativa): {data.live.unitsElite} × R${' '}
          {data.live.config.bonusElite.toLocaleString('pt-BR')}
        </p>
        <div className="text-2xl font-bold text-primary-600">
          Total estimado: R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </div>
        <p className="text-xs text-gray-500 mt-4">
          Provisões operacionais; o fechamento oficial de folha pode seguir o fluxo mensal do admin quando aplicável.
        </p>
        <button type="button" className="btn-primary mt-6" disabled={closing} onClick={liquidar}>
          {closing ? 'Processando...' : 'Liquidar ciclo'}
        </button>
      </div>

      {log && log.lines.length > 0 && (
        <div className="card overflow-x-auto">
          <h2 className="font-semibold mb-3">Extrato de comissões (detalhe)</h2>
          <p className="text-xs text-gray-500 mb-3">
            Cada linha explica um crédito do período: produção G1, G2 ou bônus Elite (24h).
          </p>
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">Data</th>
                <th className="pb-2">Tipo</th>
                <th className="pb-2">Ref.</th>
                <th className="pb-2">Motivo</th>
                <th className="pb-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {log.lines.map((l, i) => (
                <tr key={`${l.ref}-${i}`} className="border-b border-gray-100">
                  <td className="py-2 whitespace-nowrap">{new Date(l.occurredAt).toLocaleString('pt-BR')}</td>
                  <td className="py-2 font-mono text-xs">{l.kind}</td>
                  <td className="py-2 font-mono text-xs">{l.ref}</td>
                  <td className="py-2">{l.description}</td>
                  <td className="py-2 text-right font-medium">
                    R$ {l.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 text-sm space-y-1 border-t border-gray-200 pt-3">
            <p>
              Subtotal base (G1+G2): R$ {log.subtotalBase.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p>
              Subtotal Elite: R$ {log.subtotalElite.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="font-semibold">
              Total linhas: R$ {log.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}

      {log && log.lines.length === 0 && (
        <div className="card text-sm text-gray-500">Nenhuma unidade validada neste ciclo ainda.</div>
      )}
    </div>
  )
}
