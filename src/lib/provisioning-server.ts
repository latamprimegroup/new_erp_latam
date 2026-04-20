/**
 * CyberPanel / painel remoto: webhook genérico + HTML inline se não houver URL.
 */

export type ServerProvisionPayload = {
  domain: string
  templateKey: string
  html: string
  metaPixelId: string | null
  videoVariantHash: string
  batchId: string
  itemId: string
}

export async function notifyProvisioningServer(payload: ServerProvisionPayload): Promise<{
  ok: boolean
  skipped: boolean
  message: string
}> {
  const url = process.env.PROVISIONING_SERVER_WEBHOOK_URL?.trim()
  if (!url) {
    return {
      ok: true,
      skipped: true,
      message: 'PROVISIONING_SERVER_WEBHOOK_URL não configurado — HTML gerado apenas no ERP (deploy manual).',
    }
  }

  const secret = process.env.PROVISIONING_WEBHOOK_SECRET?.trim()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (secret) headers.Authorization = `Bearer ${secret}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const t = await res.text()
      return { ok: false, skipped: false, message: `Webhook HTTP ${res.status}: ${t.slice(0, 200)}` }
    }
    return { ok: true, skipped: false, message: 'Servidor confirmou recebimento.' }
  } catch (e) {
    return {
      ok: false,
      skipped: false,
      message: e instanceof Error ? e.message : 'Falha de rede no webhook',
    }
  }
}
