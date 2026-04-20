import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { gatekeeperAudit } from '@/lib/gatekeeper/audit-log'
import { validateCnpjForVault, normalizeCnpjDigits } from '@/lib/gatekeeper/cnpj-ingest'
import { assertCnpjVaultUnique } from '@/lib/gatekeeper/uniqueness-guard'
import { maskCnpj } from '@/lib/gatekeeper/masking'
import { mapGatekeeperPrismaError } from '@/lib/gatekeeper/prisma-gatekeeper'
import { GatekeeperBlockedError, GATEKEEPER_CROSSING_ERROR } from '@/lib/gatekeeper/errors'
import { assertVaultGeofencing } from '@/lib/gatekeeper/types'

type LogEntry = { step: string; ok: boolean }

/**
 * POST — Ingestão de CNPJ com Brasil API (somente ATIVA).
 * Body: { cnpj: string }
 */
export async function POST(req: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  let body: { cnpj?: string; nicheOperatorTag?: string }
  try {
    body = (await req.json()) as { cnpj?: string; nicheOperatorTag?: string }
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const cnpjRaw = typeof body.cnpj === 'string' ? body.cnpj.trim() : ''
  const nicheOperatorTag =
    typeof body.nicheOperatorTag === 'string' ? body.nicheOperatorTag.trim().slice(0, 120) || null : null
  const digits = normalizeCnpjDigits(cnpjRaw)
  const logs: LogEntry[] = []
  const push = (step: string, ok: boolean) => logs.push({ step, ok })

  push('Consultando Brasil API…', true)
  gatekeeperAudit('CNPJ_INGEST', 'Consulta Brasil API iniciada', { cnpjMasked: maskCnpj(digits) })

  let payload: Awaited<ReturnType<typeof validateCnpjForVault>>
  try {
    payload = await validateCnpjForVault(cnpjRaw)
    push('CNPJ validado (situação ATIVA)', true)
    gatekeeperAudit('CNPJ_INGEST', `CNPJ validado (ATIVA): ${maskCnpj(digits)}`, {
      cidade: payload.geofencing.cidade,
      uf: payload.geofencing.estado,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha na validação'
    push(msg, false)
    gatekeeperAudit('CNPJ_INGEST', `Falha validação: ${maskCnpj(digits)} — ${msg}`)
    return NextResponse.json({ ok: false, logs, error: msg }, { status: 422 })
  }

  try {
    assertVaultGeofencing(payload.geofencing)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Geofencing inválido'
    gatekeeperAudit('CNPJ_INGEST', `Geofencing rejeitado: ${msg}`)
    return NextResponse.json({ ok: false, logs, error: msg }, { status: 422 })
  }

  push('Verificando unicidade na base histórica…', true)
  try {
    await assertCnpjVaultUnique(digits)
    push('Unicidade confirmada', true)
    gatekeeperAudit('CNPJ_INGEST', `Unicidade OK: ${maskCnpj(digits)}`)
  } catch (e) {
    if (e instanceof GatekeeperBlockedError) {
      push(GATEKEEPER_CROSSING_ERROR, false)
      gatekeeperAudit('CNPJ_INGEST', `Duplicidade bloqueada: ${maskCnpj(digits)}`)
      return NextResponse.json({ ok: false, logs, error: GATEKEEPER_CROSSING_ERROR }, { status: 409 })
    }
    throw e
  }

  try {
    const row = await prisma.inventoryCnpj.create({
      data: {
        cnpj: digits,
        razaoSocial: payload.normalized.razaoSocial || null,
        cnae: payload.normalized.cnae || null,
        nicheInferred: payload.nicheInferred,
        nicheOperatorTag,
        geofencing: payload.geofencing,
        situacaoRf: payload.normalized.situacaoCadastral,
      },
    })
    gatekeeperAudit('CNPJ_INGEST', `Cofre persistido: ${maskCnpj(digits)}`, { id: row.id })
    return NextResponse.json({
      ok: true,
      logs,
      record: {
        id: row.id,
        cnpjMasked: maskCnpj(digits),
        nicheInferred: row.nicheInferred,
        razaoSocial: row.razaoSocial,
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
