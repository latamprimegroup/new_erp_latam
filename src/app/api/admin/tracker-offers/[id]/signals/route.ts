import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'FINANCE'] as const

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...READ_ROLES])
  if (!auth.ok) return auth.response

  const { id: offerId } = await params
  const offer = await prisma.trackerOffer.findUnique({ where: { id: offerId } })
  if (!offer) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const take = Math.min(100, Math.max(1, parseInt(searchParams.get('take') || '40', 10) || 40))

  const rows = await prisma.trackerOfferSaleSignal.findMany({
    where: { offerId },
    orderBy: { createdAt: 'desc' },
    take,
  })

  return NextResponse.json({
    signals: rows.map((s) => ({
      id: s.id,
      amountGross: s.amountGross.toFixed(2),
      currency: s.currency,
      paymentState: s.paymentState,
      gclidPresent: Boolean(s.gclid),
      countedForRevenue: s.countedForRevenue,
      ipTrust: s.ipTrust,
      signatureValid: s.signatureValid,
      googleOfflineSentAt: s.googleOfflineSentAt?.toISOString() ?? null,
      googleOfflineError: s.googleOfflineError,
      createdAt: s.createdAt.toISOString(),
    })),
  })
}
