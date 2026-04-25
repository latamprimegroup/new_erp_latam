#!/usr/bin/env node
/**
 * Smoke test para o webhook de contestação/MED do Banco Inter.
 *
 * Uso:
 *   INTER_MED_WEBHOOK_SECRET=segredo \
 *   BASE_URL=http://localhost:3000 \
 *   node scripts/inter-med-webhook-smoke.mjs TXID_OPCIONAL
 */

const base = process.env.BASE_URL || 'http://localhost:3000'
const secret = process.env.INTER_MED_WEBHOOK_SECRET || ''
const txid = (process.argv[2] || `MED${Date.now()}`).replace(/[^a-zA-Z0-9]/g, '').slice(0, 35)

async function main() {
  const payload = {
    evento: 'MED_CONTESTACAO_ABERTA',
    txid,
    reason: 'chargeback_suspected',
    ip: '177.0.0.1',
    fingerprint: 'fp-smoke-test-quick-sale',
    location: 'BR-SP',
  }

  const headers = { 'Content-Type': 'application/json' }
  if (secret) {
    headers['x-inter-webhook-secret'] = secret
  }

  const res = await fetch(`${base}/api/webhooks/inter/med`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  const text = await res.text()
  console.log(JSON.stringify({
    ok: res.ok,
    status: res.status,
    txid,
    response: text,
  }, null, 2))

  if (!res.ok) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
