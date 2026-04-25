import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  addToQuickSaleGlobalBlacklist,
  adspowerDisableProfile,
  getQuickSaleAdspowerProfileRef,
  incrementQuickSaleAntiFraudCounter,
  sendFraudAlertToChatOps,
} from '@/lib/smart-delivery-system'

export const runtime = 'nodejs'

function parseText(raw: unknown) {
  if (raw == null) return ''
  if (typeof raw === 'string') return raw
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw)
  return JSON.stringify(raw)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function extractStringCandidates(raw: unknown): string[] {
  const values: string[] = []
  const walk = (node: unknown) => {
    if (node == null) return
    if (typeof node === 'string' || typeof node === 'number') {
      values.push(String(node))
      return
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (typeof node === 'object') {
      for (const value of Object.values(node as Record<string, unknown>)) walk(value)
    }
  }
  walk(raw)
  return values
}

function extractTxid(raw: unknown) {
  const directObj = isObject(raw) ? raw : null
  const direct = directObj?.txid ?? directObj?.txId ?? directObj?.chave
  if (typeof direct === 'string' && direct.trim().length >= 20) {
    return direct.trim()
  }
  const values = extractStringCandidates(raw)
  return values.find((value) => /^[a-z0-9]{20,40}$/i.test(value)) ?? null
}

function extractE2eId(raw: unknown) {
  const directObj = isObject(raw) ? raw : null
  const direct = directObj?.endToEndId ?? directObj?.e2eid ?? directObj?.e2eId
  if (typeof direct === 'string' && /^E[0-9A-Z]{20,}$/i.test(direct.trim())) {
    return direct.trim()
  }
  const values = extractStringCandidates(raw)
  return values.find((value) => /^E[0-9A-Z]{20,}$/i.test(value)) ?? null
}

function parseIpAndFingerprint(payload: unknown, req: NextRequest) {
  const candidatePayload = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  const ip =
    parseText(candidatePayload.ip).trim()
    || parseText(candidatePayload.remoteIp).trim()
    || parseText(candidatePayload.clientIp).trim()
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || null
  const fingerprint =
    parseText(candidatePayload.fingerprint).trim()
    || parseText(candidatePayload.deviceFingerprint).trim()
    || parseText(candidatePayload.browserFingerprint).trim()
    || null
  const location =
    parseText(candidatePayload.location).trim()
    || parseText(candidatePayload.city).trim()
    || null
  return { ip, fingerprint, location }
}

function isFraudEvent(payload: unknown) {
  const blob = parseText(payload).toLowerCase()
  return (
    blob.includes('med') ||
    blob.includes('chargeback') ||
    blob.includes('contest') ||
    blob.includes('devolu') ||
    blob.includes('estorno') ||
    blob.includes('refund')
  )
}

export async function POST(req: NextRequest) {
  const secret = process.env.INTER_MED_WEBHOOK_SECRET?.trim()
  if (secret && req.headers.get('x-inter-webhook-secret') !== secret) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  let payload: unknown
  let rawBody = ''
  try {
    rawBody = await req.text()
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'JSON invalido' }, { status: 400 })
  }

  if (!isFraudEvent(payload)) {
    return NextResponse.json({ ok: true, ignored: true, reason: 'NO_FRAUD_EVENT' })
  }

  const payloadObj = isObject(payload) ? payload : {}
  const txid = extractTxid(payload)
  const e2eid = extractE2eId(payload)
  if (!txid && !e2eid) {
    return NextResponse.json({ ok: true, ignored: true, reason: 'NO_TXID_OR_E2EID' })
  }

  const checkout = await prisma.quickSaleCheckout.findFirst({
    where: {
      status: 'PAID',
      OR: [
        txid ? { interTxid: txid } : undefined,
        e2eid ? { interE2eId: e2eid } : undefined,
      ].filter(Boolean) as Array<{ interTxid?: string; interE2eId?: string }>,
    },
    select: {
      id: true,
      listingId: true,
      buyerName: true,
      buyerCpf: true,
      buyerEmail: true,
      buyerWhatsapp: true,
      deliveryFlowStatus: true,
      deliveryStatusNote: true,
      listing: {
        select: {
          title: true,
          slug: true,
        },
      },
    },
  })

  if (!checkout) {
    return NextResponse.json({ ok: true, ignored: true, reason: 'CHECKOUT_NOT_FOUND' })
  }

  const alreadyBlocked =
    checkout.deliveryStatusNote?.toLowerCase().includes('kill switch') ||
    checkout.deliveryStatusNote?.toLowerCase().includes('fraude/chargeback detectado')
  if (alreadyBlocked) {
    return NextResponse.json({
      ok: true,
      checkoutId: checkout.id,
      ignored: true,
      reason: 'ALREADY_BLOCKED',
    })
  }

  const profileRef = await getQuickSaleAdspowerProfileRef(checkout.id).catch(() => null)
  let adspowerDisabled = false
  let adspowerDisableError: string | null = null
  if (profileRef?.profileId) {
    try {
      await adspowerDisableProfile(profileRef.profileId)
      adspowerDisabled = true
    } catch (e) {
      adspowerDisableError = e instanceof Error ? e.message : 'ADSP_DISABLE_FAILED'
    }
  }

  await addToQuickSaleGlobalBlacklist({
    buyerEmail: checkout.buyerEmail,
    buyerDocument: checkout.buyerCpf,
    reason: 'INTER_MED_OR_CHARGEBACK',
    source: 'inter_webhook_med',
  }).catch(() => null)

  const antiFraudBlocks = await incrementQuickSaleAntiFraudCounter().catch(() => null)
  const context = parseIpAndFingerprint(payload, req)

  await prisma.quickSaleCheckout.update({
    where: { id: checkout.id },
    data: {
      deliveryFlowStatus: 'PENDING_KYC',
      deliveryStatusNote: adspowerDisabled
        ? 'Fraude/chargeback detectado. Perfil AdsPower desativado pelo Kill Switch e cliente bloqueado.'
        : 'Fraude/chargeback detectado. Cliente bloqueado e acesso em analise manual (Kill Switch).',
    },
  }).catch(() => null)

  await prisma.auditLog.create({
    data: {
      action: 'QUICK_SALE_INTER_MED_TRIGGERED',
      entity: 'QuickSaleCheckout',
      entityId: checkout.id,
      userId: null,
      details: {
        txid,
        e2eid,
        checkoutId: checkout.id,
        adspowerProfileId: profileRef?.profileId ?? null,
        adspowerDisabled,
        adspowerDisableError,
        antiFraudBlocks,
        eventType: parseText(payloadObj.evento).trim() || parseText(payloadObj.eventType).trim() || null,
        ip: context.ip,
        fingerprint: context.fingerprint,
        location: context.location,
        payloadSnippet: rawBody.slice(0, 1800),
      },
    },
  }).catch(() => null)

  await sendFraudAlertToChatOps({
    title: 'Kill Switch acionado (Inter MED/Chargeback)',
    severity: 'CRITICAL',
    details: {
      checkoutId: checkout.id,
      listing: checkout.listing.title,
      buyerName: checkout.buyerName,
      buyerEmail: checkout.buyerEmail ?? 'n/a',
      buyerDocument: checkout.buyerCpf,
      buyerWhatsapp: checkout.buyerWhatsapp,
      txid: txid ?? 'n/a',
      e2eid: e2eid ?? 'n/a',
      adspowerProfileId: profileRef?.profileId ?? 'n/a',
      adspowerDisabled,
      adspowerDisableError: adspowerDisableError ?? 'none',
      antiFraudBlocks: antiFraudBlocks ?? 'n/a',
      ip: context.ip ?? 'n/a',
      fingerprint: context.fingerprint ?? 'n/a',
      location: context.location ?? 'n/a',
    },
  }).catch(() => null)

  return NextResponse.json({
    ok: true,
    checkoutId: checkout.id,
    adspowerDisabled,
    antiFraudBlocks,
  })
}
