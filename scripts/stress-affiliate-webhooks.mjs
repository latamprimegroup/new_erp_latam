#!/usr/bin/env node
/**
 * Simulação rápida de carga no endpoint de webhooks (Pixel Hydra ingest).
 * Uso: AFFILIATE_WEBHOOK_SECRET=xxx BASE_URL=http://localhost:3000 node scripts/stress-affiliate-webhooks.mjs [n=500]
 *
 * Não substitui teste de carga profissional (k6, Artillery). Mede apenas se o Node aceita N POSTs sequenciais.
 */
const base = process.env.BASE_URL || 'http://localhost:3000'
const secret = process.env.AFFILIATE_WEBHOOK_SECRET
const n = Math.min(5000, Math.max(1, parseInt(process.argv[2] || '500', 10)))

if (!secret) {
  console.error('Defina AFFILIATE_WEBHOOK_SECRET')
  process.exit(1)
}

async function one(i) {
  const body = {
    id: `sim-${Date.now()}-${i}`,
    commission_value: 10 + (i % 50),
    data: { purchase_id: `p-${i}` },
  }
  const res = await fetch(`${base}/api/webhooks/affiliate?provider=stress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-OS-Webhook-Secret': secret,
    },
    body: JSON.stringify(body),
  })
  return res.status
}

async function main() {
  const t0 = Date.now()
  let ok = 0
  let fail = 0
  for (let i = 0; i < n; i++) {
    const s = await one(i)
    if (s === 200) ok++
    else fail++
    if ((i + 1) % 100 === 0) console.error(`… ${i + 1}/${n}`)
  }
  const ms = Date.now() - t0
  console.log(JSON.stringify({ n, ok, fail, ms, rps: ((n / ms) * 1000).toFixed(2) }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
