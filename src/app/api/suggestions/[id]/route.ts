import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.suggestion.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Sugestão não encontrada' }, { status: 404 })

  try {
    const body = await req.json()
    const data = patchSchema.parse(body)
    const update: Record<string, string> = {}
    if (data.title !== undefined) update.title = data.title.trim()
    if (data.description !== undefined) update.description = data.description.trim()
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
    }

    const suggestion = await prisma.suggestion.update({
      where: { id },
      data: update,
      include: { user: { select: { name: true, email: true } } },
    })

    await audit({
      userId: session.user.id,
      action: 'suggestion_updated',
      entity: 'Suggestion',
      entityId: id,
    })

    return NextResponse.json(suggestion)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.suggestion.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Sugestão não encontrada' }, { status: 404 })

  await prisma.suggestion.delete({ where: { id } })

  await audit({
    userId: session.user.id,
    action: 'suggestion_deleted',
    entity: 'Suggestion',
    entityId: id,
  })

  return NextResponse.json({ ok: true })
}
