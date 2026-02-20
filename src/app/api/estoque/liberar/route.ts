import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { releaseEmail, releaseCnpj, releasePaymentProfile } from '@/lib/stock-assignment'
import { audit } from '@/lib/audit'
import { getAuthenticatedKey, withRateLimit } from '@/lib/rate-limit-api'

/**
 * POST /api/estoque/liberar
 * Libera reserva (devolve item ao estoque disponível)
 * Body: { tipo: 'email'|'cnpj'|'perfil', id: string }
 */
export async function POST(req: Request) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER'])
  if (!auth.ok) return auth.response
  const session = auth.session

  const limited = withRateLimit(req, getAuthenticatedKey(session.user!.id, 'estoque:liberar'), { max: 30, windowMs: 60_000 })
  if (limited) return limited

  const producerId = session.user!.id

  try {
    const body = await req.json()
    const tiposValidos = ['email', 'cnpj', 'perfil']
    const tipo = typeof body?.tipo === 'string' && tiposValidos.includes(body.tipo) ? body.tipo : null
    const id = typeof body?.id === 'string' && body.id.trim().length > 0 ? body.id.trim() : null
    if (!tipo || !id) {
      return NextResponse.json({ error: 'Informe tipo (email|cnpj|perfil) e id válido' }, { status: 400 })
    }

    let result
    if (tipo === 'email') {
      result = await releaseEmail(id, producerId)
    } else if (tipo === 'cnpj') {
      result = await releaseCnpj(id, producerId)
    } else if (tipo === 'perfil') {
      result = await releasePaymentProfile(id, producerId)
    } else {
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
    }

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    await audit({
      userId: producerId,
      action: 'RELEASE_STOCK',
      entity: tipo.toUpperCase(),
      entityId: id,
      details: {},
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Erro ao liberar' }, { status: 500 })
  }
}
