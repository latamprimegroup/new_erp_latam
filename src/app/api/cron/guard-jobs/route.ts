import { NextRequest, NextResponse } from 'next/server'
import { processNextComplianceJob } from '@/lib/guard-job-processor'

/**
 * GET /api/cron/guard-jobs?secret=CRON_SECRET
 * Processa um job PENDING da fila de análise VSL.
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const r = await processNextComplianceJob()
    return NextResponse.json(r)
  } catch (e) {
    console.error('guard-jobs cron:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
