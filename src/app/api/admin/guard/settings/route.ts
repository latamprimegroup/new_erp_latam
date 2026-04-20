import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const KEYS = {
  webhook: 'guard_notification_webhook',
  openaiNote: 'guard_openai_config_note',
} as const

const patchSchema = z.object({
  guardNotificationWebhook: z.string().max(2000).optional(),
  guardOpenaiConfigNote: z.string().max(2000).optional(),
})

async function guardSettingsResponse() {
  const [wh, note] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: KEYS.webhook } }),
    prisma.systemSetting.findUnique({ where: { key: KEYS.openaiNote } }),
  ])

  return NextResponse.json({
    guardNotificationWebhook: wh?.value ?? '',
    guardOpenaiConfigNote: note?.value ?? '',
    openaiFromEnv: !!process.env.OPENAI_API_KEY?.trim(),
    visionFromEnv: !!process.env.GOOGLE_VISION_API_KEY?.trim(),
  })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  return guardSettingsResponse()
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = patchSchema.parse(await req.json())
    if (body.guardNotificationWebhook !== undefined) {
      const v = body.guardNotificationWebhook.trim()
      if (v && !/^https?:\/\//i.test(v)) {
        return NextResponse.json({ error: 'Webhook deve ser uma URL https' }, { status: 400 })
      }
      await prisma.systemSetting.upsert({
        where: { key: KEYS.webhook },
        create: { key: KEYS.webhook, value: v },
        update: { value: v },
      })
    }
    if (body.guardOpenaiConfigNote !== undefined) {
      await prisma.systemSetting.upsert({
        where: { key: KEYS.openaiNote },
        create: { key: KEYS.openaiNote, value: body.guardOpenaiConfigNote },
        update: { value: body.guardOpenaiConfigNote },
      })
    }
    return guardSettingsResponse()
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message }, { status: 400 })
    }
    throw e
  }
}
