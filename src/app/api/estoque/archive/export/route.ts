import { NextRequest, NextResponse } from 'next/server'
import { AccountPlatform, AccountStatus, type Prisma } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encryption'
import { audit } from '@/lib/audit'
import { getAuthenticatedKey, withRateLimit } from '@/lib/rate-limit-api'

/**
 * GET - Exporta contas com credenciais (CSV ou JSON)
 * Query: format=csv|json, platform, status, includeArchived=true|false
 */
export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'FINANCE'])
  if (!auth.ok) return auth.response
  const session = auth.session

  const limited = withRateLimit(
    req,
    getAuthenticatedKey(session.user!.id, 'estoque:archive:export'),
    { max: 10, windowMs: 60_000 }
  )
  if (limited) return limited

  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format') || 'json'
  const platform = searchParams.get('platform')
  const status = searchParams.get('status')
  const includeArchived = searchParams.get('includeArchived') === 'true'
  const q = searchParams.get('q')?.trim() ?? ''

  const clauses: Prisma.StockAccountWhereInput[] = [{ deletedAt: null }]
  if (platform && (Object.values(AccountPlatform) as string[]).includes(platform)) {
    clauses.push({ platform: platform as AccountPlatform })
  }
  if (status && (Object.values(AccountStatus) as string[]).includes(status)) {
    clauses.push({ status: status as AccountStatus })
  }
  if (!includeArchived) clauses.push({ archivedAt: null })
  if (q.length > 0) {
    clauses.push({
      OR: [
        { id: { startsWith: q } },
        { niche: { contains: q } },
        { description: { contains: q } },
        { type: { contains: q } },
      ],
    })
  }
  const where: Prisma.StockAccountWhereInput =
    clauses.length === 1 ? clauses[0]! : { AND: clauses }

  const accounts = await prisma.stockAccount.findMany({
    where,
    include: {
      credential: true,
      productionG2: { include: { credentials: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  })

  const rows = accounts.map((a) => {
    const cred = a.credential ?? a.productionG2?.credentials
    const credAny = cred as { emailGoogle?: string; email?: string; passwordEncrypted?: string; recoveryEmail?: string } | null
    const email = credAny?.emailGoogle ?? credAny?.email ?? null
    const pw = credAny?.passwordEncrypted
    const password = pw ? decrypt(pw) : null
    return {
      id: a.id,
      platform: a.platform,
      type: a.type,
      status: a.status,
      googleAdsCustomerId: a.googleAdsCustomerId,
      email,
      password,
      recoveryEmail: credAny?.recoveryEmail ?? null,
      archivedAt: a.archivedAt,
      createdAt: a.createdAt,
    }
  })

  await audit({
    userId: session.user!.id,
    action: 'account_archive_exported',
    entity: 'StockAccount',
    entityId: undefined,
    details: { count: rows.length, format, includeArchived },
  })

  if (format === 'csv') {
    const headers = ['id', 'platform', 'type', 'status', 'googleAdsCustomerId', 'email', 'password', 'recoveryEmail', 'archivedAt', 'createdAt']
    const lines = [['id', 'platform', 'type', 'status', 'google_ads_id', 'email', 'password', 'recovery_email', 'archived_at', 'created_at'].join(';')]
    for (const r of rows) {
      const arr = [
        r.id,
        r.platform,
        r.type,
        r.status,
        r.googleAdsCustomerId ?? '',
        r.email ?? '',
        r.password ?? '',
        r.recoveryEmail ?? '',
        r.archivedAt ? new Date(r.archivedAt).toISOString() : '',
        r.createdAt ? new Date(r.createdAt).toISOString() : '',
      ]
      lines.push(arr.map((v) => (typeof v === 'string' && (v.includes(';') || v.includes('"'))) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '')).join(';'))
    }
    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename=estoque-export-${new Date().toISOString().slice(0, 10)}.csv`,
      },
    })
  }

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    total: rows.length,
    accounts: rows,
  })
}
