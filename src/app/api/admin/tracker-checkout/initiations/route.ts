import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'FINANCE'] as const

export async function GET(req: Request) {
  const auth = await requireRoles([...READ_ROLES])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const offerId = searchParams.get('offerId')?.trim()
  const take = Math.min(200, Math.max(1, parseInt(searchParams.get('take') || '60', 10) || 60))

  const rows = await prisma.trackerCheckoutInitiation.findMany({
    where: offerId ? { offerId } : undefined,
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      offer: { select: { id: true, name: true, platform: true } },
    },
  })

  return NextResponse.json({
    initiations: rows.map((r) => ({
      id: r.id,
      offerId: r.offerId,
      offerName: r.offer?.name ?? null,
      offerPlatform: r.offer?.platform ?? null,
      sourceIp: r.sourceIp,
      fromGoogleAds: r.fromGoogleAds,
      outcome: r.outcome,
      viaEphemeralToken: r.viaEphemeralToken,
      paySlugOrToken: r.paySlugOrToken,
      createdAt: r.createdAt.toISOString(),
    })),
  })
}
