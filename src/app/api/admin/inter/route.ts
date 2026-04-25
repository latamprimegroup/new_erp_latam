/**
 * GET  /api/admin/inter — Relatório de saúde da integração Banco Inter
 * POST /api/admin/inter — Registra ou re-registra o webhook PIX
 *
 * Usado pelo painel CEO para monitorar a saúde da API Inter em tempo real.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import {
  checkInterHealth,
  registerInterWebhook,
  getRegisteredWebhook,
  InterApiError,
} from '@/lib/inter/client'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

function isAdmin(s: Awaited<ReturnType<typeof getServerSession>>) {
  return (s?.user as { role?: string } | undefined)?.role === 'ADMIN'
}

// ─── GET: Diagnóstico de Saúde ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  try {
    const health = await checkInterHealth()

    // Busca os últimos 10 eventos de webhook recebidos (para o painel)
    const recentWebhooks = await prisma.interPixLog.findMany({
      orderBy: { receivedAt: 'desc' },
      take:    10,
      select:  {
        id:         true,
        txid:       true,
        e2eid:      true,
        amount:     true,
        status:     true,
        receivedAt: true,
        processedAt: true,
        errorMsg:   true,
      },
    }).catch(() => [] as typeof recentWebhooks)

    return NextResponse.json({ ...health, recentWebhooks })
  } catch (e) {
    const err = e as Error
    return NextResponse.json({
      timestamp:  new Date().toISOString(),
      tokenOk:    false,
      certsFound: false,
      webhookUrl: null,
      lastError:  err.message,
      latencyMs:  0,
      recentWebhooks: [],
    })
  }
}

// ─── POST: Registrar/Re-registrar Webhook ────────────────────────────────────

const registerSchema = z.object({
  callbackUrl: z.string().url().startsWith('https', { message: 'URL deve usar HTTPS' }),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const body   = await req.json().catch(() => ({}))
  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'URL inválida ou não HTTPS', details: parsed.error.flatten() }, { status: 400 })

  try {
    const result = await registerInterWebhook(parsed.data.callbackUrl)
    // Confirma imediatamente consultando o registro
    const wh = await getRegisteredWebhook().catch(() => null)
    return NextResponse.json({ ok: true, message: result.message, registeredUrl: wh?.webhookUrl ?? parsed.data.callbackUrl })
  } catch (e) {
    if (e instanceof InterApiError) {
      return NextResponse.json({ error: e.message, statusCode: e.statusCode, endpoint: e.endpoint }, { status: 502 })
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
