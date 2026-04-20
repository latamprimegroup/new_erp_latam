import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { gatekeeperAudit } from '@/lib/gatekeeper/audit-log'
import type { VaultIdDocRef } from '@/lib/gatekeeper/types'

const KEY_RE = /^gatekeeper\/ids\/[a-f0-9]{32}\.png$/i

/**
 * GET — Download do PNG tratado (EXIF) da identidade do cofre. Apenas ADMIN; caminho derivado do banco (anti path traversal).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ inventoryId: string }> }) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { inventoryId } = await params
  if (!inventoryId) {
    return NextResponse.json({ error: 'inventoryId obrigatório' }, { status: 400 })
  }

  const row = await prisma.inventoryId.findUnique({
    where: { id: inventoryId },
    select: { id: true, cpf: true, docUrls: true },
  })
  if (!row) {
    return NextResponse.json({ error: 'Identidade não encontrada' }, { status: 404 })
  }

  const refs = Array.isArray(row.docUrls) ? (row.docUrls as unknown as VaultIdDocRef[]) : []
  const ref = refs.find((r) => r?.kind === 'scrubbed_id_doc' && typeof r.key === 'string')
  if (!ref?.key || !KEY_RE.test(ref.key)) {
    return NextResponse.json({ error: 'Documento scrubbed não disponível' }, { status: 404 })
  }

  const abs = path.join(process.cwd(), 'uploads', ...ref.key.split('/'))
  const resolved = path.resolve(abs)
  const root = path.resolve(path.join(process.cwd(), 'uploads', 'gatekeeper', 'ids'))
  if (!resolved.startsWith(root)) {
    return NextResponse.json({ error: 'Caminho inválido' }, { status: 400 })
  }

  let buf: Buffer
  try {
    buf = await readFile(resolved)
  } catch {
    return NextResponse.json({ error: 'Arquivo não encontrado no disco' }, { status: 404 })
  }

  gatekeeperAudit('ID_DOC_DOWNLOAD', 'Download documento scrubbed (operador)', {
    inventoryId: row.id,
    cpfLast2: row.cpf.slice(-2),
  })

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="id-scrubbed-${row.id.slice(0, 8)}.png"`,
      'Cache-Control': 'no-store',
    },
  })
}
