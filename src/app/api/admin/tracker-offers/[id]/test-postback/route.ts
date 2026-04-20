import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { appPublicBaseUrl } from '@/lib/landing-vault/public-base-url'

const WRITE_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const

/**
 * Simula um postback S2S mínimo (valor + id de transação + gclid formato válido).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...WRITE_ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const offer = await prisma.trackerOffer.findUnique({ where: { id } })
  if (!offer) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const base = appPublicBaseUrl() || process.env.NEXTAUTH_URL?.replace(/\/$/, '')
  if (!base) {
    return NextResponse.json(
      { error: 'Defina NEXT_PUBLIC_APP_URL ou NEXTAUTH_URL para teste servidor-a-servidor' },
      { status: 400 }
    )
  }

  const tx = `erp-test-${Date.now()}`
  const url = `${base}/api/public/tracker-offers/webhook/${encodeURIComponent(offer.postbackPublicToken)}`

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
