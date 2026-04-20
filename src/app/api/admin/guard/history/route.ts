import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const take = Math.min(100, Math.max(10, parseInt(req.nextUrl.searchParams.get('take') || '40', 10)))

  const rows = await prisma.complianceHistory.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      tipoMidia: true,
      scoreRisco: true,
      termosDetectados: true,
      summary: true,
      stockAccountId: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ history: rows })
}
