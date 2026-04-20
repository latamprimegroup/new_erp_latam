/**
 * Telegram — alertas do time comercial (env TELEGRAM_SALES_BOT_TOKEN + TELEGRAM_SALES_CHAT_ID).
 */
export async function sendTelegramSalesMessage(text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_SALES_BOT_TOKEN?.trim()
  const chatId = process.env.TELEGRAM_SALES_CHAT_ID?.trim()
  if (!token || !chatId) {
    return { ok: false, error: 'Telegram não configurado' }
  }
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.description || res.statusText }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fetch error'
    return { ok: false, error: msg }
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Nova solicitação na Área do Cliente (fluxo lead → comercial). */
export async function sendTelegramClientSolicitation(opts: {
  clientEmail: string | null
  quantity: number
  product: string
  accountType: string
  country?: string | null
}): Promise<void> {
  const who = opts.clientEmail || 'Cliente'
  const msg = [
    '📩 <b>Nova solicitação</b> (Área do Cliente — Solicitar)',
    `Cliente: ${esc(who)}`,
    `Quantidade: ${opts.quantity}× ${esc(opts.product)} (${esc(opts.accountType)})`,
    opts.country ? `País: ${esc(opts.country)}` : '',
    '',
    'Próximo passo: enviar link de pagamento pelo WhatsApp e registrar pedido no ERP.',
  ]
    .filter(Boolean)
    .join('\n')
  await sendTelegramSalesMessage(msg).catch((e) => console.error('telegram solicitation', e))
}
