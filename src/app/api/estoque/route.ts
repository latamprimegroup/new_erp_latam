import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const createSchema = z.object({
  platform: z.enum(['GOOGLE_ADS', 'META_ADS', 'KWAI_ADS', 'TIKTOK_ADS', 'OTHER']),
  type: z.string().min(1),
  yearStarted: z.number().int().optional(),
  niche: z.string().optional(),
  minConsumed: z.number().optional(),
  purchasePrice: z.number().optional(),
  salePrice: z.number().optional(),
  markupPercent: z.number().optional(),
  description: z.string().optional(),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const status = searchParams.get('status')
  const platform = searchParams.get('platform')
  const archived = searchParams.get('archived') // 'true' = só arquivadas, 'false' ou omitido = só não arquivadas (venda)

  const where: Record<string, unknown> = { deletedAt: null }  // Soft delete: nunca mostrar excluídas
  if (type) where.type = type
  if (status) where.status = status
  if (platform) where.platform = platform
  if (archived === 'true') where.archivedAt = { not: null }
  else where.archivedAt = null  // Padrão: só contas disponíveis para venda

  const [accounts, criticalCount] = await Promise.all([
    prisma.stockAccount.findMany({
      where,
      include: { manager: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.stockAccount.count({ where: { status: 'CRITICAL' } }),
  ])

  const byStatus = await prisma.stockAccount.groupBy({
    by: ['status'],
    _count: { id: true },
  })

  return NextResponse.json({
    accounts,
    criticalCount,
    byStatus: byStatus.reduce((acc, x) => ({ ...acc, [x.status]: x._count.id }), {} as Record<string, number>),
  })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    const account = await prisma.stockAccount.create({
      data: {
        platform: data.platform as 'GOOGLE_ADS' | 'META_ADS' | 'KWAI_ADS' | 'TIKTOK_ADS' | 'OTHER',
        type: data.type,
        source: 'MANUAL',
        yearStarted: data.yearStarted,
        niche: data.niche || null,
        minConsumed: data.minConsumed,
        purchasePrice: data.purchasePrice,
        salePrice: data.salePrice,
        markupPercent: data.markupPercent,
        description: data.description || null,
      },
    })

    return NextResponse.json(account)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao cadastrar conta' }, { status: 500 })
  }
}
