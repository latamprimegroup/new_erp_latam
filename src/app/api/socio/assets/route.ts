/**
 * GET    /api/socio/assets — Patrimônio consolidado
 * POST   /api/socio/assets — Adiciona ativo
 * PATCH  /api/socio/assets?id=X — Atualiza valor de mercado
 * DELETE /api/socio/assets?id=X — Remove ativo
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z }                from 'zod'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'
import type { SocioAssetType } from '@prisma/client'

function isAdmin(role?: string | null) { return role === 'ADMIN' }

const createSchema = z.object({
  type:          z.enum(['IMOVEL','VEICULO','CRIPTO','ACOES','FUNDO_INVESTIMENTO','CONTA_BANCARIA','PREVIDENCIA','OUTRO']),
  name:          z.string().max(200),
  currentValue:  z.number().nonnegative(),
  currency:      z.string().max(3).default('BRL'),
  acquiredValue: z.number().nonnegative().optional(),
  acquiredAt:    z.string().optional(),
  notes:         z.string().max(500).optional(),
})

async function getProfile(userId: string) {
  return prisma.socioProfile.upsert({ where: { userId }, update: {}, create: { userId } })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isAdmin(session.user.role))
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const profile = await getProfile(session.user.id)
  const assets  = await prisma.socioAsset.findMany({
    where:   { profileId: profile.id },
    orderBy: { currentValue: 'desc' },
  })

  // Agregação por tipo
  const byType: Record<string, { count: number; total: number }> = {}
  let grandTotal = 0
  for (const a of assets) {
    const v = Number(a.currentValue)
    grandTotal += v
    byType[a.type] = byType[a.type] ?? { count: 0, total: 0 }
    byType[a.type].count++
    byType[a.type].total += v
  }

  // Ganho de capital estimado
  const capitalGain = assets.reduce((s, a) => {
    if (a.acquiredValue) return s + (Number(a.currentValue) - Number(a.acquiredValue))
    return s
  }, 0)

  return NextResponse.json({ assets, grandTotal, byType, capitalGain })
}

export async function POST(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isAdmin(session.user.role))
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })

  const profile = await getProfile(session.user.id)
  const asset   = await prisma.socioAsset.create({
    data: {
      profileId:    profile.id,
      type:         parsed.data.type as SocioAssetType,
      name:         parsed.data.name,
      currentValue: parsed.data.currentValue,
      currency:     parsed.data.currency,
      acquiredValue: parsed.data.acquiredValue,
      acquiredAt:   parsed.data.acquiredAt ? new Date(parsed.data.acquiredAt) : undefined,
      notes:        parsed.data.notes,
    },
  })
  return NextResponse.json(asset, { status: 201 })
}

export async function PATCH(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isAdmin(session.user.role))
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const schema = z.object({ currentValue: z.number().nonnegative().optional(), name: z.string().optional(), notes: z.string().optional() })
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })

  // Garante que o ativo é do sócio logado
  const profile = await getProfile(session.user.id)
  const asset   = await prisma.socioAsset.findFirst({ where: { id, profileId: profile.id } })
  if (!asset) return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 })

  const updated = await prisma.socioAsset.update({ where: { id }, data: parsed.data })
  return NextResponse.json(updated)
}

export async function DELETE(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isAdmin(session.user.role))
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

  const profile = await getProfile(session.user.id)
  const asset   = await prisma.socioAsset.findFirst({ where: { id, profileId: profile.id } })
  if (!asset) return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 })

  await prisma.socioAsset.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
