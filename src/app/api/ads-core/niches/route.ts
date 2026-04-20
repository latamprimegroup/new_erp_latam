import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'

function isGerente(role?: string) {
  return role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
}

function parseCongruenceKeywordsJson(raw: unknown): string[] {
  if (raw == null) return []
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean)
  }
  return []
}

export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const { role } = auth.session.user
  if (!isGerente(role) && role !== 'PRODUCER') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const niches = await prisma.adsCoreNiche.findMany({
    where: isGerente(role) ? {} : { active: true },
    orderBy: { name: 'asc' },
    include: { allowedCnaes: { select: { code: true } } },
  })
  return NextResponse.json(
    niches.map(({ allowedCnaes, congruenceKeywords, ...n }) => ({
      ...n,
      allowedCnaeCodes: allowedCnaes.map((a) => a.code),
      congruenceKeywords: parseCongruenceKeywordsJson(congruenceKeywords),
    }))
  )
}

const postSchema = z.object({
  name: z.string().min(2).max(120),
  briefingInstructions: z.string().optional(),
  congruenceKeywords: z.array(z.string()).optional(),
})

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (!isGerente(auth.session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  try {
    const body = postSchema.parse(await req.json())
    const kws = [...new Set((body.congruenceKeywords || []).map((s) => s.trim()).filter(Boolean))]
    const n = await prisma.adsCoreNiche.create({
      data: {
        name: body.name.trim(),
        briefingInstructions: body.briefingInstructions?.trim() || null,
        congruenceKeywords: kws.length > 0 ? kws : Prisma.JsonNull,
      },
    })
    const withCnaes = await prisma.adsCoreNiche.findUnique({
      where: { id: n.id },
      include: { allowedCnaes: { select: { code: true } } },
    })
    return NextResponse.json({
      ...n,
      allowedCnaeCodes: withCnaes?.allowedCnaes.map((a) => a.code) ?? [],
      congruenceKeywords: parseCongruenceKeywordsJson(withCnaes?.congruenceKeywords),
    })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    throw e
  }
}
