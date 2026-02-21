import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const unreadOnly = searchParams.get('unread') === 'true'

  const where: Record<string, unknown> = { userId: session.user!.id }
  if (unreadOnly) where.read = false

  const list = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const unreadCount = await prisma.notification.count({
    where: { userId: session.user!.id, read: false },
  })

  return NextResponse.json({ notifications: list, unreadCount })
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const { id, read } = body
  if (id) {
    await prisma.notification.updateMany({
      where: { id, userId: session.user!.id },
      data: { read: read ?? true },
    })
  } else {
    await prisma.notification.updateMany({
      where: { userId: session.user!.id },
      data: { read: true },
    })
  }
  return NextResponse.json({ ok: true })
}
