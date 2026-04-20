import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { encrypt } from '@/lib/encryption'
import { prisma } from '@/lib/prisma'
import { assertCardPanUnique, cardPanFingerprint, normalizePanForHash } from '@/lib/gatekeeper/uniqueness-guard'
import { maskCardPan } from '@/lib/gatekeeper/masking'
import { mapGatekeeperPrismaError } from '@/lib/gatekeeper/prisma-gatekeeper'
import { GatekeeperBlockedError, GATEKEEPER_CROSSING_ERROR } from '@/lib/gatekeeper/errors'
import { gatekeeperAudit } from '@/lib/gatekeeper/audit-log'

type LogEntry = { step: string; ok: boolean }

/**
 * POST — Cartão: PAN cifrado; unicidade por SHA-256 do PAN normalizado.
 * Body: { pan: string, holderName?: string }
 */
export async function POST(req: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  let body: { pan?: string; holderName?: string }
  try {
    body = (await req.json()) as { pan?: string; holderName?: string }
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const panDigits = normalizePanForHash(typeof body.pan === 'string' ? body.pan : '')
  const holderName = typeof body.holderName === 'string' ? body.holderName.trim() || null : null
  const logs: LogEntry[] = []
  const push = (step: string, ok: boolean) => logs.push({ step, ok })

  if (panDigits.length < 12 || panDigits.length > 19) {
    return NextResponse.json({ error: 'PAN inválido (12–19 dígitos)' }, { status: 400 })
  }

  const panHash = cardPanFingerprint(panDigits)

  push('Cifrando PAN…', true)
  gatekeeperAudit('CARD_PAN', 'Início ingestão PAN (hash + cifra)', { panMasked: maskCardPan(panDigits) })
  const cardPanEnc = encrypt(panDigits)

  push('Verificando unicidade…', true)
  try {
    await assertCardPanUnique(panHash)
    push('Unicidade confirmada', true)
  } catch (e) {
    if (e instanceof GatekeeperBlockedError) {
      push(GATEKEEPER_CROSSING_ERROR, false)
      return NextResponse.json({ ok: false, logs, error: GATEKEEPER_CROSSING_ERROR }, { status: 409 })
    }
    throw e
  }

  try {
    const row = await prisma.inventoryCard.create({
      data: {
        cardPanHash: panHash,
        cardPanEnc,
        holderName,
      },
    })
    gatekeeperAudit('CARD_PAN', 'Cartão cofre persistido', { id: row.id })
    return NextResponse.json({
      ok: true,
      logs,
      record: {
        id: row.id,
        panMasked: maskCardPan(panDigits),
        holderName: row.holderName,
      },
    })
  } catch (e) {
    const mapped = mapGatekeeperPrismaError(e)
    if (mapped) {
      push(mapped, false)
      return NextResponse.json({ ok: false, logs, error: mapped }, { status: 409 })
    }
    throw e
  }
}
