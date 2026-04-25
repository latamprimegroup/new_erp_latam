/**
 * GET /api/cliente/pending-subscription
 *
 * Retorna dados do PIX pendente (se houver) para exibição no PaywallGate.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const cp = await prisma.clientProfile.findUnique({
    where:  { userId: session.user.id },
    select: { id: true },
  }).catch(() => null)

  if (!cp) return NextResponse.json(null)

  const sub = await prisma.subscription.findFirst({
    where:   { clientId: cp.id, status: { in: ['PAST_DUE', 'ACTIVE', 'TRIAL'] } },
    orderBy: { createdAt: 'desc' },
    select: {
      lastPixCopyPaste: true,
      lastPixExpiresAt: true,
      amount:           true,
      planName:         true,
      status:           true,
    },
  }).catch(() => null)

  if (!sub) return NextResponse.json(null)

  return NextResponse.json({
    pixCopyPaste:    sub.lastPixCopyPaste,
    lastPixExpiresAt: sub.lastPixExpiresAt,
    amount:          Number(sub.amount),
    planName:        sub.planName,
    status:          sub.status,
  })
}
