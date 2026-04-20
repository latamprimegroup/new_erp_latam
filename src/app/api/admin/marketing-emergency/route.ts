import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

const KEY = 'marketing_emergency_pause'

const patchSchema = z.object({
  active: z.boolean(),
  /** Obrigatório quando active === true (dupla confirmação). */
  confirmPhrase: z.string().optional(),
})

export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const row = await prisma.systemSetting.findUnique({ where: { key: KEY } })
  const active = row?.value === '1' || row?.value === 'true'
  return NextResponse.json({ active, key: KEY })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  let body: z.infer<typeof patchSchema>
  try {
    body = patchSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  if (body.active && body.confirmPhrase?.trim() !== 'PAUSAR_LP') {
    return NextResponse.json(
      {
        error: 'Para ativar a pausa de LP/cloaking, envie confirmPhrase exatamente igual a PAUSAR_LP.',
      },
      { status: 400 }
    )
  }

  const prev = await prisma.systemSetting.findUnique({ where: { key: KEY } })
  const prevActive = prev?.value === '1' || prev?.value === 'true'

  await prisma.systemSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: body.active ? '1' : '0' },
    update: { value: body.active ? '1' : '0' },
  })

  await audit({
    userId: auth.session.user.id,
    action: body.active ? 'MARKETING_EMERGENCY_ON' : 'MARKETING_EMERGENCY_OFF',
    entity: 'SystemSetting',
    entityId: KEY,
    oldValue: { active: prevActive },
    newValue: { active: body.active },
  })

  return NextResponse.json({ active: body.active })
}
