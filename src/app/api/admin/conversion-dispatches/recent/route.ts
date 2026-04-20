import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'FINANCE'] as const

export async function GET(req: Request) {
  const auth = await requireRoles([...READ_ROLES])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const take = Math.min(50, Math.max(1, parseInt(searchParams.get('take') || '10', 10) || 10))

  const rows = await prisma.trackerConversionDispatch.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      rule: { select: { name: true, slug: true } },
      saleSignal: { select: { id: true, platformOrderId: true, amountGross: true } },
    },
  })

  return NextResponse.json({
    dispatches: rows.map((d) => ({
      id: d.id,
      ruleName: d.rule.name,
      ruleSlug: d.rule.slug,
      status: d.status,
      matchKind: d.matchKind,
      organic: d.matchKind === 'ORGANIC_NO_GCLID',
      gclidOk: d.matchKind === 'PAID_GCLID',
      valueComputed: d.valueComputed?.toFixed(2) ?? null,
      currency: d.currency,
      errorMessage: d.errorMessage,
      saleSignalId: d.saleSignalId,
      orderHint: d.saleSignal?.platformOrderId ?? d.saleSignal?.id ?? null,
      createdAt: d.createdAt.toISOString(),
      processedAt: d.processedAt?.toISOString() ?? null,
    })),
  })
}
