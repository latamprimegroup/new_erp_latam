/**
 * GET /api/rma/vendor-qa
 * Dashboard de QA e Inteligência de Fornecedores:
 *   - Taxa de Sobrevivência: % ativos não-caídos nos primeiros 7/15/30 dias
 *   - LTV por Fornecedor: receita por ativo vendido vs custo de reposição
 *   - Índice de Substituição: custo real de reposições por ativo comprado
 *   - Score de Confiança ajustado por RMA rate
 *   - Créditos devidos (o que o fornecedor nos deve)
 *   - Alerta FORNECEDOR CRÍTICO / STOP LOSS automático
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'

const ALLOWED = ['ADMIN', 'PURCHASING', 'FINANCE']

// Limiar de stop-loss configurável (% de RMA por culpa do fornecedor)
const STOP_LOSS_THRESHOLD = parseInt(process.env.VENDOR_STOP_LOSS_PCT ?? '30', 10)
const WARNING_THRESHOLD   = parseInt(process.env.VENDOR_WARNING_PCT  ?? '10', 10)

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !ALLOWED.includes(session.user.role ?? ''))
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  // Carrega todos os fornecedores ativos/suspensos com ativos e RMAs
  const vendors = await prisma.vendor.findMany({
    where:   { OR: [{ active: true }, { suspended: true }] },
    include: {
      assets: {
        select: {
          id: true, status: true, costPrice: true, salePrice: true,
          deliveredAt: true, soldAt: true,
        },
      },
      rmaTickets: {
        select: {
          id: true, status: true, isVendorFault: true,
          replacementCost: true, vendorCreditAmount: true,
          reason: true, openedAt: true, withinWarranty: true,
          hoursAfterDelivery: true, originalAssetId: true,
        },
      },
    },
    orderBy: { rating: 'desc' },
  })

  const rows = vendors.map((v) => {
    const totalAssets   = v.assets.length
    const activeRMAs    = v.rmaTickets.filter((r) => !['REJECTED'].includes(r.status))
    const vendorFault   = activeRMAs.filter((r) => r.isVendorFault)

    const rmaRate = totalAssets > 0 ? (vendorFault.length / totalAssets) * 100 : 0

    // ── Taxa de Sobrevivência por janela temporal ─────────────────────────────
    // Ativos com data de entrega (foram entregues e temos rastreio)
    const deliveredAssets = v.assets.filter((a) => a.deliveredAt != null)
    const nDelivered = deliveredAssets.length

    const faultIds7  = new Set(vendorFault.filter((r) => (r.hoursAfterDelivery ?? 9999) <= 168).map((r) => r.originalAssetId))
    const faultIds15 = new Set(vendorFault.filter((r) => (r.hoursAfterDelivery ?? 9999) <= 360).map((r) => r.originalAssetId))
    const faultIds30 = new Set(vendorFault.filter((r) => (r.hoursAfterDelivery ?? 9999) <= 720).map((r) => r.originalAssetId))

    const survivorRate7d  = nDelivered > 0 ? ((nDelivered - faultIds7.size)  / nDelivered) * 100 : null
    const survivorRate15d = nDelivered > 0 ? ((nDelivered - faultIds15.size) / nDelivered) * 100 : null
    const survivorRate30d = nDelivered > 0 ? ((nDelivered - faultIds30.size) / nDelivered) * 100 : null

    // ── Métricas financeiras ──────────────────────────────────────────────────
    const totalPurchased    = v.assets.reduce((s, a) => s + Number(a.costPrice), 0)
    const totalRevenue      = v.assets
      .filter((a) => ['SOLD', 'DELIVERED'].includes(a.status))
      .reduce((s, a) => s + Number(a.salePrice), 0)
    const availableValue    = v.assets.filter((a) => a.status === 'AVAILABLE').reduce((s, a) => s + Number(a.salePrice), 0)
    const soldCount         = v.assets.filter((a) => ['SOLD', 'DELIVERED'].includes(a.status)).length

    const totalWarrantyCost = vendorFault.reduce((s, r) => s + Number(r.replacementCost ?? 0), 0)

    // Índice de Substituição = custo total de reposições / total comprado (%)
    const replacementIndex  = totalPurchased > 0 ? (totalWarrantyCost / totalPurchased) * 100 : 0

    // LTV efetivo por ativo = (receita gerada - custo de reposição) / ativos vendidos
    const effectiveLtvPerAsset = soldCount > 0
      ? (totalRevenue - totalWarrantyCost) / soldCount
      : null

    // Créditos pendentes e liquidados
    const pendingCredits    = vendorFault
      .filter((r) => !['CREDITED', 'REJECTED'].includes(r.status))
      .reduce((s, r) => s + Number(r.vendorCreditAmount ?? 0), 0)
    const liquidatedCredits = vendorFault
      .filter((r) => r.status === 'CREDITED')
      .reduce((s, r) => s + Number(r.vendorCreditAmount ?? 0), 0)

    // Tempo médio de falha
    const avgHoursToFail = vendorFault.length > 0
      ? vendorFault.reduce((s, r) => s + (r.hoursAfterDelivery ?? 0), 0) / vendorFault.length
      : null

    // Score de Confiança ajustado (rating original - penalização por RMA rate)
    const trustScore = Math.max(1, Math.round(v.rating - (rmaRate / 10) * 3))

    // Motivo mais frequente
    const reasonCounts: Record<string, number> = {}
    for (const r of activeRMAs) reasonCounts[r.reason] = (reasonCounts[r.reason] ?? 0) + 1
    const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    // Nível de alerta
    const alert: 'BLACKLIST' | 'WARNING' | 'OK' =
      rmaRate >= STOP_LOSS_THRESHOLD ? 'BLACKLIST' :
      rmaRate >= WARNING_THRESHOLD   ? 'WARNING'   : 'OK'

    return {
      id:               v.id,
      name:             v.name,
      category:         v.category,
      rating:           v.rating,
      trustScore,
      suspended:        v.suspended,
      suspendedReason:  v.suspendedReason,
      suspendedAt:      v.suspendedAt,
      totalAssets,
      soldAssets:       soldCount,
      availableAssets:  v.assets.filter((a) => a.status === 'AVAILABLE').length,
      deliveredAssets:  nDelivered,
      totalPurchased,
      totalRevenue,
      availableValue,
      // Sobrevivência
      survivorRate7d:   survivorRate7d  !== null ? parseFloat(survivorRate7d.toFixed(1))  : null,
      survivorRate15d:  survivorRate15d !== null ? parseFloat(survivorRate15d.toFixed(1)) : null,
      survivorRate30d:  survivorRate30d !== null ? parseFloat(survivorRate30d.toFixed(1)) : null,
      // RMA
      totalRMA:         activeRMAs.length,
      vendorFaultRMA:   vendorFault.length,
      rmaRate:          parseFloat(rmaRate.toFixed(2)),
      avgHoursToFail,
      // Financeiro
      totalWarrantyCost,
      replacementIndex: parseFloat(replacementIndex.toFixed(2)),
      effectiveLtvPerAsset: effectiveLtvPerAsset !== null ? parseFloat(effectiveLtvPerAsset.toFixed(2)) : null,
      pendingCredits,
      liquidatedCredits,
      topReason,
      alert,
    }
  })

  // Ordena: suspensos primeiro, depois por alert level, depois por rmaRate desc
  rows.sort((a, b) => {
    if (a.suspended !== b.suspended) return a.suspended ? -1 : 1
    const alertOrder = { BLACKLIST: 0, WARNING: 1, OK: 2 }
    if (alertOrder[a.alert] !== alertOrder[b.alert]) return alertOrder[a.alert] - alertOrder[b.alert]
    return b.rmaRate - a.rmaRate
  })

  const summary = {
    totalVendors:        rows.length,
    suspendedVendors:    rows.filter((r) => r.suspended).length,
    criticalVendors:     rows.filter((r) => r.alert === 'BLACKLIST').length,
    warningVendors:      rows.filter((r) => r.alert === 'WARNING').length,
    totalPendingCredits: rows.reduce((s, r) => s + r.pendingCredits, 0),
    totalWarrantyCost:   rows.reduce((s, r) => s + r.totalWarrantyCost, 0),
    avgRmaRate:          rows.length > 0 ? rows.reduce((s, r) => s + r.rmaRate, 0) / rows.length : 0,
    stopLossThreshold:   STOP_LOSS_THRESHOLD,
    warningThreshold:    WARNING_THRESHOLD,
  }

  return NextResponse.json({ vendors: rows, summary })
}
