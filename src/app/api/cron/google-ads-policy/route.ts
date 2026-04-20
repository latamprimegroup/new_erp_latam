import { NextRequest, NextResponse } from 'next/server'
import { runGoogleAdsPolicySync } from '@/lib/run-google-ads-policy-sync'

/**
 * GET /api/cron/google-ads-policy?secret=CRON_SECRET
 * Comparar política de ajuda Google Ads com snapshot anterior (semanal).
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const r = await runGoogleAdsPolicySync()
  return NextResponse.json(r)
}
