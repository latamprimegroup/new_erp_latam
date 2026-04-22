import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const SITE_URL = process.env.NEXTAUTH_URL || 'https://adsativos.com'
const WHATSAPP_PHONE = process.env.WHATSAPP_ALERT_PHONE || ''
const WHATSAPP_APIKEY = process.env.WHATSAPP_ALERT_APIKEY || ''
const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || ''

async function sendWhatsApp(message: string) {
  if (!WHATSAPP_PHONE || !WHATSAPP_APIKEY) return
  const encoded = encodeURIComponent(message)
  const url = `https://api.callmebot.com/whatsapp.php?phone=${WHATSAPP_PHONE}&text=${encoded}&apikey=${WHATSAPP_APIKEY}`
  await fetch(url).catch(console.error)
}

async function sendAlert(message: string, isRecovery = false) {
  const emoji = isRecovery ? '✅' : '🚨'
  const title = isRecovery ? 'SITE RECUPERADO' : 'SITE FORA DO AR'
  const whatsappMsg = `${emoji} *ERP ADS Ativos — ${title}*\n\n${message}\n\n🌐 ${SITE_URL}\n🕐 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`

  const promises: Promise<unknown>[] = [
    sendWhatsApp(whatsappMsg),
  ]

  if (WEBHOOK_URL) {
    promises.push(
      fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message, site: SITE_URL, timestamp: new Date().toISOString(), isRecovery }),
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
