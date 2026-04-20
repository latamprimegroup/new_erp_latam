import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runTrackerDomainReputationJob } from '@/lib/ads-tracker/domain-reputation-job'

/**
 * GET /api/cron/tracker-domain-reputation?secret=CRON_SECRET
 * Recomendado: a cada 1 hora. Também aceita header x-vercel-cron=1 quando CRON_SECRET está definido (Vercel Cron).
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')?.trim()
  const vercelCronTrusted =
    process.env.VERCEL === '1' && req.headers.get('x-vercel-cron') === '1'
  const authorized =
    !process.env.CRON_SECRET || secret === process.env.CRON_SECRET || vercelCronTrusted
  if (!authorized) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const r = await runTrackerDomainReputationJob(prisma)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    console.error('[tracker-domain-reputation cron]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
