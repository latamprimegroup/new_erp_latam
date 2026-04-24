/**
 * Notificações para admins — produção, estoque, vendas
 * Customizadas para marketing e acompanhamento no celular
 */
import { prisma } from '../prisma'
import { notify } from './index'
import { sendPush } from './channels/push'

const PLATFORM_LABELS: Record<string, string> = {
  GOOGLE_ADS: 'Google Ads',
  META_ADS: 'Meta Ads',
  KWAI_ADS: 'Kwai Ads',
  TIKTOK_ADS: 'TikTok Ads',
}

async function getAdminIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true },
  })
  return admins.map((u) => u.id)
}

async function getAdminAndFinanceIds(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'FINANCE'] } },
    select: { id: true },
  })
  return users.map((u) => u.id)
}

export async function notifyAdminsProductionInReview(
  codeG2: string,
  producerName: string | null
): Promise<void> {
  const adminIds = await getAdminIds()
  const title = 'Conta em análise'
  const message = `Conta ${codeG2} pronta para revisão${producerName ? ` — ${producerName}` : ''}`
  const link = '/dashboard/producao-g2?status=EM_REVISAO'

  for (const id of adminIds) {
    await notify({ userId: id, title, message, link, channels: ['IN_APP'] })
    await sendPush({
      userId: id,
      title: '📋 ' + title,
      body: message,
      link,
      tag: 'prod-em-revisao',
    })
  }
}

export async function notifyAdminsProductionApproved(
  codeG2: string,
  producerName: string | null
): Promise<void> {
  const adminIds = await getAdminIds()
  const title = 'Conta aprovada'
  const message = `${codeG2} aprovada${producerName ? ` — ${producerName}` : ''}`
  const link = '/dashboard/producao-g2'

  for (const id of adminIds) {
    await notify({ userId: id, title, message, link, channels: ['IN_APP'] })
    await sendPush({
      userId: id,
      title: '✅ ' + title,
      body: message,
      link,
      tag: 'prod-aprovada',
    })
  }
}

export async function notifyAdminsProductionAccountPending(
  platform: string,
  producerName: string | null
): Promise<void> {
  const adminIds = await getAdminIds()
  const platformLabel = PLATFORM_LABELS[platform] || platform
  const title = 'Conta produção em análise'
  const message = `Nova conta ${platformLabel} aguardando aprovação${producerName ? ` — ${producerName}` : ''}`
  const link = '/dashboard/producao?status=PENDING'

  for (const id of adminIds) {
    await notify({ userId: id, title, message, link, channels: ['IN_APP'] })
    await sendPush({
      userId: id,
      title: '📋 ' + title,
      body: message,
      link,
      tag: 'prod-em-analise',
    })
  }
}

/** Produção clássica: conta enviada para “Em análise” (UNDER_REVIEW) */
export async function notifyFinanceAndAdminsProductionClassicInReview(
  accountCode: string,
  producerName: string | null
): Promise<void> {
  const userIds = await getAdminAndFinanceIds()
  const title = 'Conta em análise (produção)'
  const message = `${accountCode} aguarda conferência${producerName ? ` — ${producerName}` : ''}`
  const link = '/dashboard/producao?status=UNDER_REVIEW'

  for (const id of userIds) {
    await notify({ userId: id, title, message, link, channels: ['IN_APP'] })
    await sendPush({
      userId: id,
      title: '🔍 ' + title,
      body: message,
      link,
      tag: 'prod-classic-em-analise',
    })
  }
}

export async function notifyAdminsProductionAccountApproved(
  platform: string
): Promise<void> {
  const adminIds = await getAdminIds()
  const platformLabel = PLATFORM_LABELS[platform] || platform
  const title = 'Conta produção aprovada'
  const message = `Nova conta ${platformLabel} aprovada`
  const link = '/dashboard/producao'

  for (const id of adminIds) {
    await notify({ userId: id, title, message, link, channels: ['IN_APP'] })
    await sendPush({
      userId: id,
      title: '✅ ' + title,
      body: message,
      link,
      tag: 'prod-conta-aprovada',
    })
  }
}

export async function notifyAdminsStockAdded(
  codeG2: string,
  platform: string
): Promise<void> {
  const adminIds = await getAdminIds()
  const platformLabel = PLATFORM_LABELS[platform] || platform
  const title = 'Conta no estoque'
  const message = `${codeG2} — ${platformLabel}`
  const link = '/dashboard/estoque'

  for (const id of adminIds) {
    await notify({ userId: id, title, message, link, channels: ['IN_APP'] })
    await sendPush({
      userId: id,
      title: '📦 ' + title,
      body: message,
      link,
      tag: 'estoque',
      data: { platform },
    })
  }
}

