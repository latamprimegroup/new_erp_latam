/**
 * Canal WhatsApp - suporta Evolution API ou outros provedores
 * Configure WHATSAPP_API_URL e WHATSAPP_API_KEY no .env
 */
export type WhatsAppPayload = {
  phone: string
  message: string
}

export async function sendWhatsApp(payload: WhatsAppPayload): Promise<boolean> {
  const url = process.env.WHATSAPP_API_URL
  const key = process.env.WHATSAPP_API_KEY
  const instanceId = process.env.WHATSAPP_INSTANCE_ID

  if (!url) {
    console.warn('WHATSAPP_API_URL não configurado. Notificação WhatsApp não enviada.')
    return false
  }

  const phone = normalizePhone(payload.phone)
  if (!phone) {
    console.warn('Número de telefone inválido para WhatsApp')
    return false
  }

  try {
    // Evolution API format
    if (url.includes('evolution')) {
      const endpoint = `${url}/message/sendText/${instanceId || 'ads-ativos'}`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(key && { apikey: key }),
        },
        body: JSON.stringify({
          number: phone,
          text: payload.message,
        }),
      })
      return res.ok
    }

    // Fallback: POST genérico (adaptar ao seu provedor)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key && { Authorization: `Bearer ${key}` }) },
      body: JSON.stringify({ phone: phone, message: payload.message }),
    })
    return res.ok
  } catch (e) {
    console.error('WhatsApp send error:', e)
    return false
  }
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length >= 10) {
    return digits.startsWith('55') ? digits : `55${digits}`
  }
  return ''
}
