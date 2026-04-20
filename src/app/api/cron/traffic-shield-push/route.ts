import { NextRequest, NextResponse } from 'next/server'
import { pushTrafficShieldConfigToEdge } from '@/lib/traffic-shield/push-config'

/**
 * GET /api/cron/traffic-shield-push?secret=CRON_SECRET
 * Agendar a cada ~5 min no vosso scheduler para manter o edge sincronizado.
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')?.trim()
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const r = await pushTrafficShieldConfigToEdge()
  return NextResponse.json({ ok: r.ok, skipped: r.skipped, error: r.error })
}
