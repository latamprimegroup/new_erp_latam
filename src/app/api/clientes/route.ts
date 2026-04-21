import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const PAGE_SIZE = 20

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'COMMERCIAL', 'DELIVERER', 'PRODUCER', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const status = searchParams.get('status') ?? ''
  const tag = searchParams.get('tag') ?? ''

  const where: Record<string, unknown> = {}

  if (status) where.clientStatus = status
  // MySQL não suporta has em JSON nativo via Prisma — usamos string_contains no campo serializado
  if (tag) where.segmentationTags = { string_contains: tag }

  if (q.length > 0) {
    const cleanDigits = q.replace(/\D/g, '')
    const orClauses: Record<string, unknown>[] = [
      { user: { name: { contains: q, mode: 'insensitive' } } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
      { companyName: { contains: q, mode: 'insensitive' } },
      { clientCode: { contains: q, mode: 'insensitive' } },
      { whatsapp: { contains: q } },
    ]
    if (cleanDigits.length >= 3) {
      orClauses.push({ taxId: { contains: cleanDigits } })
    }
    where.OR = orClauses
  }

  const [total, clients] = await Promise.all([
    prisma.clientProfile.count({ where }),
    prisma.clientProfile.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } },
        metrics: {
          select: {
            ltvReal: true,
            ltvProjetado12m: true,
            revenueTotal: true,
            churnRisk: true,
            ticketMedio: true,
            diasSemCompra: true,
          },
        },
        accountManager: { select: { id: true, name: true } },
      },
      orderBy: { user: { name: 'asc' } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ])

  return NextResponse.json({
    clients,
    total,
    page,
    pages: Math.ceil(total / PAGE_SIZE),
  })
}
