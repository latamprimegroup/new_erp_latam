import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const FUNNEL_STEPS = [
  'STEP_1_CAPTURA',
  'STEP_2_WHATSAPP',
  'STEP_3_FOTO',
  'STEP_4_VALIDACAO',
  'STEP_5_QUALIFICACAO',
  'STEP_6_PROPOSTA',
  'STEP_7_CONVERSAO',
] as const

const createSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
  funnelStep: z.enum(FUNNEL_STEPS).optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const leads = await prisma.commercialLead.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      assignedCommercial: { select: { name: true, email: true } },
      convertedClient: { select: { id: true, clientCode: true } },
    },
  })
  return NextResponse.json(leads)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = createSchema.parse(await req.json())
    const lead = await prisma.commercialLead.create({
      data: {
        name: body.name || null,
        phone: body.phone || null,
        whatsapp: body.whatsapp || null,
        email: body.email || null,
        notes: body.notes || null,
        funnelStep: body.funnelStep || 'STEP_1_CAPTURA',
        assignedCommercialId:
          session.user.role === 'COMMERCIAL' ? session.user.id : undefined,
      },
    })
    return NextResponse.json(lead)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    throw e
  }
}
