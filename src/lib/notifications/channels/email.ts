/**
 * Canal Email - placeholder para Resend/SMTP
 * Configure EMAIL_PROVIDER, RESEND_API_KEY ou SMTP_* no .env
 */
export type EmailPayload = {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const provider = process.env.EMAIL_PROVIDER || 'resend'
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey && provider === 'resend') {
    console.warn('RESEND_API_KEY não configurado. Email não enviado.')
    return false
  }

  try {
    if (provider === 'resend') {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'Ads Ativos <noreply@adsativos.com>',
          to: [payload.to],
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        }),
      })
      return res.ok
    }
    return false
  } catch (e) {
    console.error('Email send error:', e)
    return false
  }
}
