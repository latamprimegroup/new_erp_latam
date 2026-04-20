import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'FINANCE', 'COMMERCIAL']
const WRITE_ROLES = ['ADMIN', 'FINANCE']

const postSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountBrl: z.number().nonnegative(),
  source: z.string().max(40).optional().default('MANUAL'),
  note: z.string().max(500).optional(),
})

/**
 * GET — últimos lançamentos de investimento diário.
 * POST — upsert de gasto em mídia (fecha com vendas no dashboard de ROI).
 * DELETE — remove um lançamento por id (?id=) — correção de erro ou duplicidade.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !READ_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const rows = await prisma.adsSpendDaily.findMany({
    orderBy: { date: 'desc' },
    take: 60,
  })

  return NextResponse.json(
    {
      items: rows.map((r) => ({
        id: r.id,
        date: r.date.toISOString().slice(0, 10),
        amountBrl: Number(r.amountBrl),
        source: r.source,
        note: r.note,
      })),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  )
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !WRITE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = postSchema.parse(await req.json())
    const day = new Date(body.date + 'T12:00:00.000Z')

    const row = await prisma.adsSpendDaily.upsert({
      where: {
        date_source: {
          date: day,
          source: body.source,
        },
      },
      create: {
        date: day,
        amountBrl: body.amountBrl,
        source: body.source,
        note: body.note ?? null,
      },
      update: {
        amountBrl: body.amountBrl,
        note: body.note ?? null,
      },
    })

    return NextResponse.json({
      ok: true,
      item: {
        id: row.id,
        date: row.date.toISOString().slice(0, 10),
        amountBrl: Number(row.amountBrl),
        source: row.source,
      },
    })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Inválido' }, { status: 400 })
    }
    throw e
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !WRITE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const id = new URL(req.url).searchParams.get('id')?.trim()
  if (!id) {
    return NextResponse.json({ error: 'Informe id na query' }, { status: 400 })
  }

  try {
    await prisma.adsSpendDaily.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 })
  }
}
