import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const bodySchema = z.object({
  notifyPush: z.boolean().optional(),
})

/**
 * PATCH - Atualiza preferências de notificação do admin
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const parsed = bodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const userId = auth.session!.user!.id

  await prisma.notificationPreference.upsert({
    where: { userId },
    create: {
      userId,
      notifyPush: parsed.data.notifyPush ?? true,
    },
    update: parsed.data as { notifyPush?: boolean },
  })

  return NextResponse.json({ ok: true })
}
