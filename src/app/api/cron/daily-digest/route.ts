import { NextResponse } from 'next/server'
import { sendDailyDigestToAll } from '@/lib/notifications'

const CRON_SECRET = process.env.CRON_SECRET

/**
 * POST /api/cron/daily-digest
 * Envia digest diário para todos os colaboradores.
 * Chamar via Vercel Cron ou similar às 08:00 (ou horário configurado).
 * 
 * Headers esperados: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '')

  if (CRON_SECRET && token !== CRON_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const { sent, total } = await sendDailyDigestToAll()
    return NextResponse.json({ ok: true, sent, total })
  } catch (e) {
    console.error('Daily digest cron error:', e)
    return NextResponse.json(
      { error: 'Erro ao enviar digest' },
      { status: 500 }
    )
  }
}
