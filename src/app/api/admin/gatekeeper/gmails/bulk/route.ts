import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { encrypt } from '@/lib/encryption'
import { prisma } from '@/lib/prisma'
import { parseVaultGmailLine } from '@/lib/gatekeeper/gmail-line-parser'
import { maskEmail } from '@/lib/gatekeeper/masking'
import { mapGatekeeperPrismaError } from '@/lib/gatekeeper/prisma-gatekeeper'
import { assertGmailVaultUnique, normalizeEmailKey } from '@/lib/gatekeeper/uniqueness-guard'
import { GatekeeperBlockedError, GATEKEEPER_CROSSING_ERROR } from '@/lib/gatekeeper/errors'
import { gatekeeperAudit } from '@/lib/gatekeeper/audit-log'
import { validateGoogleSessionCookieJson } from '@/lib/gatekeeper/cookie-session-validator'
import { parseHarvestYearFromSafra } from '@/lib/gatekeeper/harvest-year'

type LogEntry = { emailMasked: string; ok: boolean; message: string }

/**
 * POST — Ingestão em massa de Gmails (Cofre / Gatekeeper).
 * Body JSON: { bulkText: string, gmailSafra?: string }
 */
export async function POST(req: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  let body: { bulkText?: string; gmailSafra?: string }
  try {
    body = (await req.json()) as { bulkText?: string; gmailSafra?: string }
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const bulkText = typeof body.bulkText === 'string' ? body.bulkText : ''
  const gmailSafra = typeof body.gmailSafra === 'string' ? body.gmailSafra.trim() || null : null
  const harvestYearFromSafra = parseHarvestYearFromSafra(gmailSafra)
  if (!bulkText.trim()) {
    return NextResponse.json({ error: 'bulkText obrigatório' }, { status: 400 })
  }

  const lines = bulkText.split(/\r?\n/)
  const logs: LogEntry[] = []
  let imported = 0

  gatekeeperAudit('GMAIL_BULK', 'Início ingestão em massa', {
    linhas: lines.filter((l) => l.trim()).length,
    safra: gmailSafra ?? '—',
  })

  for (const line of lines) {
    const parsed = parseVaultGmailLine(line)
    if (!parsed) continue

    const emailKey = normalizeEmailKey(parsed.email)
    const masked = maskEmail(emailKey)

    logs.push({ emailMasked: masked, ok: false, message: 'Validando unicidade…' })

    if (parsed.cookies !== undefined) {
      const cookieCheck = validateGoogleSessionCookieJson(parsed.cookies)
      if (!cookieCheck.ok) {
        logs[logs.length - 1] = { emailMasked: masked, ok: false, message: cookieCheck.error }
        gatekeeperAudit('GMAIL_BULK', `Cookies inválidos: ${masked}`)
        continue
      }
    }

    try {
      await assertGmailVaultUnique(emailKey)
    } catch (e) {
      if (e instanceof GatekeeperBlockedError) {
        logs[logs.length - 1] = { emailMasked: masked, ok: false, message: GATEKEEPER_CROSSING_ERROR }
        gatekeeperAudit('GMAIL_BULK', `Duplicidade bloqueada: ${masked}`)
        continue
      }
      logs[logs.length - 1] = { emailMasked: masked, ok: false, message: 'Falha na verificação' }
      continue
    }

    logs[logs.length - 1] = { emailMasked: masked, ok: false, message: 'Cifrando credenciais…' }

    const passwordEnc = encrypt(parsed.password)
    const twoFaEnc = parsed.twoFa ? encrypt(parsed.twoFa) : null
    const recoveryEmailEnc =
      parsed.recoveryEmail && parsed.recoveryEmail.includes('@')
        ? encrypt(parsed.recoveryEmail.trim().toLowerCase())
        : null
    let sessionCookiesEnc: string | null = null
    if (parsed.cookies !== undefined) {
      const ser = JSON.stringify(parsed.cookies)
      if (ser !== undefined && ser !== '{}' && ser !== '[]') {
        sessionCookiesEnc = encrypt(ser)
      }
    }

    try {
      await prisma.inventoryGmail.create({
        data: {
          email: emailKey,
          passwordEnc,
          recoveryEmailEnc,
          harvestYear: harvestYearFromSafra,
          twoFaEnc,
          sessionCookiesEnc,
          gmailSafra,
        },
      })
      imported++
      logs[logs.length - 1] = { emailMasked: masked, ok: true, message: 'Unicidade confirmada — registro cifrado' }
      gatekeeperAudit('GMAIL_BULK', `Gmail cofre criado: ${masked}`)
    } catch (e) {
      const mapped = mapGatekeeperPrismaError(e)
      logs[logs.length - 1] = {
        emailMasked: masked,
        ok: false,
        message: mapped || 'Erro ao salvar',
      }
      if (mapped) {
        gatekeeperAudit('GMAIL_BULK', `Prisma bloqueou duplicidade: ${masked}`)
      }
    }
  }

  gatekeeperAudit('GMAIL_BULK', 'Fim ingestão em massa', { importados: imported })
  return NextResponse.json({ imported, totalLines: lines.length, logs })
}
