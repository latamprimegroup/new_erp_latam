import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { pushTrafficShieldConfigToEdge } from '@/lib/traffic-shield/push-config'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  let body: { active?: boolean; push?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const data: { active?: boolean } = {}
  if (typeof body.active === 'boolean') data.active = body.active
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Sem campos' }, { status: 400 })
  }

  try {
    const row = await prisma.trafficShieldSpyBlock.update({ where: { id }, data })
    let pushResult: Awaited<ReturnType<typeof pushTrafficShieldConfigToEdge>> | null = null
    if (body.push !== false) {
      pushResult = await pushTrafficShieldConfigToEdge()
    }
    return NextResponse.json({ ok: true, block: row, push: pushResult })
  } catch {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const sp = new URL(req.url).searchParams
  const noPush = sp.get('push') === '0'

  try {
    await prisma.trafficShieldSpyBlock.delete({ where: { id } })
    let pushResult: Awaited<ReturnType<typeof pushTrafficShieldConfigToEdge>> | null = null
    if (!noPush) {
      pushResult = await pushTrafficShieldConfigToEdge()
    }
    return NextResponse.json({ ok: true, push: pushResult })
  } catch {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  }
}
