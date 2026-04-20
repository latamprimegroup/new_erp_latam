import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  WAR_ROOM_CONCIERGE_LINKS_KEY,
  WAR_ROOM_LIVE_CONFIG_KEY,
  parseConciergeLinks,
  parseWarRoomLiveConfig,
} from '@/lib/mentorado/war-room-settings'

const WRITE = ['ADMIN', 'COMMERCIAL'] as const

export async function GET() {
  const auth = await requireRoles([...WRITE, 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  const [liveRow, conciergeRow] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: WAR_ROOM_LIVE_CONFIG_KEY } }),
    prisma.systemSetting.findUnique({ where: { key: WAR_ROOM_CONCIERGE_LINKS_KEY } }),
  ])

  return NextResponse.json({
    liveConfig: parseWarRoomLiveConfig(liveRow?.value),
    conciergeLinks: parseConciergeLinks(conciergeRow?.value),
    liveConfigRaw: liveRow?.value ?? '',
    conciergeLinksRaw: conciergeRow?.value ?? '',
  })
}

export async function PATCH(req: Request) {
  const auth = await requireRoles([...WRITE])
  if (!auth.ok) return auth.response

  let body: { liveConfig?: unknown; conciergeLinks?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (body.liveConfig !== undefined) {
    const raw = JSON.stringify(body.liveConfig)
    await prisma.systemSetting.upsert({
      where: { key: WAR_ROOM_LIVE_CONFIG_KEY },
      create: { key: WAR_ROOM_LIVE_CONFIG_KEY, value: raw },
      update: { value: raw },
    })
  }

  if (body.conciergeLinks !== undefined) {
    const raw = JSON.stringify(body.conciergeLinks)
    await prisma.systemSetting.upsert({
      where: { key: WAR_ROOM_CONCIERGE_LINKS_KEY },
      create: { key: WAR_ROOM_CONCIERGE_LINKS_KEY, value: raw },
      update: { value: raw },
    })
  }

  return NextResponse.json({ ok: true })
}
