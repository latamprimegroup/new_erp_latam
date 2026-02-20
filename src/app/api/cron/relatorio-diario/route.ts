import { NextResponse } from 'next/server'
import { sendRelatorioDiarioParaAdmins } from '@/lib/notifications/relatorio-diario-notify'

const CRON_SECRET = process.env.CRON_SECRET

/**
 * POST /api/cron/relatorio-diario
 * Envia relatório diário (vendas + produção + meta) para admins.
 * Chamar via Vercel Cron às 20:00 ou 22:00.
 * Query: ?secret=CRON_SECRET
 */
export async function POST(req: Request) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')

  if (CRON_SECRET && secret !== CRON_SECRET) {
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace(/^Bearer\s+/i, '')
    if (token !== CRON_SECRET) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
  }

  try {
    const { sent, total } = await sendRelatorioDiarioParaAdmins()
    return NextResponse.json({ ok: true, sent, total })
  } catch (e) {
    console.error('Relatorio diario cron error:', e)
    return NextResponse.json(
      { error: 'Erro ao enviar relatório' },
      { status: 500 }
    )
  }
}
