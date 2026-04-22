import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const SITE_URL = process.env.NEXTAUTH_URL || 'https://adsativos.com'
const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || ''
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL || ''

async function sendAlert(message: string, isRecovery = false) {
  const emoji = isRecovery ? '✅' : '🚨'
  const color = isRecovery ? 0x00ff00 : 0xff0000
  const title = isRecovery ? 'SITE RECUPERADO' : 'SITE FORA DO AR'

  const promises: Promise<unknown>[] = []

  // Discord webhook
  if (DISCORD_WEBHOOK) {
    promises.push(
      fetch(DISCORD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: `${emoji} ${title} — adsativos.com`,
            description: message,
            color,
            timestamp: new Date().toISOString(),
            footer: { text: 'ERP ADS Ativos — Monitor Automático' },
          }],
        }),
      }).catch(console.error)
    )
  }

  // Webhook genérico (Slack, Make, Zapier, etc.)
  if (WEBHOOK_URL) {
    promises.push(
      fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          message,
          site: SITE_URL,
          timestamp: new Date().toISOString(),
          isRecovery,
        }),
      }).catch(console.error)
    )
  }

  await Promise.allSettled(promises)
}

export async function GET(request: Request) {
  // Verificação de segurança para cron da Vercel
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const checks = {
    database: false,
    responseTime: 0,
    timestamp: new Date().toISOString(),
  }

  const start = Date.now()

  // Verificar banco de dados
  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = true
  } catch (dbError) {
    const errorMsg = dbError instanceof Error ? dbError.message : 'Erro desconhecido'
    await sendAlert(
      `❌ **Banco de dados inacessível**\n\`\`\`${errorMsg}\`\`\`\nVerifica a variável DATABASE_URL no Vercel.`,
    )
  }

  checks.responseTime = Date.now() - start

  const allHealthy = checks.database

  if (!allHealthy) {
    return NextResponse.json({
      ok: false,
      checks,
      action: 'Alerta enviado',
    }, { status: 503 })
  }

  return NextResponse.json({ ok: true, checks })
}
