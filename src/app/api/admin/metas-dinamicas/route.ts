/**
 * GET - Metas dinâmicas sugeridas
 */
import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response
  const now = new Date()
  const start3m = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  const [producaoCount, orders, metaSetting] = await Promise.all([
    prisma.productionG2.count({
      where: {
        deletedAt: null,
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        validatedAt: { not: null, gte: start3m },
      },
    }),
    prisma.order.findMany({
      where: { status: 'DELIVERED', paidAt: { not: null, gte: start3m } },
      select: { value: true },
    }),
    prisma.systemSetting.findUnique({ where: { key: 'producao_meta_mensal' } }),
  ])
  const mediaProducao = producaoCount / 3
  const mediaVendas = orders.reduce((s, o) => s + Number(o.value), 0) / 3
  const metaAtual = metaSetting ? parseInt(metaSetting.value, 10) : 330
  return NextResponse.json({
    producao: {
      historico3m: producaoCount,
      mediaMensal: Math.round(mediaProducao),
      metaAtual,
      sugerida: Math.round(mediaProducao * 1.05),
    },
    vendas: { mediaMensal: mediaVendas, sugerida: Math.round(mediaVendas * 1.05 * 100) / 100 },
    margem: { sugerida: 25 },
    retencao: { sugerida: 85 },
  })
}
