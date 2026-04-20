import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Configurações públicas (sem auth) para widgets e scripts do frontend.
 * Usado por Join.Chat, GTM e similares.
 */
export async function GET() {
  try {
    const keys = ['joinchat_id', 'whatsapp_number', 'custom_scripts', 'footer_custom_scripts']
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: keys } },
    })
    const config = Object.fromEntries(settings.map((s) => [s.key, s.value])) as Record<string, string>

    const footer =
      config.footer_custom_scripts?.trim() || config.custom_scripts?.trim() || null

    return NextResponse.json({
      joinchatId: config.joinchat_id || null,
      whatsappNumber: config.whatsapp_number || null,
      customScripts: config.custom_scripts || null,
      footerCustomScripts: footer,
    })
  } catch {
    return NextResponse.json({
      joinchatId: null,
      whatsappNumber: null,
      customScripts: null,
      footerCustomScripts: null,
    })
  }
}
