import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const { id } = await params
  const row = await prisma.mentoradoShieldTrackerLink.findFirst({
    where: { id, clientId: client.id },
    select: { offerId: true },
  })
  if (!row) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  await prisma.trackerOffer.delete({ where: { id: row.offerId } })

  return NextResponse.json({ ok: true })
}
