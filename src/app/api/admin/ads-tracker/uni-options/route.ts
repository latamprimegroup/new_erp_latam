import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { maskCnpj, maskEmail } from '@/lib/gatekeeper/masking'
import { proxyHostKeyFromParts } from '@/lib/ads-tracker/urls'

/**
 * Lista UNIs para o seletor da Central de Campanhas (Tracker).
 */
export async function GET() {
  const auth = await requireRoles(['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'FINANCE'])
  if (!auth.ok) return auth.response

  const rows = await prisma.vaultIndustrialUnit.findMany({
    orderBy: { createdAt: 'desc' },
    take: 150,
    include: {
      inventoryGmail: { select: { email: true } },
      inventoryCnpj: { select: { cnpj: true } },
      matchedProxy: { select: { proxyHost: true, proxyPort: true, provider: true } },
    },
  })

  return NextResponse.json({
    unis: rows.map((u) => ({
      id: u.id,
      status: u.status,
      adsPowerProfileId: u.adsPowerProfileId,
      gmailMasked: maskEmail(u.inventoryGmail.email),
      cnpjMasked: maskCnpj(u.inventoryCnpj.cnpj),
      proxyHostKey: proxyHostKeyFromParts(u.matchedProxy?.proxyHost, u.matchedProxy?.proxyPort),
      proxyProvider: u.matchedProxy?.provider ?? null,
    })),
  })
}
