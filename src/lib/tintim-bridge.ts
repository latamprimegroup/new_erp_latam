import { randomInt } from 'crypto'
import { hash } from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { normalizeEmail, normalizePhoneDigits, phonesLikelyMatch } from '@/lib/attribution-normalize'
import { allocateNextClientCode } from '@/lib/client-id-sequencial'
import { generateGroupNumber } from '@/lib/delivery-group-utils'
import { getPublicAppBaseUrl } from '@/lib/public-app-url'
import { computeWarrantyEndsAt } from '@/lib/order-warranty'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'
import { sendEmail } from '@/lib/notifications/channels/email'

export type TintimWebhookResult = {
  ok: boolean
  logId: string
  orderId?: string
  clientId?: string
  userId?: string
  createdUser?: boolean
  error?: string
}

export function verifyTintimSecret(req: Request): boolean {
  const secret = process.env.TINTIM_WEBHOOK_SECRET?.trim()
  if (!secret) return true
  const auth = req.headers.get('authorization')
  const alt = req.headers.get('x-tintim-secret')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : alt
  return token === secret
}

/** Payload de venda completa (Tintim → onboarding automático). */
export function isTintimSalePayload(body: Record<string, unknown>): boolean {
  const e = String(body.event || body.event_type || body.tipo || '').toLowerCase()
  if (e.includes('venda_aprovada') || e.includes('venda aprovada')) return true
  const v = body.value ?? body.valor
  const hasValue = v != null && Number(v) > 0
  const pid = String(body.product_id || body.productId || body.produto || '').trim()
  const hasCustomerId =
    String(body.customer_email || body.email || '').trim().length > 0 ||
    String(body.customer_phone || body.phone || body.whatsapp || '').trim().length > 0
  return hasValue && pid.length > 0 && hasCustomerId
}

export type TintimLeadResult = {
  ok: boolean
  eventId: string
  matchedClientId: string | null
}

export async function processTintimLeadWebhook(body: Record<string, unknown>): Promise<TintimLeadResult> {
  const phone =
    (body.phone as string) ||
    (body.telefone as string) ||
    (body.whatsapp as string) ||
    (body.phone_number as string) ||
    ''
  const email =
    (body.email as string) ||
    (body.mail as string) ||
    (body.e_mail as string) ||
    ''
  const campaignName =
    (body.campaign as string) ||
    (body.campaign_name as string) ||
    (body.campanha as string) ||
    null
  const utmSource = (body.utm_source as string) || (body.utmSource as string) || null
  const utmMedium = (body.utm_medium as string) || (body.utmMedium as string) || null
  const utmCampaign = (body.utm_campaign as string) || (body.utmCampaign as string) || null
  const externalId = (body.id as string) || (body.lead_id as string) || (body.external_id as string) || null

  const emailNormalized = normalizeEmail(email)
  const phoneNormalized = normalizePhoneDigits(phone)

  if (!emailNormalized && !phoneNormalized) {
    throw new Error('Informe phone ou email para cruzamento')
  }

  let matchedClientId: string | null = null

  if (emailNormalized) {
    const u = await prisma.user.findFirst({
      where: {
        email: emailNormalized,
        clientProfile: { isNot: null },
      },
      select: { clientProfile: { select: { id: true } } },
    })
    if (u?.clientProfile?.id) matchedClientId = u.clientProfile.id
  }

  if (!matchedClientId && phoneNormalized) {
    const profiles = await prisma.clientProfile.findMany({
      where: { whatsapp: { not: null } },
      select: { id: true, whatsapp: true },
      take: 4000,
    })
    for (const p of profiles) {
      if (phonesLikelyMatch(p.whatsapp, phoneNormalized)) {
        matchedClientId = p.id
        break
      }
    }
  }

  const ev = await prisma.tintimLeadEvent.create({
    data: {
      phoneNormalized,
      emailNormalized,
      campaignName,
      utmSource,
      utmMedium,
      utmCampaign,
      externalId,
      matchedClientId,
      rawPayload: body as object,
    },
  })

  const campaignLabel =
    campaignName?.trim() ||
    utmCampaign?.trim() ||
    (utmSource && utmMedium ? `${utmSource} / ${utmMedium}` : utmSource?.trim()) ||
    null

  if (matchedClientId && campaignLabel) {
    await prisma.clientProfile.update({
      where: { id: matchedClientId },
      data: {
        roiAttributionCampaign: campaignLabel,
        roiLastAttributionAt: new Date(),
      },
    })
  }

  return { ok: true, eventId: ev.id, matchedClientId }
}

