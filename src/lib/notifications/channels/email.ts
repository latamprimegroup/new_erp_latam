/**
 * Canal Email — Ads Ativos Global
 * Suporta Resend (padrão). Configure RESEND_API_KEY no .env.
 */
import { BRAND, detectLanguage } from '@/lib/brand'

export type EmailPayload = {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY não configurado — e-mail não enviado.')
    return false
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from:    process.env.EMAIL_FROM ?? `${BRAND.name} <noreply@adsativos.com>`,
        to:      [payload.to],
        subject: payload.subject,
        html:    payload.html,
        text:    payload.text,
      }),
    })
    if (!res.ok) {
      console.error('[Email] Resend error:', res.status, await res.text().catch(() => ''))
    }
    return res.ok
  } catch (e) {
    console.error('[Email] Erro ao enviar:', e)
    return false
  }
}

// ─── Templates HTML ───────────────────────────────────────────────────────────

/** Layout base de e-mail da marca */
function emailLayout(content: string, lang: 'pt' | 'en' = 'pt'): string {
  const tagline = lang === 'en' ? BRAND.taglineEN : BRAND.taglinePT
  const domain  = BRAND.domain

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${BRAND.name}</title>
  <style>
    body { margin:0; padding:0; background:#0a0a0a; font-family: 'Segoe UI', Arial, sans-serif; color:#e4e4e7; }
    .container { max-width:600px; margin:0 auto; }
    .header { background: linear-gradient(135deg, #065f46, #0c4a6e); padding:32px 24px; text-align:center; }
    .header-title { font-size:20px; font-weight:800; color:#ffffff; letter-spacing:.5px; margin:0; }
    .header-sub { font-size:12px; color:#a7f3d0; margin:4px 0 0; letter-spacing:1px; text-transform:uppercase; }
    .body { background:#18181b; padding:32px 24px; }
    .footer { background:#09090b; padding:20px 24px; text-align:center; border-top:1px solid #27272a; }
    .footer-text { font-size:11px; color:#52525b; line-height:1.6; }
    .footer-link { color:#6d28d9; text-decoration:none; }
    .btn { display:inline-block; background:linear-gradient(135deg,#10b981,#0ea5e9); color:#fff !important;
           padding:14px 28px; border-radius:10px; font-weight:700; font-size:14px;
           text-decoration:none; letter-spacing:.3px; margin:16px 0; }
    .card { background:#09090b; border:1px solid #27272a; border-radius:12px; padding:20px; margin:16px 0; }
    .label { font-size:11px; color:#71717a; text-transform:uppercase; letter-spacing:.8px; margin-bottom:4px; }
    .value { font-size:14px; color:#e4e4e7; font-family:monospace; background:#1c1c1e; padding:4px 8px; border-radius:4px; }
    h2 { color:#f4f4f5; font-size:22px; margin:0 0 8px; }
    p  { color:#a1a1aa; font-size:14px; line-height:1.7; margin:8px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <p class="header-title">🛡️ ${BRAND.name}</p>
      <p class="header-sub">${tagline}</p>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p class="footer-text">
        © ${new Date().getFullYear()} ${BRAND.name} · Todos os direitos reservados<br/>
        <a class="footer-link" href="${domain}">${domain}</a>
      </p>
    </div>
  </div>
</body>
</html>`
}

/** Template: credenciais de acesso entregues ao comprador */
export function buildDeliveryEmail(params: {
  buyerName:    string
  buyerEmail:   string
  productTitle: string
  orderId:      string
  credentials?: Record<string, string>
  warrantyEndsAt?: Date | null
  panelUrl?:    string
  lang?:        'pt' | 'en'
}): { subject: string; html: string; text: string } {
  const lang      = params.lang ?? detectLanguage(params.buyerEmail)
  const panelUrl  = params.panelUrl ?? `${BRAND.domain}${BRAND.dashboardPath}`
  const warrantyStr = params.warrantyEndsAt
    ? new Date(params.warrantyEndsAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'pt-BR')
    : lang === 'en' ? '7 days from now' : '7 dias a partir de hoje'

  const credRows = params.credentials
    ? Object.entries(params.credentials)
        .filter(([, v]) => v?.trim())
        .map(([k, v]) => `<div class="card"><p class="label">${k}</p><p class="value">${v}</p></div>`)
        .join('')
    : `<p style="color:#6d28d9">${lang === 'en' ? 'Credentials will be sent by support.' : 'Credenciais serão enviadas pelo suporte.'}</p>`

  const isPT = lang === 'pt'

  const html = emailLayout(`
    <h2>${isPT ? `🚀 Infraestrutura Liberada, ${params.buyerName}!` : `🚀 Infrastructure Delivered, ${params.buyerName}!`}</h2>
    <p>${isPT
      ? `Seu pagamento foi confirmado e seu ativo já está disponível no painel.`
      : `Your payment has been confirmed and your asset is now available in the dashboard.`
    }</p>

    <div class="card">
      <p class="label">${isPT ? 'Produto' : 'Product'}</p>
      <p class="value">${params.productTitle}</p>
    </div>
    <div class="card">
      <p class="label">${isPT ? 'ID do Pedido' : 'Order ID'}</p>
      <p class="value">#${params.orderId}</p>
    </div>
    <div class="card">
      <p class="label">${isPT ? 'Garantia até' : 'Warranty until'}</p>
      <p class="value">${warrantyStr}</p>
    </div>

    ${credRows ? `<p style="margin-top:20px;font-size:13px;color:#71717a;">${isPT ? '📦 DADOS DE ACESSO:' : '📦 ACCESS DATA:'}</p>${credRows}` : ''}

    <div style="text-align:center;margin-top:24px;">
      <a class="btn" href="${panelUrl}">${isPT ? '🚀 Acessar Painel' : '🚀 Access Dashboard'}</a>
    </div>
    <p style="font-size:12px;color:#52525b;margin-top:16px;">
      ${isPT
        ? `Em caso de problemas, acesse o sistema de RMA: <a href="${BRAND.domain}${BRAND.rmaPath}" style="color:#6d28d9;">Solicitar Troca</a>`
        : `For any issues, use our RMA system: <a href="${BRAND.domain}${BRAND.rmaPath}" style="color:#6d28d9;">Request Replacement</a>`
      }
    </p>
  `, lang)

  const text = isPT
    ? `Olá ${params.buyerName}!\n\nSeu pagamento foi confirmado. Produto: ${params.productTitle}\nID: #${params.orderId}\nGarantia: ${warrantyStr}\n\nAcesse: ${panelUrl}\n\n${BRAND.name}`
    : `Hello ${params.buyerName}!\n\nPayment confirmed. Product: ${params.productTitle}\nOrder ID: #${params.orderId}\nWarranty: ${warrantyStr}\n\nDashboard: ${panelUrl}\n\n${BRAND.name}`

  return {
    subject: isPT
      ? `✅ ${BRAND.nameShort} — Sua infraestrutura está pronta, ${params.buyerName}!`
      : `✅ ${BRAND.nameShort} — Your infrastructure is ready, ${params.buyerName}!`,
    html,
    text,
  }
}

/** Template: boas-vindas + credenciais de acesso ao painel (cliente novo) */
export function buildWelcomeEmail(params: {
  buyerName:    string
  buyerEmail:   string
  tempPassword: string
  panelUrl?:    string
  lang?:        'pt' | 'en'
}): { subject: string; html: string; text: string } {
  const lang     = params.lang ?? detectLanguage(params.buyerEmail)
  const panelUrl = params.panelUrl ?? `${BRAND.domain}${BRAND.dashboardPath}`
  const isPT     = lang === 'pt'

  const html = emailLayout(`
    <h2>${isPT ? `👋 Bem-vindo(a) à ${BRAND.name}!` : `👋 Welcome to ${BRAND.name}!`}</h2>
    <p>${isPT
      ? `Sua conta foi criada automaticamente. Use as credenciais abaixo para acessar o painel:`
      : `Your account has been automatically created. Use the credentials below to access your dashboard:`
    }</p>
    <div class="card">
      <p class="label">${isPT ? 'E-mail de acesso' : 'Login email'}</p>
      <p class="value">${params.buyerEmail}</p>
    </div>
    <div class="card">
      <p class="label">${isPT ? 'Senha temporária' : 'Temporary password'}</p>
      <p class="value">${params.tempPassword}</p>
    </div>
    <div style="text-align:center;margin-top:24px;">
      <a class="btn" href="${panelUrl}">${isPT ? '🔐 Acessar Agora' : '🔐 Login Now'}</a>
    </div>
    <p style="font-size:12px;color:#52525b;margin-top:12px;text-align:center;">
      ${isPT ? '⚠️ Altere sua senha após o primeiro acesso.' : '⚠️ Please change your password after first login.'}
    </p>
  `, lang)

  const text = isPT
    ? `Bem-vindo(a) à ${BRAND.name}!\n\nLogin: ${params.buyerEmail}\nSenha: ${params.tempPassword}\n\nAcesse: ${panelUrl}`
    : `Welcome to ${BRAND.name}!\n\nLogin: ${params.buyerEmail}\nPassword: ${params.tempPassword}\n\nDashboard: ${panelUrl}`

  return {
    subject: isPT
      ? `🛡️ ${BRAND.name} — Seus dados de acesso`
      : `🛡️ ${BRAND.name} — Your access credentials`,
    html,
    text,
  }
}
