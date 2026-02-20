import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') || String(new Date().getMonth() + 1)
  const year = searchParams.get('year') || String(new Date().getFullYear())

  const start = new Date(parseInt(year), parseInt(month) - 1, 1)
  const end = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59)
  const where = { date: { gte: start, lte: end } }

  const byCategory = await prisma.financialEntry.groupBy({
    by: ['category', 'type'],
    where,
    _sum: { value: true },
  })

  const receipts: { category: string; value: number }[] = []
  const expenses: { category: string; value: number }[] = []

  for (const row of byCategory) {
    const value = Number(row._sum.value ?? 0)
    if (row.type === 'INCOME') receipts.push({ category: row.category, value })
    else expenses.push({ category: row.category, value })
  }

  const totalReceipts = receipts.reduce((s, r) => s + r.value, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.value, 0)
  const result = totalReceipts - totalExpenses

  return NextResponse.json({
    period: { month: parseInt(month), year: parseInt(year) },
    receipts,
    expenses,
    totalReceipts,
    totalExpenses,
    result,
  })
}
