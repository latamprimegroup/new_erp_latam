import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'
import { audit } from '@/lib/audit'
import { getAuthenticatedKey, withRateLimit } from '@/lib/rate-limit-api'

const PLATFORMS = ['GOOGLE_ADS', 'META_ADS', 'KWAI_ADS', 'TIKTOK_ADS', 'OTHER']
const BATCH_SIZE = 100

/**
 * POST - Upload CSV ou JSON com contas + credenciais
 * FormData: file, format (csv|json)
 * CSV: platform,type,email,password,recovery_email,two_fa,google_ads_id,country,notes
 */
export async function POST(req: Request) {
  const auth = await requireRoles(['ADMIN', 'FINANCE'])
  if (!auth.ok) return auth.response
  const session = auth.session

  const limited = withRateLimit(
    req,
    getAuthenticatedKey(session.user!.id, 'estoque:archive:upload'),
    { max: 10, windowMs: 60_000 }
  )
  if (limited) return limited

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const format = (formData.get('format') as string)?.toLowerCase() || 'csv'

    if (!file) {
      return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })
    }

    const text = await file.text()
    let rows: Array<Record<string, string>> = []

    if (format === 'json') {
      const parsed = JSON.parse(text)
      rows = Array.isArray(parsed) ? parsed : parsed.accounts || []
    } else {
      const lines = text.split(/\r?\n/).filter(Boolean)
      const delim = lines[0]?.includes(';') ? ';' : ','
      const headers = lines[0].split(delim).map((h) => h.trim().toLowerCase().replace(/\s/g, '_'))
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(delim).map((v) => v.trim())
        const obj: Record<string, string> = {}
        headers.forEach((h, j) => { obj[h] = values[j] || '' })
        rows.push(obj)
      }
    }

    let imported = 0
    let failed = 0
    let duplicate = 0

    const batch = await prisma.accountArchiveBatch.create({
      data: {
        filename: file.name,
        format: format.toUpperCase(),
        uploadedById: session.user!.id,
        totalRows: rows.length,
        imported: 0,
        failed: 0,
        duplicate: 0,
      },
    })

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE)
      for (const row of chunk) {
        const platform = (row.platform || row.plataforma || '').toUpperCase().replace(/[^A-Z_]/g, '') || 'GOOGLE_ADS'
        const type = (row.type || row.tipo || 'G2').trim() || 'G2'
        const email = (row.email || row.email_principal || '').trim()
        const password = (row.password || row.senha || '').trim()
        const recoveryEmail = (row.recovery_email || row.recovery || '').trim() || null
        const twoFa = (row.two_fa || row.twofa || row['2fa'] || '').trim() || null
        const googleAdsId = (row.google_ads_id || row.google_ads_customer_id || '').trim() || null
        const country = (row.country || row.country_id || '').trim() || null
        const notes = (row.notes || row.notes || '').trim() || null

        if (!platform || !PLATFORMS.includes(platform)) {
          failed++
          continue
        }

        if (googleAdsId) {
          const exists = await prisma.stockAccount.findFirst({
            where: { googleAdsCustomerId: googleAdsId, deletedAt: null },
          })
          if (exists) {
            duplicate++
            continue
          }
        }
        if (email) {
          const exists = await prisma.stockAccountCredential.findFirst({
            where: { email, deletedAt: null },
          })
          if (exists) {
            duplicate++
            continue
          }
        }

        try {
          const account = await prisma.stockAccount.create({
            data: {
              platform: platform as 'GOOGLE_ADS' | 'META_ADS' | 'KWAI_ADS' | 'TIKTOK_ADS' | 'OTHER',
              type,
              source: 'IMPORT',
              googleAdsCustomerId: googleAdsId,
              status: 'AVAILABLE',
            },
          })

          if (email || password || twoFa || recoveryEmail) {
            await prisma.stockAccountCredential.create({
              data: {
                stockAccountId: account.id,
                email: email || null,
                passwordEncrypted: password ? encrypt(password) : null,
                recoveryEmail: recoveryEmail || null,
                twoFaSecret: twoFa ? encrypt(twoFa) : null,
                googleAdsCustomerId: googleAdsId,
                notes: notes,
              },
            })
          }
          imported++
        } catch {
          failed++
        }
      }
    }

    await prisma.accountArchiveBatch.update({
      where: { id: batch.id },
      data: { imported, failed, duplicate },
    })

    await audit({
      userId: session.user!.id,
      action: 'account_archive_uploaded',
      entity: 'AccountArchiveBatch',
      entityId: batch.id,
      details: { filename: file.name, imported, failed, duplicate },
    })

    return NextResponse.json({
      ok: true,
      batchId: batch.id,
      imported,
      failed,
      duplicate,
      total: rows.length,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Erro ao processar upload' }, { status: 500 })
  }
}
