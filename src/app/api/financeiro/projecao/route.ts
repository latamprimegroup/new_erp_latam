import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const monthsAhead = Math.min(12, Math.max(1, parseInt(searchParams.get('months') || '3')))

  const now = new Date()
  const startHist = new Date(now.getFullYear(), now.getMonth() - 6, 1)
  const endHist = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

  const historical = await prisma.financialEntry.findMany({
    where: { date: { gte: startHist, lte: endHist } },
    select: { type: true, value: true, date: true },
  })

  const incomeByMonth: Record<string, number> = {}
  const expenseByMonth: Record<string, number> = {}

  for (const e of historical) {
    const key = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, '0')}`
    const val = typeof e.value === 'object' && e.value && 'toString' in e.value
      ? parseFloat((e.value as Decimal).toString())
      : Number(e.value)
    if (e.type === 'INCOME') incomeByMonth[key] = (incomeByMonth[key] || 0) + val
    else expenseByMonth[key] = (expenseByMonth[key] || 0) + val
  }

  const avgIncome =
    Object.keys(incomeByMonth).length > 0
      ? Object.values(incomeByMonth).reduce((a, b) => a + b, 0) / Object.keys(incomeByMonth).length
      : 0
  const avgExpense =
    Object.keys(expenseByMonth).length > 0
      ? Object.values(expenseByMonth).reduce((a, b) => a + b, 0) / Object.keys(expenseByMonth).length
      : 0

  const allEntries = await prisma.financialEntry.findMany({
    where: { date: { lte: endHist } },
    select: { type: true, value: true },
  })

  let currentBalance = 0
  for (const e of allEntries) {
    const val = typeof e.value === 'object' && e.value && 'toString' in e.value
      ? parseFloat((e.value as Decimal).toString())
      : Number(e.value)
    if (e.type === 'INCOME') currentBalance += val
    else currentBalance -= val
  }

  const projection: { month: string; balance: number; income: number; expense: number }[] = []
  let balance = currentBalance

  for (let i = 1; i <= monthsAhead; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    balance += avgIncome - avgExpense
    projection.push({
      month: key,
      balance,
      income: avgIncome,
      expense: avgExpense,
    })
  }

  return NextResponse.json({
    currentBalance,
    avgIncome,
    avgExpense,
    projection,
  })
}
