/**
 * GET /api/admin/ad-monitoring/commissions?month=YYYY-MM
 *
 * Calcula comissões devidas por cliente no mês indicado.
 * Cruza AdSpendLog com commissionRatePct para gerar o faturamento por spend.
 *
 * Retorna:
 *   - Comissão total do mês (agregada por cliente)
 *   - Lista por conta com gasto, taxa e comissão calculada
 *   - Total geral de comissões do mês (usado no CEO 8D view)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startOfMonth, endOfMonth, parseISO } from 'date-fns'

function isAdmin(s: Awaited<ReturnType<typeof getServerSession>>) {
  return ['ADMIN', 'COMMERCIAL'].includes((s?.user as { role?: string } | undefined)?.role ?? '')
}

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const monthStr = searchParams.get('month') ?? new Date().toISOString().slice(0, 7)

  let periodStart: Date
  let periodEnd: Date
  try {
    const parsed = parseISO(`${monthStr}-01`)
    periodStart  = startOfMonth(parsed)
    periodEnd    = endOfMonth(parsed)
  } catch {
    return NextResponse.json({ error: 'Formato de mês inválido. Use YYYY-MM' }, { status: 400 })
  }

  // Busca todos os logs do período
  const logs = await prisma.adSpendLog.findMany({
    where: { date: { gte: periodStart, lte: periodEnd } },
    include: {
      monitoring: {
        select: {
          platform:          true,
          adAccountId:       true,
          adAccountName:     true,
          commissionRatePct: true,
          clientId:          true,
          client: {
            select: {
              clientCode:  true,
              profileType: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
    orderBy: { date: 'asc' },
  })

  // Agrega por cliente
  const byClient: Record<string, {
    clientId:    string
    clientName:  string
    clientEmail: string
    clientCode:  string | null
    profileType: string
    totalSpendBrl:   number
    totalCommBrl:    number
    accounts: Record<string, {
      platform:          string
      adAccountId:       string
      adAccountName:     string | null
      commissionRatePct: number
      spendBrl:          number
      commBrl:           number
      days:              number
    }>
  }> = {}

  for (const log of logs) {
    const m   = log.monitoring
    const cId = m.clientId

    if (!byClient[cId]) {
      byClient[cId] = {
        clientId:      cId,
        clientName:    m.client.user?.name    ?? 'N/A',
        clientEmail:   m.client.user?.email   ?? 'N/A',
        clientCode:    m.client.clientCode,
        profileType:   m.client.profileType,
        totalSpendBrl: 0,
        totalCommBrl:  0,
        accounts:      {},
      }
    }

    const key = `${m.platform}:${m.adAccountId}`
    if (!byClient[cId].accounts[key]) {
      byClient[cId].accounts[key] = {
        platform:          m.platform,
        adAccountId:       m.adAccountId,
        adAccountName:     m.adAccountName,
        commissionRatePct: Number(m.commissionRatePct),
        spendBrl:          0,
        commBrl:           0,
        days:              0,
      }
    }

    const spend = Number(log.spendBrl)
    const comm  = Number(log.commissionBrl)
    byClient[cId].totalSpendBrl             += spend
    byClient[cId].totalCommBrl              += comm
    byClient[cId].accounts[key].spendBrl   += spend
    byClient[cId].accounts[key].commBrl    += comm
    byClient[cId].accounts[key].days       += 1
  }

  const clients = Object.values(byClient).map((c) => ({
    ...c,
    accounts: Object.values(c.accounts),
    totalSpendBrl: Math.round(c.totalSpendBrl * 100) / 100,
    totalCommBrl:  Math.round(c.totalCommBrl  * 100) / 100,
  })).sort((a, b) => b.totalCommBrl - a.totalCommBrl)

  const grandTotalComm  = clients.reduce((s, c) => s + c.totalCommBrl, 0)
  const grandTotalSpend = clients.reduce((s, c) => s + c.totalSpendBrl, 0)

  return NextResponse.json({
    month:          monthStr,
    periodStart:    periodStart.toISOString(),
    periodEnd:      periodEnd.toISOString(),
    grandTotalSpendBrl: Math.round(grandTotalSpend * 100) / 100,
    grandTotalCommBrl:  Math.round(grandTotalComm  * 100) / 100,
    clientCount:    clients.length,
    clients,
  })
}
