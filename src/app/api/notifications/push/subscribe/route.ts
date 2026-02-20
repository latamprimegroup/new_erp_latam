import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const bodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
})

/**
 * POST - Registra inscrição de Web Push (PWA no iPhone)
 */
export async function POST(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'COMMERCIAL', 'DELIVERER', 'PRODUCER', 'FINANCE', 'MANAGER', 'PRODUCTION_MANAGER', 'PLUG_PLAY'])
  if (!auth.ok) return auth.response

  const parsed = bodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const { endpoint, keys } = parsed.data
  const userId = auth.session!.user!.id
  const userAgent = req.headers.get('user-agent') || null

  await prisma.pushSubscription.upsert({
    where: {
      userId_endpoint: { userId, endpoint },
    },
    create: {
      userId,
      endpoint,
      keys,
      userAgent,
    },
    update: {
      keys,
      userAgent,
    },
  })

  return NextResponse.json({ ok: true })
}
