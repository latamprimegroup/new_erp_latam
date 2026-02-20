import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

const STEP_TYPES = ['AQUECIMENTO_G2', 'DOMINIO_NICHO', 'AQUECIMENTO_CONTA', 'CLOAKER', 'PAGINA_WHITE', 'PAGINA_BLACK', 'YOUTUBE_CANAL', 'CRIATIVO_BLACK'] as const

const createSchema = z.object({
  niche: z.string().min(1),
  domain: z.string().optional(),
  stockAccountId: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const isPlugPlay = session.user?.role === 'PLUG_PLAY'
  const isAdmin = session.user?.role === 'ADMIN'

  if (!isPlugPlay && !isAdmin) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const collaboratorId = searchParams.get('collaboratorId')

  const where: { collaboratorId?: string; status?: string } = {}
  if (isPlugPlay) where.collaboratorId = session.user!.id!
  if (collaboratorId && isAdmin) where.collaboratorId = collaboratorId
  if (status) where.status = status

  const operations = await prisma.blackOperation.findMany({
    where,
    include: {
      collaborator: { select: { id: true, name: true, email: true } },
      steps: { orderBy: { createdAt: 'asc' } },
      payment: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(operations)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'PLUG_PLAY' && session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    const operation = await prisma.blackOperation.create({
      data: {
        collaboratorId: session.user!.id!,
        niche: data.niche,
        domain: data.domain || null,
        stockAccountId: data.stockAccountId || null,
      },
    })

    await prisma.blackOperationStep.createMany({
      data: STEP_TYPES.map((stepType) => ({
        operationId: operation.id,
        stepType,
      })),
    })

    const withSteps = await prisma.blackOperation.findUnique({
      where: { id: operation.id },
      include: { steps: true, collaborator: { select: { name: true, email: true } } },
    })

    await audit({
      userId: session.user!.id,
      action: 'black_operation_created',
      entity: 'BlackOperation',
      entityId: operation.id,
      details: { niche: data.niche },
    })

    return NextResponse.json(withSteps)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    throw err
  }
}
