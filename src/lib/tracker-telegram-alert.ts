/**
 * Alertas Telegram para o Ads Tracker (Módulo 13 — Safe Browsing, etc.).
 * TRACKER_ALERT_TELEGRAM_BOT_TOKEN + TRACKER_ALERT_TELEGRAM_CHAT_ID, ou fallback para TELEGRAM_BOT_TOKEN + TELEGRAM_COMMUNITY_CHAT_ID.
 */
export async function sendTrackerTelegramAlert(text: string): Promise<{ ok: boolean; skipped: boolean; error?: string }> {
  const token =
    process.env.TRACKER_ALERT_TELEGRAM_BOT_TOKEN?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId =
    process.env.TRACKER_ALERT_TELEGRAM_CHAT_ID?.trim() || process.env.TELEGRAM_COMMUNITY_CHAT_ID?.trim()
  if (!token || !chatId) {
    return { ok: false, skipped: true, error: 'Telegram não configurado' }
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
      signal: AbortSignal.timeout(12_000),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string }
    if (!res.ok || !data.ok) {
      return { ok: false, skipped: false, error: data.description || res.statusText }
    }
    return { ok: true, skipped: false }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fetch error'
    return { ok: false, skipped: false, error: msg }
  }
}