function parseProductMap(): Record<string, { product: string; accountType: string; quantity: number }> {
  try {
    const raw = process.env.TINTIM_PRODUCT_MAP_JSON?.trim()
    if (!raw) return {}
    const j = JSON.parse(raw) as Record<string, { product?: string; accountType?: string; quantity?: number }>
    const out: Record<string, { product: string; accountType: string; quantity: number }> = {}
    for (const [k, v] of Object.entries(j)) {
      if (!v?.product) continue
      out[k] = {
        product: v.product,
        accountType: (v.accountType || 'BRL').toUpperCase(),
        quantity: Math.max(1, Number(v.quantity) || 1),
      }
    }
    return out
  } catch {
    return {}
  }
}

function resolveAcquisition(body: Record<string, unknown>): string | null {
  const utm = String(body.utm_source || body.utmSource || '').toLowerCase()
  if (utm.includes('google') || utm.includes('gads')) return 'GOOGLE_ADS'
  if (utm.includes('meta') || utm.includes('facebook') || utm.includes('fb')) return 'META_ADS'
  const explicit = String(body.lead_source || body.source || body.canal || '').toUpperCase()
  if (explicit.includes('GOOGLE')) return 'GOOGLE_ADS'
  if (explicit.includes('META')) return 'META_ADS'
  if (explicit.includes('ORGANIC') || explicit.includes('ORG')) return 'ORGANIC'
  return 'ORGANIC'
}

