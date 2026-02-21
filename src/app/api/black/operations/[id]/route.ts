import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

const updateSchema = z.object({
  domain: z.string().optional(),
  status: z.enum(['DRAFT', 'EM_AQUECIMENTO', 'EM_CONFIG', 'LIVE', 'SURVIVED_24H', 'BANNED']).optional(),
  wentLiveAt: z.string().datetime().optional().nullable(),
  bannedAt: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
})

const stepSchema = z.object({
  stepType: z.enum(['AQUECIMENTO_G2', 'DOMINIO_NICHO', 'AQUECIMENTO_CONTA', 'CLOAKER', 'PAGINA_WHITE', 'PAGINA_BLACK', 'YOUTUBE_CANAL', 'CRIATIVO_BLACK']),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'DONE']).optional(),
  notes: z.string().optional(),
})

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const op = await prisma.blackOperation.findUnique({
    where: { id },
    include: {
      collaborator: { select: { id: true, name: true, email: true } },
      steps: { orderBy: { createdAt: 'asc' } },
      payment: true,
    },
  })

  if (!op) return NextResponse.json({ error: 'Operação não encontrada' }, { status: 404 })

  const isOwner = op.collaboratorId === session.user!.id
  if (!isOwner && session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  return NextResponse.json(op)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const op = await prisma.blackOperation.findUnique({ where: { id } })
  if (!op) return NextResponse.json({ error: 'Operação não encontrada' }, { status: 404 })

  const isOwner = op.collaboratorId === session.user!.id
  if (!isOwner && session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()

    if (body.stepType) {
      const { stepType, status, notes } = stepSchema.parse(body)
      const step = await prisma.blackOperationStep.upsert({
        where: { operationId_stepType: { operationId: id, stepType } },
        create: {
          operationId: id,
          stepType,
          status: status || 'DONE',
          completedAt: status === 'DONE' ? new Date() : null,
          notes: notes || null,
        },
        update: {
          ...(status && { status }),
          ...(status === 'DONE' && { completedAt: new Date() }),
          ...(notes !== undefined && { notes }),
        },
      })

      if (stepType === 'CRIATIVO_BLACK' && status === 'DONE') {
        await prisma.blackOperation.update({
          where: { id },
          data: { wentLiveAt: new Date(), status: 'LIVE' },
        })
      }

      const updated = await prisma.blackOperation.findUnique({
        where: { id },
        include: { steps: true },
      })
      return NextResponse.json(updated)
    }

    const data = updateSchema.parse(body)
    const updateData: Record<string, unknown> = {}
    if (data.domain !== undefined) updateData.domain = data.domain
    if (data.status !== undefined) updateData.status = data.status
    if (data.wentLiveAt !== undefined) updateData.wentLiveAt = data.wentLiveAt ? new Date(data.wentLiveAt) : null
    if (data.bannedAt !== undefined) updateData.bannedAt = data.bannedAt ? new Date(data.bannedAt) : null
    if (data.notes !== undefined) updateData.notes = data.notes

    const updated = await prisma.blackOperation.update({
      where: { id },
      data: updateData,
      include: {
        collaborator: { select: { id: true, name: true, email: true } },
        steps: true,
        payment: true,
      },
    })

    await audit({
      userId: session.user!.id,
      action: 'black_operation_updated',
      entity: 'BlackOperation',
      entityId: id,
      details: data,
    })

    return NextResponse.json(updated)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    throw err
  }
}
