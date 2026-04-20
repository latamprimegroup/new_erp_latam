import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'

const bodySchema = z.object({
  /** ID do ativo ADS CORE (`ads_core_assets.id`) */
  assetId: z.string().min(1),
  /** Usuário produtor (`users.id`, role PRODUCER) */
  producerId: z.string().min(1),
})

/**
 * Alias documentado para integrações: mesma regra e travas que
 * `PATCH /api/ads-core/assets/:assetId` com `{ producerId }` (atribuição nominal + trava de pool).
 */
export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (!['ADMIN', 'PRODUCTION_MANAGER'].includes(auth.session.user.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json(
      { error: 'Informe assetId e producerId (corpo JSON).' },
      { status: 400 }
    )
  }

  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000'
  const proto = h.get('x-forwarded-proto') || 'http'
  const origin = `${proto}://${host}`
  const cookie = h.get('cookie') || ''

  const res = await fetch(`${origin}/api/ads-core/assets/${encodeURIComponent(body.assetId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify({ producerId: body.producerId }),
  })

  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