/** Cliente solicitou novas contas (Área do Cliente) — comercial / P&P / produção veem demanda futura */
/** Central de Ativos (Armory) — provisionamento com checkout / Tracker */
export async function notifyCreativeVaultJobRequest(opts: {
  clientEmail: string | null
  templateTitle: string
  ticketNumber: string
  iterationLabel: string
}): Promise<void> {
  const users = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'COMMERCIAL', 'PRODUCTION_MANAGER'] } },
    select: { id: true },
  })
  const who = opts.clientEmail || 'Cliente'
  const title = 'Creative Vault — nova edição'
  const message = `${who}: ${opts.templateTitle} · ${opts.iterationLabel} · ${opts.ticketNumber}`
  const link = '/dashboard/admin/creative-vault'

  for (const u of users) {
    await notify({ userId: u.id, title, message, link, channels: ['IN_APP'] })
    await sendPush({
      userId: u.id,
      title: '🎬 ' + title,
      body: message,
      link,
      tag: 'creative-vault-job',
    })
  }
}

export async function notifyCreativeVaultVslAdjustment(opts: {
  clientEmail: string | null
  ticketNumber: string
  dropOffSeconds: number
}): Promise<void> {
  const users = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'COMMERCIAL', 'PRODUCTION_MANAGER'] } },
    select: { id: true },
  })
  const who = opts.clientEmail || 'Cliente'
  const title = 'Pitch Watch — ajuste de VSL'
  const message = `${who}: drop em ${opts.dropOffSeconds}s · ${opts.ticketNumber}`
  const link = '/dashboard/admin/creative-vault'

  for (const u of users) {
    await notify({ userId: u.id, title, message, link, channels: ['IN_APP'] })
    await sendPush({
      userId: u.id,
      title: '📉 ' + title,
      body: message,
      link,
      tag: 'creative-vault-vsl',
    })
  }
}

export async function notifyWarRoomPreflight(opts: {
  clientEmail: string | null
  ticketNumber: string
  campaignUrl: string
}): Promise<void> {
  const users = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'COMMERCIAL', 'PRODUCTION_MANAGER'] } },
    select: { id: true },
  })
  const who = opts.clientEmail || 'Cliente'
  const title = 'War Room — pré-flight de campanha'
  const message = `${who} · ${opts.ticketNumber} · ${opts.campaignUrl.slice(0, 80)}`
  const link = '/dashboard/admin/war-room-live'

  for (const u of users) {
    await notify({ userId: u.id, title, message, link, channels: ['IN_APP'] })
    await sendPush({
      userId: u.id,
      title: '✈️ ' + title,
      body: message,
      link,
      tag: 'war-room-preflight',
    })
  }
}

export async function notifyWarRoomConcierge(opts: {
  clientEmail: string | null
  kind: string
  ticketNumber: string
}): Promise<void> {
  const users = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'COMMERCIAL', 'PRODUCTION_MANAGER'] } },
    select: { id: true },
  })
  const who = opts.clientEmail || 'Cliente'
  const title = 'Concierge VIP — pedido de suporte'
  const message = `${who} · ${opts.kind} · ${opts.ticketNumber}`
  const link = '/dashboard/admin/tickets'

  for (const u of users) {
    await notify({ userId: u.id, title, message, link, channels: ['IN_APP'] })
    await sendPush({
      userId: u.id,
      title: '🆘 ' + title,
      body: message,
      link,
      tag: 'war-room-concierge',
    })
  }
}

export async function notifyArmoryProvisioningRequest(opts: {
  clientEmail: string | null
  trafficSource: string
  operationLevel: string
  ticketNumber: string
}): Promise<void> {
  const users = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'COMMERCIAL', 'PRODUCTION_MANAGER', 'PLUG_PLAY'] } },
    select: { id: true },
  })
  const who = opts.clientEmail || 'Cliente'
  const title = 'Armory — em provisionamento'
  const message = `${who}: ${opts.trafficSource} · ${opts.operationLevel} · ${opts.ticketNumber}`
  const link = '/dashboard/admin/tickets'

  for (const u of users) {
    await notify({ userId: u.id, title, message, link, channels: ['IN_APP'] })
    await sendPush({
      userId: u.id,
      title: '🛡️ ' + title,
      body: message,
      link,
      tag: 'armory-provisioning',
    })
  }
}

