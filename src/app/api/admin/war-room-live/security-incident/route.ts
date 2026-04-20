import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  MENTORADO_SECURITY_INCIDENT_KEY,
  parseSecurityIncident,
} from '@/lib/mentorado/war-room-settings'

const WRITE = ['ADMIN', 'COMMERCIAL'] as const

export async function GET() {
  const auth = await requireRoles([...WRITE, 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  const row = await prisma.systemSetting.findUnique({ where: { key: MENTORADO_SECURITY_INCIDENT_KEY } })
  return NextResponse.json({
    raw: row?.value ?? '',
    parsed: parseSecurityIncident(row?.value),
  })
}

export async function PATCH(req: Request) {
  const auth = await requireRoles([...WRITE])
  if (!auth.ok) return auth.response

  let body: { active?: boolean; title?: string; body?: string; videoUrl?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const payload = {
    active: Boolean(body.active),
    title: typeof body.title === 'string' ? body.title.slice(0, 200) : 'Manutenção de segurança',
    body: typeof body.body === 'string' ? body.body.slice(0, 8000) : '',
    videoUrl: body.videoUrl === null || body.videoUrl === undefined ? undefined : String(body.videoUrl).slice(0, 2000),
  }

  await prisma.systemSetting.upsert({
    where: { key: MENTORADO_SECURITY_INCIDENT_KEY },
    create: { key: MENTORADO_SECURITY_INCIDENT_KEY, value: JSON.stringify(payload) },
    update: { value: JSON.stringify(payload) },
  })

  return NextResponse.json({ ok: true, payload })
}
