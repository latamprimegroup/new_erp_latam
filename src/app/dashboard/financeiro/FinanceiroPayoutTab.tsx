'use client'

import { useCallback, useEffect, useState } from 'react'

type Row = {
  userId: string
  name: string
  email: string
  cycleId: string
  openedAt: string
  unitsProduction: number
  unitsElite: number
  total: string
  totalNumber: number
}

export function FinanceiroPayoutTab({ onPayoutLiquidated }: { onPayoutLiquidated?: () => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setErr(null)
    fetch('/api/financeiro/payout-queue')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setRows(d.producers || [])
      })
      .catch((e) => setErr(e.message || 'Erro'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function liquidar(userId: string, name: string) {
    if (
      !confirm(
        `Liquidar pagamento de ${name}? O ciclo Vault será fechado, comprovante gerado e despesa FOLHA_PRODUCAO lançada (se valor > 0).`
      )
    ) {
      return
    }
    setBusyId(userId)
    try {
      const res = await fetch('/api/financeiro/payout-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert((d as { error?: string }).error || 'Erro')
        return
      }
      const blob = new Blob([JSON.stringify((d as { comprovante: unknown }).comprovante, null, 2)], {
        type: 'application/json',
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `comprovante_folha_${userId.slice(-8)}_${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      onPayoutLiquidated?.()
      load()
    } finally {
      setBusyId(null)
    }
  }

  if (loading && rows.length === 0) {
    return <p className="text-gray-500 py-6">Carregando fila de folha...</p>
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

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Visão financeira da provisão acumulada por produtor (G1/G2 + Elite 24h) no ciclo Vault aberto. O colaborador vê
        o detalhe em <strong>Produção → Extrato Vault</strong>. Aqui você <strong>liquida o pagamento</strong>, gera o
        comprovante e registra a saída no caixa.
      </p>
      <div className="overflow-x-auto card">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-gray-500 border-b dark:border-gray-700">
              <th className="pb-2 pr-2">Colaborador</th>
              <th className="pb-2 pr-2">Ciclo desde</th>
              <th className="pb-2 pr-2">Unidades</th>
              <th className="pb-2 pr-2">Elite 24h</th>
              <th className="pb-2 pr-2">Provisão total</th>
              <th className="pb-2 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-3 pr-2">
                  <span className="font-medium">{r.name}</span>
                  <span className="block text-xs text-gray-500">{r.email}</span>
                </td>
                <td className="py-3 pr-2 text-xs whitespace-nowrap">
                  {new Date(r.openedAt).toLocaleString('pt-BR')}
                </td>
                <td className="py-3 pr-2">{r.unitsProduction}</td>
                <td className="py-3 pr-2">{r.unitsElite}</td>
                <td className="py-3 pr-2 font-semibold">
                  R$ {r.totalNumber.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 text-right">
                  <button
                    type="button"
                    className="btn-primary text-xs py-1.5 px-3"
                    disabled={busyId === r.userId}
                    onClick={() => liquidar(r.userId, r.name)}
                  >
                    {busyId === r.userId ? '...' : 'Liquidar pagamento'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="text-gray-500 text-sm p-4">Nenhum produtor cadastrado.</p>}
      </div>
    </div>
  )
}