async function getDefaultDeliveryResponsibleId(): Promise<string> {
  const envId = process.env.TINTIM_DELIVERY_RESPONSIBLE_USER_ID?.trim()
  if (envId) {
    const u = await prisma.user.findUnique({ where: { id: envId } })
    if (u) return u.id
  }
  const u = await prisma.user.findFirst({
    where: { role: { in: ['ADMIN', 'DELIVERER', 'COMMERCIAL'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!u) throw new Error('Nenhum utilizador responsável para fila de entrega (configure TINTIM_DELIVERY_RESPONSIBLE_USER_ID)')
  return u.id
}

async function findIncomeCategoryId(): Promise<string | null> {
  const cat = await prisma.financialCategory.findFirst({
    where: { type: 'INCOME', active: true },
    orderBy: { name: 'asc' },
    select: { id: true },
  })
  return cat?.id ?? null
}

export async function processTintimSaleWebhook(
  body: Record<string, unknown>,
  opts?: { skipWelcome?: boolean }
): Promise<TintimWebhookResult> {
  const log = await prisma.integrationWebhookLog.create({
    data: {
      provider: 'TINTIM',
      eventType: String(body.event || body.event_type || body.tipo || 'venda_aprovada'),
      payload: body as object,
    },
  })

  const fail = async (msg: string, status = 400): Promise<TintimWebhookResult> => {
    await prisma.integrationWebhookLog.update({
      where: { id: log.id },
      data: { httpStatus: status, errorMessage: msg, result: { ok: false, error: msg } },
    })
    return { ok: false, logId: log.id, error: msg }
  }

  const customerName = String(
    body.customer_name || body.name || body.nome || body.customerName || ''
  ).trim()
  const customerEmail = normalizeEmail(
    String(body.customer_email || body.email || body.mail || '')
  )
  const customerPhoneRaw =
    String(body.customer_phone || body.phone || body.telefone || body.whatsapp || '').trim()
  const phoneNormalized = normalizePhoneDigits(customerPhoneRaw)
  const productId = String(body.product_id || body.productId || body.produto || '').trim()
  const valueRaw = body.value ?? body.valor ?? body.amount
  const externalRef = String(
    body.sale_id || body.external_id || body.id || body.venda_id || ''
  ).trim() || null

  if (!customerEmail && !phoneNormalized) {
    return fail('Informe customer_email ou customer_phone')
  }
  if (!productId) {
    return fail('product_id é obrigatório')
  }
  const valueNum = Number(valueRaw)
  if (!Number.isFinite(valueNum) || valueNum <= 0) {
    return fail('value inválido')
  }

  const productMap = parseProductMap()
  const mapped = productMap[productId]
  const productLabel = mapped?.product || String(body.product_name || `Produto ${productId}`)
  const accountType = mapped?.accountType || 'BRL'
  const quantity = mapped?.quantity ?? Math.max(1, parseInt(String(body.quantity || '1'), 10) || 1)

  const acquisition = resolveAcquisition(body)

  if (externalRef) {
    const dup = await prisma.order.findFirst({
      where: { orderSource: 'TINTIM', externalRef },
    })
    if (dup) {
      await prisma.integrationWebhookLog.update({
        where: { id: log.id },
        data: {
          httpStatus: 200,
          orderId: dup.id,
          clientId: dup.clientId,
          result: { ok: true, duplicate: true, orderId: dup.id },
        },
      })
      return { ok: true, logId: log.id, orderId: dup.id, clientId: dup.clientId }
    }
  }

  let user =
    customerEmail && customerEmail.length > 0
      ? await prisma.user.findFirst({
          where: { email: customerEmail, role: 'CLIENT' },
          include: { clientProfile: true },
        })
      : null

  if (!user && phoneNormalized) {
    const profiles = await prisma.clientProfile.findMany({
      where: { whatsapp: { not: null } },
      select: { id: true, userId: true, whatsapp: true },
      take: 5000,
    })
    for (const p of profiles) {
      if (phonesLikelyMatch(p.whatsapp, phoneNormalized)) {
        user = await prisma.user.findUnique({
          where: { id: p.userId },
          include: { clientProfile: true },
        })
        break
      }
    }
  }

  let createdUser = false
  let tempPass = ''

  if (!user) {
    if (!customerEmail) {
      return fail('E-mail obrigatório para criar novo cliente')
    }
    if (!customerName || customerName.length < 2) {
      return fail('customer_name inválido')
    }

    tempPass = `ADS${randomInt(1000, 9999)}`
    const passwordHash = await hash(tempPass, 12)

    const created = await prisma.$transaction(async (tx) => {
      const code = await allocateNextClientCode(tx)
      const u = await tx.user.create({
        data: {
          email: customerEmail,
          name: customerName,
          passwordHash,
          phone: customerPhoneRaw || null,
          role: 'CLIENT',
        },
      })
      await tx.clientProfile.create({
        data: {
          userId: u.id,
          clientCode: code,
          whatsapp: customerPhoneRaw || null,
          leadAcquisitionSource: acquisition,
          tintimFollowupPending: true,
        },
      })
      return u
    })
    user = await prisma.user.findUnique({
      where: { id: created.id },
      include: { clientProfile: true },
    })
    createdUser = true
  }

  if (!user?.clientProfile) {
    return fail('Perfil de cliente inconsistente')
  }

  const clientId = user.clientProfile.id

  const profBefore = await prisma.clientProfile.findUnique({
    where: { id: clientId },
    select: { totalSpent: true },
  })
  const prevSpent = Number(profBefore?.totalSpent ?? 0)
  await prisma.clientProfile.update({
    where: { id: clientId },
    data: {
      ...(acquisition ? { leadAcquisitionSource: acquisition } : {}),
      tintimFollowupPending: true,
      lastPurchaseAt: new Date(),
      totalSpent: new Prisma.Decimal(prevSpent + valueNum),
    },
  })

  const { assertClientCheckoutAllowed } = await import('@/lib/client-risk-profile')
  const gate = await assertClientCheckoutAllowed(clientId)
  if (!gate.ok) {
    return fail(gate.message)
  }

  const paidAt = new Date()
  const wh = 48
  const order = await prisma.order.create({
    data: {
      clientId,
      product: productLabel,
      accountType,
      quantity,
      value: new Prisma.Decimal(valueNum),
      currency: 'BRL',
      status: 'IN_SEPARATION',
      paidAt,
      warrantyHours: wh,
      warrantyEndsAt: computeWarrantyEndsAt(paidAt, wh),
      orderSource: 'TINTIM',
      externalRef: externalRef || undefined,
      discountCode: 'TINTIM',
      commercialBridgeAt: new Date(),
    },
  })

  const categoryId = await findIncomeCategoryId()
  await prisma.financialEntry.create({
    data: {
      type: 'INCOME',
      category: 'Vendas',
      categoryId: categoryId ?? undefined,
      value: new Prisma.Decimal(valueNum),
      currency: 'BRL',
      date: new Date(),
      orderId: order.id,
      description: `Tintim — ${productLabel} (cliente ${clientId.slice(0, 8)})`,
    },
  })

  const baseUrl = getPublicAppBaseUrl() || 'https://app.adsativos.com.br'
  const responsibleId = await getDefaultDeliveryResponsibleId()
  const groupNumber = await generateGroupNumber()
  const uniqueLink = `${baseUrl.replace(/\/$/, '')}/tintim-queue/${order.id}`

  await prisma.deliveryGroup.create({
    data: {
      groupNumber,
      clientId,
      orderId: order.id,
      whatsappGroupLink: uniqueLink,
      accountType: accountType === 'USD' ? 'USD' : 'BRL',
      quantityContracted: quantity,
      quantityDelivered: 0,
      currency: 'BRL',
      paymentType: 'AUTOMATICO',
      responsibleId,
      status: 'AGUARDANDO_INICIO',
      operationalBottleneck: 'AGUARDANDO_PRODUCAO',
      observacoesProducao: `Pedido automático Tintim — ${productLabel}. Cliente: ${customerName || customerEmail}`,
      saleDate: new Date(),
    },
  })

  if (!opts?.skipWelcome) {
    const panelUrl = `${baseUrl.replace(/\/$/, '')}/login`
    const comprasUrl = `${baseUrl.replace(/\/$/, '')}/dashboard/cliente/compras`
    const msg = createdUser
      ? [
          `Olá ${customerName || 'Cliente'}, seu acesso à Ads Ativos está liberado!`,
          `Painel: ${panelUrl}`,
          `Usuário: ${user.email}`,
          `Senha: ${tempPass}`,
          'Altere a senha após o primeiro login.',
        ].join('\n')
      : [
          `Olá ${customerName || 'Cliente'}, registramos sua compra: ${productLabel}.`,
          `Acompanhe em: ${comprasUrl}`,
        ].join('\n')

    if (customerPhoneRaw) {
      await sendWhatsApp({ phone: customerPhoneRaw, message: msg })
    }
    if (user.email) {
      await sendEmail({
        to: user.email,
        subject: createdUser
          ? 'Ads Ativos — seu acesso ao painel'
          : 'Ads Ativos — compra registrada',
        html: `<p>${msg.replace(/\n/g, '<br/>')}</p>`,
        text: msg,
      })
    }
  }

  await prisma.integrationWebhookLog.update({
    where: { id: log.id },
    data: {
      httpStatus: 200,
      orderId: order.id,
      clientId,
      result: {
        ok: true,
        orderId: order.id,
        clientId,
        userId: user.id,
        createdUser,
      },
    },
  })

  return {
    ok: true,
    logId: log.id,
    orderId: order.id,
    clientId,
    userId: user.id,
    createdUser,
  }
}
