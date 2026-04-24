import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'
import { sendTelegramSalesMessage } from '@/lib/telegram-sales'
import { notify } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'

function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function sanitizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return null
  return digits.startsWith('55') ? digits : `55${digits}`
}

export async function notifySellerSaleApproved(opts: {
  sellerId: string
  publicId: string
  saleValue: number
  sellerCommission: number
  remainingToUnlock: number
}): Promise<void> {
  const seller = await prisma.user.findUnique({
    where: { id: opts.sellerId },
    select: { id: true, phone: true },
  })
  if (!seller) return

  const message = [
    `🚀 VENDA REALIZADA!`,
    `ID: ${opts.publicId}`,
    `Valor: ${brl(opts.saleValue)}`,
    `Sua Comissão: ${brl(opts.sellerCommission)}`,
    `Faltam ${brl(Math.max(0, opts.remainingToUnlock))} para liberar seus saques de comissão do mês!`,
  ].join(' | ')

  await notify({
    userId: seller.id,
    type: 'SALE_APPROVED_SELLER',
    title: 'Venda aprovada',
    message,
    link: '/dashboard/vendas',
    channels: ['IN_APP'],
  }).catch((e) => console.error('[incentive notify seller/in-app]', e))

  const phone = sanitizePhone(seller.phone)
  if (phone) {
    await sendWhatsApp({ phone, message }).catch((e) =>
      console.error('[incentive notify seller/whatsapp]', e),
    )
  }
}

export async function notifyAdminSaleProfitSummary(opts: {
  publicId: string
  saleValue: number
  sellerName: string | null
  supplierCost: number
  sellerCommission: number
  managerCommission: number
  netProfit: number
  utmifySynced: boolean
}): Promise<void> {
  const status = opts.utmifySynced ? 'Sincronizado' : 'Falha (reprocessar)'
  const text = [
    `🛡️ ADS ATIVOS - VENDA CONFIRMADA!`,
    `💰 Bruto: ${brl(opts.saleValue)}`,
    `👤 Vendedor: ${opts.sellerName || 'N/D'}`,
    `📉 Custo Ativo: ${brl(opts.supplierCost)}`,
    `💸 Comissão: ${brl(opts.sellerCommission + opts.managerCommission)}`,
    `💎 LUCRO LÍQUIDO: ${brl(opts.netProfit)}`,
    `✅ Status Utmify: ${status}`,
    `🆔 ID Público: ${opts.publicId}`,
  ].join('\n')

  await sendTelegramSalesMessage(text).catch((e) =>
    console.error('[incentive notify admin/telegram]', e),
  )
}

export async function sendSaleIncentiveNotifications(opts: {
  sellerId: string
  sellerName: string | null
  publicId: string
  grossValue: number
  sellerCommission: number
  managerCommission: number
  supplierCost: number
  netProfit: number
  remainingToUnlock: number
  utmifySynced: boolean
}): Promise<void> {
  await notifySellerSaleApproved({
    sellerId: opts.sellerId,
    publicId: opts.publicId,
    saleValue: opts.grossValue,
    sellerCommission: opts.sellerCommission,
    remainingToUnlock: opts.remainingToUnlock,
  })

  await notifyAdminSaleProfitSummary({
    publicId: opts.publicId,
    saleValue: opts.grossValue,
    sellerName: opts.sellerName,
    supplierCost: opts.supplierCost,
    sellerCommission: opts.sellerCommission,
    managerCommission: opts.managerCommission,
    netProfit: opts.netProfit,
    utmifySynced: opts.utmifySynced,
  })
}
