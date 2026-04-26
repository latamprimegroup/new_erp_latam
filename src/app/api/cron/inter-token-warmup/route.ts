/**
 * POST /api/cron/inter-token-warmup
 *
 * Pré-aquece o token OAuth2 do Banco Inter a cada 30 minutos.
 * Garante que sempre há um token válido no banco antes de qualquer venda.
 * Elimina o risco de cold start + mTLS fail causar downtime em vendas.
 *
 * Schedule: a cada 30 minutos (vercel.json)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getInterToken } from '@/lib/inter/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const token = await getInterToken()
    console.log('[inter-token-warmup] Token renovado com sucesso')
    return NextResponse.json({
      ok:        true,
      tokenLen:  token.length,
      renewedAt: new Date().toISOString(),
    })
  } catch (e) {
    const msg = String((e as Error).message ?? e)
    console.error('[inter-token-warmup] Falha ao renovar token:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
