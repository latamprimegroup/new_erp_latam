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
  markupPercent: z.number().optional(),
  supplierId: z.string().optional(),
  description: z.string().optional(),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'MANAGER') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const manager = await prisma.managerProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!manager) return NextResponse.json({ error: 'Perfil de gestor não encontrado' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const where: Record<string, unknown> = { managerId: manager.id }
  if (status) where.status = status

  const accounts = await prisma.stockAccount.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(accounts)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'MANAGER') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const manager = await prisma.managerProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!manager) return NextResponse.json({ error: 'Perfil de gestor não encontrado' }, { status: 404 })

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    const purchasePrice = data.purchasePrice ?? 0
    const markup = (data.markupPercent ?? 0) / 100
    const salePrice = purchasePrice * (1 + markup)

    const account = await prisma.stockAccount.create({
      data: {
        platform: data.platform as 'GOOGLE_ADS' | 'META_ADS' | 'KWAI_ADS' | 'TIKTOK_ADS' | 'OTHER',
        type: data.type,
        yearStarted: data.yearStarted,
        niche: data.niche || null,
        minConsumed: data.minConsumed,
        purchasePrice: data.purchasePrice,
        markupPercent: data.markupPercent,
        salePrice,
        description: data.description || null,
        managerId: manager.id,
        supplierId: data.supplierId || null,
        status: 'PENDING',
      },
    })

    return NextResponse.json(account)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao cadastrar' }, { status: 500 })
  }
}
