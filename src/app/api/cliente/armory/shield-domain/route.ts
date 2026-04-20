import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({
  domainId: z.string().min(1),
})

/**
 * Pedido de blindagem: webhook para infra (Gerson) + registo no domínio do cliente.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    select: { id: true, clientCode: true, gtmId: true, globalTrackingScript: true },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const domain = await prisma.landingDomain.findFirst({
    where: { id: body.domainId, clientId: client.id },
  })
  if (!domain) return NextResponse.json({ error: 'Domínio não encontrado' }, { status: 404 })

  const url = process.env.ARMORY_DOMAIN_SHIELD_WEBHOOK_URL?.trim()
  const secret = process.env.ARMORY_DOMAIN_SHIELD_SECRET?.trim()
  const now = new Date()

  const payload = {
    action: 'enable_shield' as const,
    domain: domain.domain,
    domainId: domain.id,
    clientId: client.id,
    clientCode: client.clientCode,
    gtmId: client.gtmId,
    hasGlobalTrackingScript: Boolean(client.globalTrackingScript?.trim()),
    requestedAt: now.toISOString(),
  }

  let webhookOk = false
  let webhookError: string | null = null

  if (url && secret) {
    const raw = JSON.stringify(payload)
    try {
      const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex')
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Armory-Shield-Signature': `sha256=${sig}`,
          'User-Agent': 'AdsAtivosArmory/1.0',
        },
        body: raw,
        signal: AbortSignal.timeout(20_000),
      })
      webhookOk = res.ok
      if (!webhookOk) {
        const t = await res.text().catch(() => '')
        webhookError = `HTTP ${res.status}: ${t.slice(0, 400)}`
      }
    } catch (e) {
      webhookError = e instanceof Error ? e.message : 'fetch failed'
    }
  } else {
    webhookError = 'Webhook não configurado (ARMORY_DOMAIN_SHIELD_WEBHOOK_URL / SECRET)'
  }

  await prisma.landingDomain.update({
    where: { id: domain.id },
    data: {
      shieldRequestedAt: now,
      shieldLastWebhookAt: now,
      shieldWebhookError: webhookError,
      shieldEnabled: webhookOk,
    },
  })

  return NextResponse.json({
    ok: webhookOk,
    shieldEnabled: webhookOk,
    error: webhookOk ? null : webhookError,
    message: webhookOk
      ? 'Blindagem pedida ao edge. O domínio será apontado ao proxy reverso e o Tracker pode injetar scripts conforme contrato.'
      : 'Pedido registado; o webhook falhou ou não está configurado. O time opera manualmente.',
  })
}
