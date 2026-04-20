import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { listMccLinkedClients, pauseAllEnabledCampaignsForCustomers } from '@/lib/google-ads-mcc'

const bodySchema = z.object({
  googleCustomerIds: z.array(z.string().min(5)).min(1),
})

export async function POST(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'googleCustomerIds obrigatório' }, { status: 400 })
  }

  const linked = await listMccLinkedClients()
  if (!linked) {
    return NextResponse.json({ error: 'Não foi possível validar contas no MCC.' }, { status: 502 })
  }

  const allowed = new Set(linked.map((c) => c.googleCustomerId.replace(/\D/g, '')))
  const normalized = parsed.data.googleCustomerIds
    .map((id) => id.replace(/\D/g, ''))
    .filter((id) => allowed.has(id))

  if (normalized.length === 0) {
    return NextResponse.json({ error: 'Nenhum ID pertence ao MCC configurado.' }, { status: 403 })
  }

  const result = await pauseAllEnabledCampaignsForCustomers(normalized)
  return NextResponse.json({
    ok: true,
    pausedCampaigns: result.paused,
    warning: result.errors,
    customersTouched: normalized.length,
  })
}
