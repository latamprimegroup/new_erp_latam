import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { cnaeRoot7 } from '@/lib/ads-core-cnae'

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

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  briefingInstructions: z.string().optional().nullable(),
  active: z.boolean().optional(),
  allowedCnaeCodes: z.array(z.string().min(1).max(40)).optional(),
  /** Lista de palavras-chave para cruzar com texto fiscal quando o CNAE não bate sozinho. `null` limpa. */
  congruenceKeywords: z.array(z.string()).nullable().optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (!isGerente(auth.session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  const { id } = await params
  try {
    const data = patchSchema.parse(await req.json())
    const n = await prisma.$transaction(async (tx) => {
      const updated = await tx.adsCoreNiche.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.briefingInstructions !== undefined
            ? { briefingInstructions: data.briefingInstructions?.trim() || null }
            : {}),
          ...(data.active !== undefined ? { active: data.active } : {}),
        },
      })
      if (data.allowedCnaeCodes !== undefined) {
        await tx.adsCoreNicheAllowedCnae.deleteMany({ where: { nicheId: id } })
        const roots = [
          ...new Set(
            data.allowedCnaeCodes
              .map((raw) => cnaeRoot7(raw.trim()) || raw.replace(/\D/g, '').slice(0, 7))
              .filter((x) => x && x.length >= 4)
          ),
        ]
        if (roots.length > 0) {
          await tx.adsCoreNicheAllowedCnae.createMany({
            data: roots.map((code) => ({ nicheId: id, code })),
            skipDuplicates: true,
          })
        }
      }
      return updated
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
    return NextResponse.json({ error: 'Nicho não encontrado' }, { status: 404 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (auth.session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  const { id } = await params
  const count = await prisma.adsCoreAsset.count({ where: { nicheId: id } })
  if (count > 0) {
    return NextResponse.json(
      { error: 'Existem ativos vinculados a este nicho. Desative em vez de excluir.' },
      { status: 400 }
    )
  }
  await prisma.adsCoreNiche.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
