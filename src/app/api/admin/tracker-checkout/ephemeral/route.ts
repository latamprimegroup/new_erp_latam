import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { appPublicBaseUrl } from '@/lib/landing-vault/public-base-url'

const WRITE_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const

export async function POST(req: Request) {
  const auth = await requireRoles([...WRITE_ROLES])
  if (!auth.ok) return auth.response

  let body: { offerId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const offerId = typeof body.offerId === 'string' ? body.offerId.trim() : ''
  if (!offerId) return NextResponse.json({ error: 'offerId obrigatório' }, { status: 400 })

  const offer = await prisma.trackerOffer.findUnique({ where: { id: offerId } })
  if (!offer) return NextResponse.json({ error: 'Oferta não encontrada' }, { status: 404 })

  const settings = await prisma.trackerCheckoutSettings.findUnique({ where: { offerId } })
  const ttlMin = settings?.ephemeralTtlMinutes ?? 60
  const maxUses = settings?.ephemeralMaxUses ?? 1

  const token = randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + ttlMin * 60_000)

  await prisma.trackerCheckoutAccessToken.create({
    data: {
      offerId,
      token,
      expiresAt,
      maxUses,
      useCount: 0,
    },
  })

  const base = appPublicBaseUrl()
  const url = base ? `${base}/pay/t/${token}` : `/pay/t/${token}`

  return NextResponse.json({ token, url, expiresAt: expiresAt.toISOString(), maxUses })
}
