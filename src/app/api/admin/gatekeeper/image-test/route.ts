import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { scrubDocumentImage } from '@/lib/gatekeeper/image-scrubber'
import { gatekeeperAudit } from '@/lib/gatekeeper/audit-log'

/**
 * POST — Teste do Image Scrubber / Hash-Killer (sem persistir PII).
 * FormData: file
 */
export async function POST(req: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const form = await req.formData()
  const file = form.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'file obrigatório' }, { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const before = createHash('md5').update(buf).digest('hex')
  gatekeeperAudit('IMAGE_TEST', 'Teste hash-killer (sem persistir PII)')
  const { md5: after } = await scrubDocumentImage(buf)
  gatekeeperAudit('IMAGE_TEST', `MD5 antes/depois scrub: ${before.slice(0, 10)}… → ${after.slice(0, 10)}…`)

  return NextResponse.json({
    ok: true,
    logs: [
      { step: 'Limpando metadados…', ok: true },
      { step: 'Aplicando ruído leve + re-encode PNG…', ok: true },
      { step: 'MD5 antes (referência) / depois (vault)', ok: before !== after },
    ],
    md5Before: before,
    md5After: after,
  })
}
