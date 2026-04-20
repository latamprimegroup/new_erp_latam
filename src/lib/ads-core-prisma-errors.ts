import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { ADS_CORE_UNIQUE_DB_MSG } from '@/lib/ads-core-utils'

/** Resposta 409 para violação UNIQUE (cnpj / site_url) no banco. */
export function adsCoreUniqueViolationResponse(e: unknown): NextResponse | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return NextResponse.json({ error: ADS_CORE_UNIQUE_DB_MSG }, { status: 409 })
  }
  return null
}
