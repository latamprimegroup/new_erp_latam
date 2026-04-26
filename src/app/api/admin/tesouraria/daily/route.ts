/**
 * GET /api/admin/tesouraria/daily
 *
 * Série temporal diária de faturamento por gateway (30 dias).
 * Usado para o gráfico de barras empilhadas do dashboard.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { subDays, startOfDay, format, eachDayOfInterval } from 'date-fns'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!['ADMIN', 'CEO'].includes(role ?? '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const days = Math.min(90, Math.max(7, Number.parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10)))
  const since = subDays(new Date(), days)

  // Todos os dias do intervalo
  const allDays = eachDayOfInterval({ start: startOfDay(since), end: startOfDay(new Date()) })
  const dayMap  = new Map<string, { inter: number; mercury: number; kast: number; total: number }>()
  for (const d of allDays) {
    dayMap.set(format(d, 'yyyy-MM-dd'), { inter: 0, mercury: 0, kast: 0, total: 0 })
  }

  // QuickSale PIX (Inter)
  const pixRows = await prisma.quickSaleCheckout.findMany({
    where: { status: 'PAID', paidAt: { gte: since } },
    select: { paidAt: true, totalAmount: true },
  }).catch(() => [] as never[])

  for (const r of pixRows) {
    if (!r.paidAt) continue
    const k = format(r.paidAt, 'yyyy-MM-dd')
    const d = dayMap.get(k)
    if (!d) continue
    const v = Number(r.totalAmount)
    d.inter += v
    d.total += v
  }

  // Sales Checkout PIX (legado)
  const salesRows = await prisma.salesCheckout.findMany({
    where: { status: 'PAID', paidAt: { gte: since } },
    select: { paidAt: true, amount: true },
  }).catch(() => [] as never[])

  for (const r of salesRows) {
    if (!r.paidAt) continue
    const k = format(r.paidAt, 'yyyy-MM-dd')
    const d = dayMap.get(k)
    if (!d) continue
    const v = Number(r.amount)
    d.inter += v
    d.total += v
  }

  // Mercury + Kast via Transaction table
  const txRows = await prisma.transaction.findMany({
    where: {
      status:     'APPROVED',
      gateway:    { in: ['MERCURY', 'KAST'] },
      occurredAt: { gte: since },
    },
    select: { gateway: true, grossAmount: true, currency: true, fxRateBrlUsd: true, occurredAt: true },
  }).catch(() => [] as never[])

  for (const t of txRows) {
    const k = format(t.occurredAt, 'yyyy-MM-dd')
    const d = dayMap.get(k)
    if (!d) continue
    const gross   = Number(t.grossAmount)
    const fx      = Number(t.fxRateBrlUsd ?? 5.2)
    const brlVal  = t.currency === 'USD' ? gross * fx : gross
    if (t.gateway === 'MERCURY') { d.mercury += brlVal; d.total += brlVal }
    if (t.gateway === 'KAST')    { d.kast    += brlVal; d.total += brlVal }
  }

  const series = Array.from(dayMap.entries()).map(([date, v]) => ({
    date,
    inter:   Math.round(v.inter * 100) / 100,
    mercury: Math.round(v.mercury * 100) / 100,
    kast:    Math.round(v.kast * 100) / 100,
    total:   Math.round(v.total * 100) / 100,
  }))

  return NextResponse.json({ series, days })
}
