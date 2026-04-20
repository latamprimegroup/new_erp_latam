import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { appPublicBaseUrl } from '@/lib/landing-vault/public-base-url'

/**
 * Simula um postback mínimo (como o teste admin) — só para ofertas criadas pelo próprio mentorado.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ offerId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const { offerId } = await params
  const link = await prisma.mentoradoShieldTrackerLink.findFirst({
    where: { clientId: client.id, offerId },
    include: { offer: { select: { postbackPublicToken: true } } },
  })
  if (!link) return NextResponse.json({ error: 'Oferta não encontrada ou sem permissão' }, { status: 404 })

  const base = appPublicBaseUrl() || process.env.NEXTAUTH_URL?.replace(/\/$/, '')
  if (!base) {
    return NextResponse.json(
      { error: 'Defina NEXT_PUBLIC_APP_URL ou NEXTAUTH_URL no servidor' },
      { status: 400 }
    )
  }

  const tx = `mentorado-test-${Date.now()}`
  const url = `${base}/api/public/tracker-offers/webhook/${encodeURIComponent(link.offer.postbackPublicToken)}`

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gclid: 'Cj0KCQiA_test_gclid_xxxxxxxxxxxx',
      amount: 9.9,
      currency: 'BRL',
      status: 'approved',
      transaction_id: tx,
    }),
  })

  const text = await r.text()
  return NextResponse.json({
    ok: r.ok,
    httpStatus: r.status,
    webhookUrl: url,
    responsePreview: text.slice(0, 400),
    transactionId: tx,
  })
}
