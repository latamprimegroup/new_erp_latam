/**
 * POST /api/admin/pos-venda/magic-link
 * Gera um Magic Link de entrega segura para um pedido/credencial.
 * Revoga links anteriores do mesmo checkout se solicitado.
 *
 * GET /api/admin/pos-venda/magic-link?checkoutId=xxx
 * Lista magic links existentes para um checkout.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  createDeliveryMagicLink,
  revokeMagicLinksForCheckout,
} from '@/lib/delivery-magic-link'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'
import { z } from 'zod'

const createSchema = z.object({
  checkoutId:    z.string().min(1),
  credentialId:  z.string().optional(),
  /** Horas de validade (padrão: 72) */
  expiryHours:   z.number().int().min(1).max(720).default(72),
  /** Revogar links anteriores antes de criar */
  revokeOld:     z.boolean().default(true),
  /** Enviar link no WhatsApp do comprador automaticamente */
  sendWhatsapp:  z.boolean().default(false),
})

export async function POST(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'CEO', 'DELIVERER'])
  if (!auth.ok) return auth.response

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos.', details: parsed.error.flatten() }, { status: 422 })
  }

  const data = parsed.data

  const checkout = await prisma.quickSaleCheckout.findUnique({
    where: { id: data.checkoutId },
    select: {
      id: true, status: true,
      buyerName: true, buyerWhatsapp: true,
      listing: { select: { title: true } },
    },
  })

  if (!checkout) {
    return NextResponse.json({ error: 'Checkout não encontrado.' }, { status: 404 })
  }
  if (checkout.status !== 'PAID') {
    return NextResponse.json({ error: 'Só é possível gerar magic link para pedidos PAID.' }, { status: 409 })
  }

  if (data.revokeOld) {
    await revokeMagicLinksForCheckout(data.checkoutId, `Substituído por novo link gerado por ${auth.session.user.name ?? auth.session.user.id}`)
  }

  const { token, url } = await createDeliveryMagicLink({
    checkoutId:    data.checkoutId,
    credentialId:  data.credentialId ?? null,
    expiryHours:   data.expiryHours,
  })

  if (data.sendWhatsapp) {
    const msg = [
      `✅ *Seus dados de entrega estão prontos — Ads Ativos*`,
      ``,
      `Produto: *${checkout.listing.title}*`,
      ``,
      `🔐 Acesse suas credenciais de forma segura pelo link abaixo:`,
      url,
      ``,
      `⚠️ Este link é exclusivo para você e expira em ${data.expiryHours}h.`,
      `Não compartilhe com ninguém.`,
    ].join('\n')
    sendWhatsApp({ phone: checkout.buyerWhatsapp, message: msg })
      .catch((e) => console.error('[MagicLink] Falha ao enviar WhatsApp:', e))
  }

  await prisma.auditLog.create({
    data: {
      action: 'DELIVERY_MAGIC_LINK_CREATED',
      entity: 'QuickSaleCheckout',
      entityId: data.checkoutId,
      userId: auth.session.user.id,
      details: {
        token: token.slice(0, 8) + '...',
        credentialId: data.credentialId ?? null,
        expiryHours: data.expiryHours,
        whatsappSent: data.sendWhatsapp,
      },
    },
  }).catch(() => {})

  return NextResponse.json({ ok: true, url, token })
}

export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'CEO', 'DELIVERER'])
  if (!auth.ok) return auth.response

  const checkoutId = req.nextUrl.searchParams.get('checkoutId')
  if (!checkoutId) {
    return NextResponse.json({ error: 'checkoutId é obrigatório.' }, { status: 400 })
  }

  const links = await prisma.deliveryMagicLink.findMany({
    where: { checkoutId },
    orderBy: { createdAt: 'desc' },
    select: {
      id:          true,
      token:       true,
      viewCount:   true,
      maxViews:    true,
      expiresAt:   true,
      revokedAt:   true,
      revokeReason: true,
      createdAt:   true,
      credentialId: true,
      accessLogs: {
        orderBy: { accessedAt: 'desc' },
        take: 5,
        select: { ip: true, userAgent: true, accessedAt: true },
      },
    },
  })

  const base = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  return NextResponse.json({
    links: links.map((l) => ({
      ...l,
      url: `${base}/entrega/${l.token}`,
      active: !l.revokedAt && (!l.expiresAt || l.expiresAt > new Date()),
    })),
  })
}
