import { AdsTrackerFinanceClient } from './AdsTrackerFinanceClient'

export default function AdsTrackerFinancePage() {
  return (
    <div className="space-y-4 text-zinc-100">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Overview financeiro (S2S + Google)</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Módulo 02 — KPIs com receita confirmada atribuída por GCLID, gastos reais das contas Google e sinais de caixa
          (pendências).
        </p>
      </div>
      <AdsTrackerFinanceClient />
    </div>
  )
}
