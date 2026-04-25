/**
 * PATCH /api/admin/client-profile-type
 *
 * Atualiza o perfil de acesso (profileType) e/ou módulos ativos de um cliente.
 * Apenas ADMIN pode usar esta rota.
 *
 * Body: { clientProfileId, profileType?, activeModules?, spendFeePct?, monthlyFeeBrl? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { ClientProfileType } from '@prisma/client'

const PROFILE_TYPES: ClientProfileType[] = [
  'TRADER_WHATSAPP',
  'LOCAL_BUSINESS',
  'MENTORADO',
  'DIRECT_RESPONSE_SCALE',
  'INFRA_PARTNER',
  'RENTAL_USER',
]

const patchSchema = z.object({
  clientProfileId: z.string().min(1),
  profileType:     z.enum(PROFILE_TYPES as [ClientProfileType, ...ClientProfileType[]]).optional(),
  activeModules:   z.array(z.string()).optional(),
  spendFeePct:     z.number().min(0).max(100).optional().nullable(),
  monthlyFeeBrl:   z.number().min(0).optional().nullable(),
  nextBillingAt:   z.string().datetime().optional().nullable(),
})

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })
  }

  const { clientProfileId, profileType, activeModules, spendFeePct, monthlyFeeBrl, nextBillingAt } = parsed.data

  const cp = await prisma.clientProfile.findUnique({
    where:  { id: clientProfileId },
    select: { id: true, userId: true },
  })
  if (!cp) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })

  const updated = await prisma.clientProfile.update({
    where: { id: clientProfileId },
    data: {
      ...(profileType   !== undefined && { profileType }),
      ...(activeModules !== undefined && { activeModules }),
      ...(spendFeePct   !== undefined && { spendFeePct:  spendFeePct  ?? null }),
      ...(monthlyFeeBrl !== undefined && { monthlyFeeBrl: monthlyFeeBrl ?? null }),
      ...(nextBillingAt !== undefined && { nextBillingAt: nextBillingAt ? new Date(nextBillingAt) : null }),
    },
    select: {
      id: true, profileType: true, activeModules: true,
      spendFeePct: true, monthlyFeeBrl: true, nextBillingAt: true,
      user: { select: { name: true, email: true } },
    },
  })

  return NextResponse.json({ ok: true, profile: updated })
}

/**
 * GET /api/admin/client-profile-type?search=&profileType=
 * Lista clientes com seus perfis para o painel de gestão.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!['ADMIN', 'COMMERCIAL'].includes(session?.user?.role ?? '')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const search      = searchParams.get('search')?.trim() ?? ''
  const profileFilter = searchParams.get('profileType') as ClientProfileType | null

  const profiles = await prisma.clientProfile.findMany({
    where: {
      ...(profileFilter && { profileType: profileFilter }),
      ...(search && {
        OR: [
          { user: { name:  { contains: search } } },
          { user: { email: { contains: search } } },
        ],
      }),
    },
    select: {
      id: true, profileType: true, activeModules: true,
      spendFeePct: true, monthlyFeeBrl: true, nextBillingAt: true,
      clientStatus: true, totalSpent: true,
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { profileType: 'asc' },
    take: 100,
  })

  return NextResponse.json({ profiles })
}
