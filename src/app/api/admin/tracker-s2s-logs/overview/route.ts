import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'FINANCE'] as const

/**
 * GET — KPIs Módulo 10 (janela temporal por updatedAt do sinal).
 */
export async function GET(req: Request) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const hours = Math.min(168, Math.max(1, Number(searchParams.get('hours') || '72') || 72))
  const since = new Date(Date.now() - hours * 60 * 60 * 1000)
  const graceEnd = new Date(Date.now() - 60_000)

  const base = { updatedAt: { gte: since } }

  const [webhooksReceived, attributed, orphans] = await Promise.all([
    prisma.trackerOfferSaleSignal.count({ where: base }),
    prisma.trackerOfferSaleSignal.count({
      where: {
        ...base,
        AND: [{ gclid: { not: null } }, { NOT: { gclid: '' } }],
      },
    }),
    prisma.trackerOfferSaleSignal.count({
      where: {
        ...base,
        createdAt: { lte: graceEnd },
        OR: [{ gclid: null }, { gclid: '' }],
      },
    }),
  ])

  return NextResponse.json({
    hours,
    webhooksReceived,
    attributedConversions: attributed,
    orphanSignals: orphans,
    delayedMatchSeconds: 60,
    note: 'Órfãos: sem GCLID após 60s desde a criação do sinal (janela filtra por atividade recente no postback).',
  })
}
