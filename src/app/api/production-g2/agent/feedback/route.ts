import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

const postSchema = z.object({
  producerId: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
})

/**
 * GET — Últimos comentários do gestor para o Agente G2.
 * Produtor: só os próprios. Admin/Finance/Gestor produção: ?producerId= opcional (default todos recentes misturados ou filtrar).
 */
export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER', 'FINANCE', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const filterProducerId = searchParams.get('producerId')

  const role = auth.session.user.role
  let where: { producerId?: string } = {}
  if (role === 'PRODUCER') {
    where = { producerId: auth.session.user.id }
  } else if (filterProducerId) {
    where = { producerId: filterProducerId }
  }

  const items = await prisma.g2ManagerFeedback.findMany({
    where,
    include: {
      author: { select: { id: true, name: true } },
      producer: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return NextResponse.json({ feedback: items })
}

/**
 * POST — Novo comentário do gestor para um produtor.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'FINANCE', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const { producerId, body: text } = postSchema.parse(body)

    const target = await prisma.user.findUnique({
      where: { id: producerId },
      select: { id: true, role: true },
    })
    if (!target) {
      return NextResponse.json({ error: 'Produtor não encontrado' }, { status: 404 })
    }
    if (target.role !== 'PRODUCER') {
      return NextResponse.json({ error: 'Destino deve ser um usuário produtor' }, { status: 400 })
    }

    const row = await prisma.g2ManagerFeedback.create({
      data: {
        producerId,
        authorId: auth.session.user.id,
        body: text,
      },
      include: {
        author: { select: { name: true } },
        producer: { select: { name: true } },
      },
    })

    await audit({
      userId: auth.session.user.id,
      action: 'g2_manager_feedback',
      entity: 'G2ManagerFeedback',
      entityId: row.id,
      details: { producerId },
    })

    return NextResponse.json(row)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: 'Erro ao gravar feedback' }, { status: 500 })
  }
}