export async function notifyStakeholdersNewAccountSolicitation(
  clientEmail: string | null,
  quantity: number,
  product: string,
  accountType: string,
): Promise<void> {
  const users = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'COMMERCIAL', 'PLUG_PLAY', 'PRODUCER'] } },
    select: { id: true },
  })
  const who = clientEmail || 'Cliente'
  const title = 'Nova solicitação de contas'
  const message = `${who}: ${quantity}× ${product} (${accountType})`
  const link = '/dashboard/admin/solicitacoes'

  for (const u of users) {
    await notify({ userId: u.id, title, message, link, channels: ['IN_APP'] })
    await sendPush({
      userId: u.id,
      title: '🛒 ' + title,
      body: message,
      link,
      tag: 'cliente-solicitacao',
    })
  }
}

/** Pulmão Comercial: handoff pago → produção, P&amp;P, entregas (Francielle / Gustavo). */
export async function notifyCommercialOxygenHandoff(opts: {
  orderId: string
  clientName: string
  quantity: number
  product: string
  accountType: string
  sellerName: string | null
  shortfall: number
  source: string
}): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      role: { in: ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER', 'PLUG_PLAY', 'DELIVERER'] },
    },
    select: { id: true },
  })
  const title = 'Pedido pago — fila operacional'
  const extra =
    opts.shortfall > 0
      ? ` Falta alocar/produzir ${opts.shortfall} conta(s). Solicitação criada.`
      : ' Contas já vinculadas ao pedido.'
  const message = `${opts.clientName}: ${opts.quantity}× ${opts.product} (${opts.accountType})${opts.sellerName ? ` — vendedor ${opts.sellerName}` : ''}.${extra} Origem: ${opts.source}.`
  const link = '/dashboard/admin/solicitacoes'

  for (const u of users) {
    await notify({ userId: u.id, title, message, link, channels: ['IN_APP'] })
    await sendPush({
      userId: u.id,
      title: '💰 ' + title,
      body: message,
      link,
      tag: 'oxygen-handoff',
    })
  }
}

export async function notifyAdminsSaleCompleted(
  orderId: string,
  clientName: string | null,
  quantity: number,
  platforms: string[]
): Promise<void> {
  const adminIds = await getAdminIds()
  const platformLabels = [...new Set(platforms.map((p) => PLATFORM_LABELS[p] || p))]
  const platformsStr = platformLabels.length > 0 ? platformLabels.join(', ') : 'Contas'
  const title = '💰 Venda realizada'
  const body = `${quantity} conta(s) — ${platformsStr}${clientName ? ` • ${clientName}` : ''}`
  const link = '/dashboard/vendas'

  for (const id of adminIds) {
    await notify({
      userId: id,
      title,
      message: body,
      link,
      channels: ['IN_APP'],
    })
    await sendPush({
      userId: id,
      title: '💰 Venda realizada',
      body,
      link,
      tag: 'venda',
      data: { orderId, quantity },
    })
  }
}

export async function notifyAdminsQuickSaleApproved(opts: {
  checkoutId: string
  buyerName: string
  listingTitle: string
  quantity: number
  totalAmount: number
}): Promise<void> {
  const adminIds = await getAdminIds()
  const title = '💰 Venda rápida aprovada'
  const body = `${opts.quantity}x ${opts.listingTitle} • ${opts.buyerName} • ${opts.totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
  const link = '/dashboard/compras'

  for (const id of adminIds) {
    await notify({
      userId: id,
      title,
      message: body,
      link,
      channels: ['IN_APP'],
    })
    await sendPush({
      userId: id,
      title,
      body,
      link,
      tag: 'venda-rapida',
      data: { checkoutId: opts.checkoutId, quantity: opts.quantity },
    })
  }
}

export async function notifyAdminsGuardPolicyPageChanged(
  changePercent: number,
  sourceUrl: string,
): Promise<void> {
  const adminIds = await getAdminIds()
  const title = '🛡️ Política Google Ads (ajuda) alterada'
  const body = `Variação ~${changePercent.toFixed(1)}% no texto. Reveja os prompts do Guard.`
  const link = '/dashboard/admin/guard'

  for (const id of adminIds) {
    await notify({
      userId: id,
      title,
      message: body,
      link,
      channels: ['IN_APP'],
    })
    await sendPush({
      userId: id,
      title,
      body: `${body} ${sourceUrl.slice(0, 80)}`,
      link,
      tag: 'guard-policy',
    })
  }
}

export async function notifyAdminsClientMethodAuditAlert(clientName: string): Promise<void> {
  const adminIds = await getAdminIds()
  const title = '🚨 Alerta de reputação de cliente'
  const body = `Alerta: Auditar método do cliente ${clientName}`
  const link = '/dashboard/admin/reputacao'

  for (const id of adminIds) {
    await notify({
      userId: id,
      title,
      message: body,
      link,
      channels: ['IN_APP'],
    })
    await sendPush({
      userId: id,
      title,
      body,
      link,
      tag: 'reputation-lock',
    })
  }
}
