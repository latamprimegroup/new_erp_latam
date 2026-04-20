import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const postSchema = z.object({
  term: z.string().min(2).max(200),
  category: z.string().max(64).optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const terms = await prisma.blacklistTerm.findMany({
    orderBy: { term: 'asc' },
  })
  return NextResponse.json({ terms })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = postSchema.parse(await req.json())
    const created = await prisma.blacklistTerm.create({
      data: {
        term: body.term.trim(),
        category: body.category?.trim() || null,
        active: true,
      },
    })
    return NextResponse.json(created)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message }, { status: 400 })
    }
    throw e
  }
}
