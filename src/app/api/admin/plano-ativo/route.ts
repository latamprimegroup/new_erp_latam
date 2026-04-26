/**
 * POST /api/admin/plano-ativo
 * Cria um Plano de Ativos (assinatura recorrente mensal).
 * O cliente paga um valor fixo por mês e recebe N ativos/mês do listing.
 *
 * GET /api/admin/plano-ativo
 * Lista planos ativos com próxima renovação e status.
 *
 * Modelo de dados: usa Subscription existente com profileType=RENTAL_USER
 * + SystemSetting para configuração do plano por listing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'
import { getPublicAppBaseUrl } from '@/lib/public-app-url'
import { z } from 'zod'

const PLANO_PREFIX = 'plano_ativo:'

const createSchema = z.object({
  listingId:      z.string().min(1),
  clientName:     z.string().min(2).max(200),
  clientWhatsapp: z.string().regex(/^\+?55\d{8,11}$/),
  clientEmail:    z.string().email().optional(),
  /** Quantidade de ativos por mês */
  qtyPerMonth:    z.number().int().min(1).max(50),
  /** Valor mensal total em R$ */
  monthlyAmount:  z.number().positive(),
  /** Dia do mês para renovação (1-28) */
  billingDay:     z.number().int().min(1).max(28).default(1),
  /** Nota interna */
  note:           z.string().max(300).optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'CEO', 'COMMERCIAL'])
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

  const listing = await prisma.productListing.findUnique({
    where: { id: data.listingId, active: true },
    select: { id: true, title: true, slug: true },
  })
  if (!listing) return NextResponse.json({ error: 'Listing não encontrado ou inativo.' }, { status: 404 })

  // Calcula próxima renovação
  const now  = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), data.billingDay)
  if (next <= now) next.setMonth(next.getMonth() + 1)

  // Persiste plano em SystemSetting (estrutura JSON por plano)
  const planId  = `${PLANO_PREFIX}${Date.now()}`
  const planData = {
    id:             planId,
    listingId:      listing.id,
    listingTitle:   listing.title,
    listingSlug:    listing.slug,
    clientName:     data.clientName,
    clientWhatsapp: data.clientWhatsapp.startsWith('+') ? data.clientWhatsapp : `+${data.clientWhatsapp}`,
    clientEmail:    data.clientEmail ?? null,
    qtyPerMonth:    data.qtyPerMonth,
    monthlyAmount:  data.monthlyAmount,
    billingDay:     data.billingDay,
    nextRenewalAt:  next.toISOString(),
    status:         'ACTIVE',
    createdBy:      auth.session.user.name ?? auth.session.user.id,
    createdAt:      now.toISOString(),
    note:           data.note ?? null,
    renewalCount:   0,
  }

  await prisma.systemSetting.create({
    data: { key: planId, value: JSON.stringify(planData) },
  })

  // WhatsApp de boas-vindas ao cliente
  const appBase = getPublicAppBaseUrl() ?? process.env.NEXTAUTH_URL ?? ''
  const welcomeMsg = [
    `🎉 *Plano de Ativos Ativo — Ads Ativos*`,
    ``,
    `Olá, ${data.clientName}!`,
    ``,
    `Seu plano mensal foi configurado com sucesso:`,
    `📦 Produto: *${listing.title}*`,
    `📊 Quantidade: *${data.qtyPerMonth} ativo(s)/mês*`,
    `💰 Valor: *R$ ${data.monthlyAmount.toFixed(2)}/mês*`,
    `📅 Próxima renovação: *${next.toLocaleDateString('pt-BR')}*`,
    ``,
    `Na data de renovação, você receberá automaticamente uma mensagem com o link de pagamento PIX.`,
    ``,
    `_Ads Ativos — Infraestrutura de escala._`,
  ].join('\n')

  sendWhatsApp({
    phone:   planData.clientWhatsapp,
    message: welcomeMsg,
  }).catch((e) => console.error('[PlanoAtivo] WhatsApp welcome failed:', e))

  await prisma.auditLog.create({
    data: {
      action: 'PLANO_ATIVO_CRIADO',
      entity: 'SystemSetting',
      entityId: planId,
      userId: auth.session.user.id,
      details: planData,
    },
  }).catch(() => {})

  return NextResponse.json({ ok: true, planId, nextRenewalAt: next.toISOString() }, { status: 201 })
}

export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'CEO', 'COMMERCIAL'])
  if (!auth.ok) return auth.response

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status') ?? 'ACTIVE'

  const settings = await prisma.systemSetting.findMany({
    where: { key: { startsWith: PLANO_PREFIX } },
    orderBy: { id: 'desc' },
    take: 200,
  })

  const plans = settings
    .map((s) => {
      try { return JSON.parse(s.value) as Record<string, unknown> }
      catch { return null }
    })
    .filter(Boolean)
    .filter((p) => !status || p!.status === status)

  return NextResponse.json({ plans, total: plans.length })
}
