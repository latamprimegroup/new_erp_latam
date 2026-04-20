import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { pushTrafficShieldConfigToEdge } from '@/lib/traffic-shield/push-config'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const

/** POST — Envia política + IPs bloqueados ao edge agora. */
export async function POST() {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const r = await pushTrafficShieldConfigToEdge()
  return NextResponse.json(r)
}
