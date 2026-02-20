import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDailyTasksForUser } from '@/lib/notifications/daily-tasks'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/notifications/digest
 * Retorna tarefas do dia para o usuário logado
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, role: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
  }

  const tasks = await getDailyTasksForUser(user.id, user.role, user.name || undefined)
  return NextResponse.json(tasks)
}
