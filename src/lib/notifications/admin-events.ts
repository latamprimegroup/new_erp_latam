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
