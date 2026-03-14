import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET - Listar sugestões (apenas ADMIN)
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Apenas administradores podem listar sugestões' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')

  const where = category && ['SYSTEM', 'COMPANY'].includes(category)
    ? { category: category as 'SYSTEM' | 'COMPANY' }
    : {}

  const suggestions = await prisma.suggestion.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true, email: true } } },
  })

  return NextResponse.json(suggestions)
}

const createSchema = z.object({
  category: z.enum(['SYSTEM', 'COMPANY']),
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  anonymous: z.boolean().optional(),
})

/**
 * POST - Enviar sugestão de melhoria (Sistema ou Empresa)
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'PRODUCER', 'FINANCE', 'DELIVERER', 'MANAGER', 'PRODUCTION_MANAGER', 'PLUG_PLAY']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão para enviar sugestões' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    const suggestion = await prisma.suggestion.create({
      data: {
        category: data.category,
        title: data.title.trim(),
        description: data.description.trim(),
        userId: data.anonymous && data.category === 'COMPANY' ? null : session.user.id,
      },
    })

    return NextResponse.json({
      id: suggestion.id,
      message: 'Sugestão enviada com sucesso. Obrigado!',
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao enviar sugestão' }, { status: 500 })
  }
}
