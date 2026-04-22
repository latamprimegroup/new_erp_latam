/**
 * GET /api/rma/vendor-qa
 * Dashboard de QA por Fornecedor:
 *   - Taxa de RMA (reposição) por vendor
 *   - Score de Confiança ajustado
 *   - Créditos devidos (ativos que o fornecedor nos deve)
 *   - Alerta de blacklist automático
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['ADMIN', 'PURCHASING', 'FINANCE'].includes(session.user.role ?? ''))
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  // Todos os fornecedores ativos com assets e RMAs
  const vendors = await prisma.vendor.findMany({
    where:   { OR: [{ active: true }, { suspended: true }] },
    include: {
      assets: { select: { id: true, status: true, costPrice: true, salePrice: true } },
      rmaTickets: {
        select: {
          id: true, status: true, isVendorFault: true,
          replacementCost: true, vendorCreditAmount: true,
          reason: true, openedAt: true, withinWarranty: true,
          hoursAfterDelivery: true,
        },
      },
    },
    orderBy: { rating: 'desc' },
  })

  const rows = vendors.map((v) => {
    const totalAssets   = v.assets.length
    const activeRMAs    = v.rmaTickets.filter((r) => !['REJECTED'].includes(r.status))
    const vendorFault   = activeRMAs.filter((r) => r.isVendorFault)

    const rmaRate       = totalAssets > 0 ? (vendorFault.length / totalAssets) * 100 : 0
    const avgHoursToFail = vendorFault.length > 0
      ? vendorFault.reduce((s, r) => s + (r.hoursAfterDelivery ?? 0), 0) / vendorFault.length
      : null

    // Créditos pendentes: RMAs isVendorFault sem status CREDITED ainda
    const pendingCredits = vendorFault
      .filter((r) => !['CREDITED', 'REJECTED'].includes(r.status))
      .reduce((s, r) => s + Number(r.vendorCreditAmount ?? 0), 0)

    // Total créditos já liquidados
    const liquidatedCredits = vendorFault
      .filter((r) => r.status === 'CREDITED')
      .reduce((s, r) => s + Number(r.vendorCreditAmount ?? 0), 0)

    // Custo total de garantia gerado por este fornecedor
    const totalWarrantyCost = vendorFault
      .reduce((s, r) => s + Number(r.replacementCost ?? 0), 0)

    // Score de Confiança ajustado (rating original - penalização por RMA rate)
    const trustScore = Math.max(1, Math.round(v.rating - (rmaRate / 10) * 3))

    // Motivos mais frequentes
    const reasonCounts: Record<string, number> = {}
    for (const r of activeRMAs) {
      reasonCounts[r.reason] = (reasonCounts[r.reason] ?? 0) + 1
    }
    const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    // Valor total de compras (investimento neste vendor)
    const totalPurchased = v.assets.reduce((s, a) => s + Number(a.costPrice), 0)
    const availableValue = v.assets.filter((a) => a.status === 'AVAILABLE').reduce((s, a) => s + Number(a.salePrice), 0)

    return {
      id:             v.id,
      name:           v.name,
      rating:         v.rating,
      trustScore,
      suspended:      v.suspended,
      suspendedReason: v.suspendedReason,
      suspendedAt:    v.suspendedAt,
      category:       v.category,
      totalAssets,
      soldAssets:     v.assets.filter((a) => ['SOLD', 'DELIVERED'].includes(a.status)).length,
      availableAssets: v.assets.filter((a) => a.status === 'AVAILABLE').length,
      totalPurchased,
      availableValue,
      totalRMA:       activeRMAs.length,
      vendorFaultRMA: vendorFault.length,
      rmaRate:        parseFloat(rmaRate.toFixed(2)),
      avgHoursToFail,
      pendingCredits,
      liquidatedCredits,
      totalWarrantyCost,
      topReason,
      alert: rmaRate >= 30 ? 'BLACKLIST' : rmaRate >= 10 ? 'WARNING' : 'OK',
    }
  })

  // Totais consolidados
  const summary = {
    totalVendors:          rows.length,
    suspendedVendors:      rows.filter((r) => r.suspended).length,
    totalPendingCredits:   rows.reduce((s, r) => s + r.pendingCredits, 0),
    totalWarrantyCost:     rows.reduce((s, r) => s + r.totalWarrantyCost, 0),
    vendorsInAlert:        rows.filter((r) => r.alert !== 'OK').length,
    avgRmaRate:            rows.length > 0 ? rows.reduce((s, r) => s + r.rmaRate, 0) / rows.length : 0,
  }

  return NextResponse.json({ vendors: rows, summary })
}
