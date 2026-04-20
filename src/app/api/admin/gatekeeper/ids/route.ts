import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { scrubDocumentImage } from '@/lib/gatekeeper/image-scrubber'
import { saveGatekeeperIdDoc } from '@/lib/gatekeeper/vault-storage'
import { assertCpfVaultUnique, assertPhotoHashUnique } from '@/lib/gatekeeper/uniqueness-guard'
import { maskCpf } from '@/lib/gatekeeper/masking'
import { mapGatekeeperPrismaError } from '@/lib/gatekeeper/prisma-gatekeeper'
import { GatekeeperBlockedError, GATEKEEPER_CROSSING_ERROR } from '@/lib/gatekeeper/errors'
import { gatekeeperAudit } from '@/lib/gatekeeper/audit-log'
import type { VaultIdDocRef } from '@/lib/gatekeeper/types'

function normalizeCpfDigits(v: string): string {
  return v.replace(/\D/g, '').slice(0, 11)
}

type LogEntry = { step: string; ok: boolean }

/**
 * POST — Identidade + foto de documento (EXIF strip + hash killer).
 * FormData: fullName, cpf, file (imagem)
 */
export async function POST(req: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const logs: LogEntry[] = []
  const push = (step: string, ok: boolean) => logs.push({ step, ok })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'FormData inválido' }, { status: 400 })
  }

  const fullName = String(form.get('fullName') || '').trim()
  const cpfRaw = String(form.get('cpf') || '').trim()
  const file = form.get('file')
  const cpf = normalizeCpfDigits(cpfRaw)

  if (!fullName || cpf.length !== 11) {
    return NextResponse.json({ error: 'fullName e CPF (11 dígitos) obrigatórios' }, { status: 400 })
  }
  if (!file || !(file instanceof Blob) || file.size < 16) {
    return NextResponse.json({ error: 'Arquivo de imagem obrigatório' }, { status: 400 })
  }

  push('Limpando metadados e aplicando hash-killer…', true)
  gatekeeperAudit('ID_DOCUMENT', 'Início scrub EXIF + hash-killer (servidor)', { cpfMasked: maskCpf(cpf) })
  const buf = Buffer.from(await file.arrayBuffer())
  let scrubbed: Awaited<ReturnType<typeof scrubDocumentImage>>
  try {
    scrubbed = await scrubDocumentImage(buf)
  } catch {
    push('Falha ao processar imagem', false)
    gatekeeperAudit('ID_DOCUMENT', 'Falha no scrub de imagem')
    return NextResponse.json({ ok: false, logs, error: 'Falha ao processar imagem' }, { status: 400 })
  }

  push(`Hash de foto gerado (${scrubbed.md5.slice(0, 8)}…)`, true)
  gatekeeperAudit('ID_DOCUMENT', `MD5 pós-scrub: ${scrubbed.md5.slice(0, 12)}…`)

  push('Verificando unicidade (CPF + foto)…', true)
  try {
    await assertCpfVaultUnique(cpf)
    await assertPhotoHashUnique(scrubbed.md5)
    push('Unicidade confirmada', true)
  } catch (e) {
    if (e instanceof GatekeeperBlockedError) {
      push(GATEKEEPER_CROSSING_ERROR, false)
      return NextResponse.json({ ok: false, logs, error: GATEKEEPER_CROSSING_ERROR }, { status: 409 })
    }
    throw e
  }

  let storageKey: string
  try {
    storageKey = await saveGatekeeperIdDoc(scrubbed.buffer, scrubbed.md5)
  } catch {
    push('Falha ao gravar arquivo seguro', false)
    return NextResponse.json({ ok: false, logs, error: 'Falha ao gravar arquivo' }, { status: 500 })
  }

  const docUrls: VaultIdDocRef[] = [{ kind: 'scrubbed_id_doc', key: storageKey, contentMd5: scrubbed.md5 }]

  try {
    const row = await prisma.inventoryId.create({
      data: {
        fullName,
        cpf,
        photoHash: scrubbed.md5,
        docUrls,
      },
    })
    gatekeeperAudit('ID_DOCUMENT', `Identidade cofre criada: ${maskCpf(cpf)}`, { id: row.id })
    return NextResponse.json({
      ok: true,
      logs,
      record: {
        id: row.id,
        cpfMasked: maskCpf(cpf),
        fullName,
        photoHash: scrubbed.md5,
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
