import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Chaves SystemSetting usadas pelo SmartDelivery
const KEYS = {
  kycAmountThreshold:       'smart_delivery_kyc_amount',
  linkExpirationMinutes:    'smart_delivery_link_expiration_minutes',
  suspiciousEmailDomains:   'smart_delivery_suspicious_email_domains',
  adspowerProductMap:       'smart_delivery_adspower_product_map',
  utmifyToken:              'smart_delivery_utmify_token',
  globalKillSwitch:         'global_kill_switch',
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: Object.values(KEYS) } },
  })
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))

  // Contagens para métricas do painel
  const [kycPendingCount, killSwitchBlockCount, shareAttemptCount] = await Promise.all([
    // Checkouts PENDING acima do limiar KYC (aguardando aprovação manual)
    prisma.quickSaleCheckout.count({
      where: {
        status: 'PENDING',
        totalAmount: {
          gte: parseFloat(map[KEYS.kycAmountThreshold] || '300'),
        },
      },
    }),
    // Clientes com risco bloqueado (kill switch aplicado)
    prisma.client.count({ where: { riskBlockCheckout: true } }).catch(() => 0),
    // Leads com tentativas duplicadas de CPF (compartilhamento)
    prisma.lead.groupBy({ by: ['cpf'], _count: { cpf: true }, having: { cpf: { _count: { gt: 1 } } } })
      .then((r) => r.length)
      .catch(() => 0),
  ])

  return NextResponse.json({
    settings: {
      kycAmountThreshold:     parseFloat(map[KEYS.kycAmountThreshold] || '300'),
      linkExpirationMinutes:  parseInt(map[KEYS.linkExpirationMinutes] || '60', 10),
      suspiciousEmailDomains: map[KEYS.suspiciousEmailDomains] || 'mailinator.com\ntempmail.com\n10minutemail.com\nguerrillamail.com',
      adspowerProductMap:     map[KEYS.adspowerProductMap] || '{}',
      utmifyToken:            map[KEYS.utmifyToken] || '',
      globalKillSwitch:       map[KEYS.globalKillSwitch] === '1' || map[KEYS.globalKillSwitch] === 'true',
    },
    metrics: {
      kycAmountThreshold: parseFloat(map[KEYS.kycAmountThreshold] || '300'),
      kycPendingCount,
      killSwitchBlockCount,
      shareAttemptCount,
    },
  })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  const upserts: Promise<unknown>[] = []

  const str = (v: unknown) => (v !== undefined && v !== null ? String(v) : undefined)

  const pairs: [keyof typeof KEYS, string | undefined][] = [
    ['kycAmountThreshold',       str(body.kycAmountThreshold)],
    ['linkExpirationMinutes',    str(body.linkExpirationMinutes)],
    ['suspiciousEmailDomains',   str(body.suspiciousEmailDomains)],
    ['adspowerProductMap',       str(body.adspowerProductMap)],
    ['utmifyToken',              str(body.utmifyToken)],
    ['globalKillSwitch',         body.globalKillSwitch !== undefined ? (body.globalKillSwitch ? '1' : '0') : undefined],
  ]

  for (const [field, val] of pairs) {
    if (val === undefined) continue
    const key = KEYS[field]
    upserts.push(
      prisma.systemSetting.upsert({
        where:  { key },
        create: { key, value: val },
        update: { value: val },
      })
    )
  }

  await Promise.all(upserts)
  return NextResponse.json({ ok: true })
}
