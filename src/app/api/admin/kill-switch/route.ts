import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const KEY = 'global_kill_switch'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY } })
  const active = row?.value === '1' || row?.value === 'true'
  return NextResponse.json({ active })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const active = !!body.active
  await prisma.systemSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: active ? '1' : '0' },
    update: { value: active ? '1' : '0' },
  })
  return NextResponse.json({ active })
}
