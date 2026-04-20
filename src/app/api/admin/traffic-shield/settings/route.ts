import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { getOrCreateTrafficShieldSettings } from '@/lib/traffic-shield/settings-store'
import { prisma } from '@/lib/prisma'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const

export async function GET() {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const s = await getOrCreateTrafficShieldSettings()
  return NextResponse.json({
    settings: {
      blockDatacenterAsns: s.blockDatacenterAsns,
      requireClickIdParam: s.requireClickIdParam,
      pushEnvironmentHints: s.pushEnvironmentHints,
      enableSpyToolBlocking: s.enableSpyToolBlocking,
      edgeWebhookUrl: s.edgeWebhookUrl,
      lastPushAt: s.lastPushAt?.toISOString() ?? null,
      lastPushOk: s.lastPushOk,
      lastPushError: s.lastPushError,
    },
  })
}

export async function PATCH(req: Request) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (typeof body.blockDatacenterAsns === 'boolean') data.blockDatacenterAsns = body.blockDatacenterAsns
  if (typeof body.requireClickIdParam === 'boolean') data.requireClickIdParam = body.requireClickIdParam
  if (typeof body.pushEnvironmentHints === 'boolean') data.pushEnvironmentHints = body.pushEnvironmentHints
  if (typeof body.enableSpyToolBlocking === 'boolean') data.enableSpyToolBlocking = body.enableSpyToolBlocking
  if (body.edgeWebhookUrl === null) data.edgeWebhookUrl = null
  else if (typeof body.edgeWebhookUrl === 'string') {
    data.edgeWebhookUrl = body.edgeWebhookUrl.trim().slice(0, 800) || null
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Sem campos' }, { status: 400 })
  }

  await prisma.trafficShieldSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...(data as object) },
    update: data as object,
  })

  const s = await getOrCreateTrafficShieldSettings()
  return NextResponse.json({ ok: true, settings: s })
}
