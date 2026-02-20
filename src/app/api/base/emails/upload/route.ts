import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'
import { getClientIdentifier, withRateLimit } from '@/lib/rate-limit-api'

const BATCH_SIZE = 500

/**
 * POST /api/base/emails/upload
 * Upload CSV de e-mails - versão otimizada com batch
 * FormData: file (CSV), supplierId (obrigatório)
 * CSV: email;senha;recuperação (ou email,senha,recuperação)
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const limited = withRateLimit(req, `upload:${session.user.id}`, { max: 10, windowMs: 60_000 })
  if (limited) return limited

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const supplierId = formData.get('supplierId') as string | null

    if (!file || !supplierId?.trim()) {
      return NextResponse.json(
        { error: 'Informe o arquivo CSV e o fornecedor' },
        { status: 400 }
      )
    }

    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
    })
    if (!supplier) {
      return NextResponse.json({ error: 'Fornecedor não encontrado' }, { status: 400 })
    }

    const text = await file.text()
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)

    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'Arquivo deve ter pelo menos 2 linhas (cabeçalho + dados)' },
        { status: 400 }
      )
    }

    const delimiter = lines[0].includes(';') ? ';' : ','
    const rows = lines.map((line) => line.split(delimiter).map((c) => c.trim()))

    const isHeader = (row: string[]) => {
      const first = (row[0] || '').toLowerCase()
      return first === 'email' || first === 'e-mail' || first.includes('@') === false
    }
    const dataRows = isHeader(rows[0]) ? rows.slice(1) : rows

    const toImport: { email: string; password: string; recovery: string | null }[] = []
    let failed = 0
    for (const row of dataRows) {
      const email = (row[0] || '').trim().toLowerCase()
      const password = (row[1] || '').trim()
      const recovery = (row[2] || '').trim() || null
      if (!email || !email.includes('@')) {
        failed++
        continue
      }
      toImport.push({ email, password, recovery })
    }

    const emails = toImport.map((t) => t.email)
    const existingSet = new Set<string>()
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE)
      const found = await prisma.email.findMany({
        where: { email: { in: batch } },
        select: { email: true },
      })
      found.forEach((e) => existingSet.add(e.email))
    }

    const toCreate = toImport.filter((t) => !existingSet.has(t.email))
    const duplicates = toImport.length - toCreate.length - failed

    const batch = await prisma.emailBatch.create({
      data: {
        supplierId,
        uploadedById: session.user!.id,
        filename: file.name,
        totalImported: 0,
        failedCount: failed,
        duplicateCount: duplicates,
      },
    })

    let imported = 0
    for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
      const chunk = toCreate.slice(i, i + BATCH_SIZE)
      const created = await prisma.email.createMany({
        data: chunk.map((t) => ({
          email: t.email,
          passwordPlain: t.password ? encrypt(t.password) : null,
          recovery: t.recovery,
          status: 'AVAILABLE',
          supplierId,
          batchId: batch.id,
        })),
        skipDuplicates: true,
      })
      imported += created.count
    }

    await prisma.emailBatch.update({
      where: { id: batch.id },
      data: {
        totalImported: imported,
        failedCount: failed,
        duplicateCount: duplicates,
      },
    })

    return NextResponse.json({
      ok: true,
      batchId: batch.id,
      imported,
      duplicates,
      failed,
      total: dataRows.length,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Erro ao processar upload' }, { status: 500 })
  }
}
