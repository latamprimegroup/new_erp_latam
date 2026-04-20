import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const METAS_ROLES = ['ADMIN', 'PRODUCER'] as const

async function getSettingNumber(key: string, fallback: number): Promise<number> {
  const s = await prisma.systemSetting.findUnique({ where: { key } })
  if (!s?.value) return fallback
  const n = parseFloat(s.value.replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}

async function teamVolumeThisMonth(): Promise<number> {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  const [p, g] = await Promise.all([
    prisma.productionAccount.count({
      where: {
        status: 'APPROVED',
        deletedAt: null,
        validatedAt: { not: null, gte: start, lte: end },
      },
    }),
    prisma.productionG2.count({
      where: {
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        archivedAt: null,
        validatedAt: { not: null, gte: start, lte: end },
      },
    }),
  ])
  return p + g
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const role = session.user?.role
  if (!role || !METAS_ROLES.includes(role as (typeof METAS_ROLES)[number])) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const volumeTarget = Math.round(await getSettingNumber('metas_equipe_volume_alvo', 0))
  const bonusAmount = await getSettingNumber('metas_equipe_bonus_reais', 0)
  const currentVolume = await teamVolumeThisMonth()
  const percent = volumeTarget > 0 ? Math.min(100, Math.round((currentVolume / volumeTarget) * 1000) / 10) : 0

  return NextResponse.json({
    volumeTarget,
    bonusAmount,
    currentVolume,
    percent,
    costPerAccount:
      volumeTarget > 0 && bonusAmount > 0 ? Math.round((bonusAmount / volumeTarget) * 100) / 100 : null,
  })
}

const patchSchema = z.object({
  volumeTarget: z.number().int().min(0).max(10_000_000),
  bonusAmount: z.number().min(0).max(1_000_000_000),
})

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = patchSchema.parse(await req.json())
    await prisma.$transaction([
      prisma.systemSetting.upsert({
        where: { key: 'metas_equipe_volume_alvo' },
        create: { key: 'metas_equipe_volume_alvo', value: String(body.volumeTarget) },
        update: { value: String(body.volumeTarget) },
      }),
      prisma.systemSetting.upsert({
        where: { key: 'metas_equipe_bonus_reais' },
        create: { key: 'metas_equipe_bonus_reais', value: String(body.bonusAmount) },
        update: { value: String(body.bonusAmount) },
      }),
    ])
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 })
  }
}
