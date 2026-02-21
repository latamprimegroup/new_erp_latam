import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const CHECKLIST_STEPS = [
  'EMAIL_OK',
  'CNPJ_OK',
  'PAGAMENTO_OK',
  'PLATAFORMA_CRIADA',
  'DADOS_VERIFICADOS',
] as const

const toggleSchema = z.object({
  accountId: z.string().min(1),
  stepType: z.enum(CHECKLIST_STEPS),
  completed: z.boolean(),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const accountId = req.nextUrl.searchParams.get('accountId')
  if (!accountId) return NextResponse.json({ error: 'accountId obrigatório' }, { status: 400 })

  const account = await prisma.productionAccount.findFirst({
    where: { id: accountId },
    include: { checklist: true },
  })
  if (!account) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })

  const isProducer = account.producerId === session.user?.id
  const isAdmin = session.user?.role === 'ADMIN'
  if (!isProducer && !isAdmin) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  // Garantir steps padrão
  const existing = account.checklist.map((c) => c.stepType)
  for (const step of CHECKLIST_STEPS) {
    if (!existing.includes(step)) {
      await prisma.productionChecklist.create({
        data: { accountId, stepType: step, completed: false },
      })
    }
  }

  const checklist = await prisma.productionChecklist.findMany({
    where: { accountId },
    orderBy: { stepType: 'asc' },
  })

  return NextResponse.json({ checklist })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const body = await req.json()
    const { accountId, stepType, completed } = toggleSchema.parse(body)

    const account = await prisma.productionAccount.findFirst({
      where: { id: accountId },
    })
    if (!account) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
    if (account.producerId !== session.user?.id) {
      return NextResponse.json({ error: 'Só o produtor pode atualizar o checklist' }, { status: 403 })
    }
    if (account.status !== 'PENDING') {
      return NextResponse.json({ error: 'Checklist só pode ser editado para contas pendentes' }, { status: 400 })
    }

    const item = await prisma.productionChecklist.upsert({
      where: {
        accountId_stepType: { accountId, stepType },
      },
      create: {
        accountId,
        stepType,
        completed,
        completedAt: completed ? new Date() : null,
      },
      update: {
        completed,
        completedAt: completed ? new Date() : null,
      },
    })

    return NextResponse.json(item)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    throw e
  }
}
