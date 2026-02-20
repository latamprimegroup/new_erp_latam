import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encryption'
import { audit } from '@/lib/audit'
import { getAuthenticatedKey, withRateLimit } from '@/lib/rate-limit-api'

/**
 * GET - Backup completo de dados críticos (produção + estoque + credenciais)
 * Chamar via cron: ?secret=CRON_SECRET (dispensa sessão) ou manualmente como ADMIN
 */
export async function GET(req: NextRequest) {
  const cronSecret = req.nextUrl.searchParams.get('secret')
  const isCron = !!cronSecret && !!process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET

  let session: { user: { id: string } } | null = null
  if (!isCron) {
    const auth = await requireRoles(['ADMIN'])
    if (!auth.ok) return auth.response
    session = auth.session
    const limited = withRateLimit(
      req,
      getAuthenticatedKey(session!.user!.id, 'admin:backup'),
      { max: 2, windowMs: 3600_000 }  // 2x por hora
    )
    if (limited) return limited
  }

  try {
    const [stockAccounts, credentials, productionG2, productionAccounts, emails, cnpjs, batches] = await Promise.all([
      prisma.stockAccount.findMany({
        where: { deletedAt: null },
        include: { credential: { where: { deletedAt: null } } },
      }),
      prisma.stockAccountCredential.findMany({
        where: { deletedAt: null },
      }),
      prisma.productionG2.findMany({
        where: { deletedAt: null },
        include: { credentials: true },
      }),
      prisma.productionAccount.findMany({
        where: { deletedAt: null },
      }),
      prisma.email.findMany({
        select: {
          id: true,
          email: true,
          status: true,
          countryId: true,
          accountId: true,
          batchId: true,
          createdAt: true,
          updatedAt: true,
          passwordPlain: true,  // Será descriptografado no dump
        },
      }),
      prisma.cnpj.findMany({
        select: {
          id: true,
          cnpj: true,
          razaoSocial: true,
          status: true,
          accountId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.accountArchiveBatch.findMany({
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ])

    // Descriptografar passwords para backup (apenas ADMIN/cron)
    const emailsWithDecrypted = emails.map((e) => ({
      ...e,
      passwordPlain: e.passwordPlain ? decrypt(e.passwordPlain) : null,
    }))

    const credentialsWithDecrypted = credentials.map((c) => ({
      ...c,
      passwordEncrypted: c.passwordEncrypted ? decrypt(c.passwordEncrypted) : null,
      twoFaSecret: c.twoFaSecret ? decrypt(c.twoFaSecret) : null,
    }))

    const g2WithDecrypted = productionG2.map((g) => ({
      ...g,
      credentials: g.credentials
        ? {
            ...g.credentials,
            passwordEncrypted: g.credentials.passwordEncrypted
              ? decrypt(g.credentials.passwordEncrypted)
              : null,
          }
        : null,
    }))

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      counts: {
        stockAccounts: stockAccounts.length,
        credentials: credentials.length,
        productionG2: productionG2.length,
        productionAccounts: productionAccounts.length,
        emails: emails.length,
        cnpjs: cnpjs.length,
      },
      data: {
        stockAccounts,
        stockAccountCredentials: credentialsWithDecrypted,
        productionG2: g2WithDecrypted,
        productionAccounts,
        emails: emailsWithDecrypted,
        cnpjs,
        accountArchiveBatches: batches,
      },
    }

    await audit({
      userId: session?.user?.id,
      action: 'backup_exported',
      entity: 'Backup',
      entityId: null,
      details: { counts: backup.counts, isCron: !!isCron },
    })

    return NextResponse.json(backup, {
      headers: {
        'Content-Disposition': `attachment; filename=erp-backup-${new Date().toISOString().slice(0, 10)}.json`,
      },
    })
  } catch (err) {
    console.error('Backup error:', err)
    return NextResponse.json({ error: 'Erro ao gerar backup' }, { status: 500 })
  }
}
