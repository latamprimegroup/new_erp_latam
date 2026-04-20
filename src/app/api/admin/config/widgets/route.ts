import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sanitizeFooterCustomHtml } from '@/lib/sanitize-footer-scripts'

const WIDGET_KEYS = [
  'joinchat_id',
  'whatsapp_number',
  'widget_niche',
  'footer_custom_scripts',
] as const

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: [...WIDGET_KEYS] } },
  })
  const config = Object.fromEntries(settings.map((s) => [s.key, s.value])) as Record<string, string>

  const legacy = await prisma.systemSetting.findUnique({ where: { key: 'custom_scripts' } })

  return NextResponse.json({
    joinchatId: config.joinchat_id || '',
    whatsappNumber: config.whatsapp_number || '',
    widgetNiche: config.widget_niche || '',
    footerCustomScripts: config.footer_custom_scripts || legacy?.value || '',
  })
}

const updateSchema = z.object({
  joinchatId: z.string().optional(),
  whatsappNumber: z.string().optional(),
  widgetNiche: z.string().max(200).optional(),
  footerCustomScripts: z.string().max(80_000).optional(),
})

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    if (data.joinchatId !== undefined) {
      await prisma.systemSetting.upsert({
        where: { key: 'joinchat_id' },
        create: { key: 'joinchat_id', value: data.joinchatId },
        update: { value: data.joinchatId },
      })
    }
    if (data.whatsappNumber !== undefined) {
      await prisma.systemSetting.upsert({
        where: { key: 'whatsapp_number' },
        create: { key: 'whatsapp_number', value: data.whatsappNumber },
        update: { value: data.whatsappNumber },
      })
    }
    if (data.widgetNiche !== undefined) {
      await prisma.systemSetting.upsert({
        where: { key: 'widget_niche' },
        create: { key: 'widget_niche', value: data.widgetNiche },
        update: { value: data.widgetNiche },
      })
    }
    if (data.footerCustomScripts !== undefined) {
      const safe = sanitizeFooterCustomHtml(data.footerCustomScripts)
      await prisma.systemSetting.upsert({
        where: { key: 'footer_custom_scripts' },
        create: { key: 'footer_custom_scripts', value: safe },
        update: { value: safe },
      })
    }

    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: [...WIDGET_KEYS] } },
    })
    const config = Object.fromEntries(settings.map((s) => [s.key, s.value])) as Record<string, string>

    return NextResponse.json({
      joinchatId: config.joinchat_id || '',
      whatsappNumber: config.whatsapp_number || '',
      widgetNiche: config.widget_niche || '',
      footerCustomScripts: config.footer_custom_scripts || '',
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    throw err
  }
}
