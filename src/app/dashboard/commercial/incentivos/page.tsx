import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getMonthlyIncentiveExtract } from '@/lib/incentive-engine'

type IncentiveRow = {
  orderId: string
  paidAt: string | null
  sellerId: string | null
  sellerName: string | null
  grossBrl: number
  supplierCostBrl: number
  sellerCommissionBrl: number
  managerCommissionBrl: number
  netProfitBrl: number
  sellerMetaUnlocked: boolean
  paymentMethod: string | null
}

function asNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return Number.parseFloat(v) || 0
  if (v instanceof Prisma.Decimal) return Number(v.toString())
  if (v && typeof v === 'object' && 'toString' in v) return Number((v as { toString: () => string }).toString())
  return 0
}

export default async function ComercialIncentivosPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (!['ADMIN', 'COMMERCIAL', 'FINANCE'].includes(session.user?.role || '')) redirect('/dashboard')

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const sellerId =
    session.user.role === 'COMMERCIAL'
      ? session.user.id
      : undefined
  const extract = await getMonthlyIncentiveExtract({ month, year, sellerId, limit: 200 })
  const rows = extract.rows.map((row) => ({
    ...row,
    grossBrl: asNumber(row.grossBrl),
    supplierCostBrl: asNumber(row.supplierCostBrl),
    sellerCommissionBrl: asNumber(row.sellerCommissionBrl),
    managerCommissionBrl: asNumber(row.managerCommissionBrl),
    netProfitBrl: asNumber(row.netProfitBrl),
  })) as IncentiveRow[]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="heading-1">Extrato de Incentivos</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Auditoria de comissionamento por venda aprovada (vendedor, gerente e lucro líquido).
        </p>
      </div>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum registro de incentivo encontrado no período.</p>
        ) : (
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                <th className="py-2 pr-3">Pedido</th>
                <th className="py-2 pr-3">Pago em</th>
                <th className="py-2 pr-3">Vendedor</th>
                <th className="py-2 pr-3">Bruto</th>
                <th className="py-2 pr-3">Custo Ativo</th>
                <th className="py-2 pr-3">Comissão Vendedor</th>
                <th className="py-2 pr-3">Comissão Gerente</th>
                <th className="py-2 pr-3">Lucro Líquido</th>
                <th className="py-2 pr-3">Meta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.orderId} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 pr-3 font-mono text-xs">{r.orderId.slice(0, 8)}</td>
                  <td className="py-2 pr-3 text-xs">
                    {r.paidAt ? new Date(r.paidAt).toLocaleString('pt-BR') : '—'}
                  </td>
                  <td className="py-2 pr-3">{r.sellerName || '—'}</td>
                  <td className="py-2 pr-3 font-medium">
                    {r.grossBrl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="py-2 pr-3">
                    {r.supplierCostBrl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="py-2 pr-3">
                    {r.sellerCommissionBrl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="py-2 pr-3">
                    {r.managerCommissionBrl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="py-2 pr-3 font-semibold text-emerald-700 dark:text-emerald-300">
                    {r.netProfitBrl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {r.sellerMetaUnlocked ? 'Liberada' : 'Bloqueada'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
