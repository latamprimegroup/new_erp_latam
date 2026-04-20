/**
 * Vault — registro de perfil de navegador (AdsPower/Dolphin): apenas IDs externos.
 * Senhas/cookies nunca trafegam por esta API; auditoria obrigatória.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { audit } from '@/lib/audit'

const bodySchema = z.object({
  provider: z.enum(['ads_power', 'dolphin', 'other']),
  externalProfileId: z.string().min(2).max(200),
  label: z.string().max(120).optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (auth.session.user.role !== 'PRODUCER' && auth.session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Apenas produtor ou admin' }, { status: 403 })
  }

  try {
    const body = bodySchema.parse(await req.json())
    await audit({
      userId: auth.session.user.id,
      action: 'vault_browser_profile_registered',
      entity: 'VaultBrowserProfile',
      details: {
        provider: body.provider,
        externalProfileId: body.externalProfileId,
        label: body.label ?? null,
      },
    })
    return NextResponse.json({ ok: true, message: 'Referência registrada (sem segredos).' })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    throw e
  }
}
