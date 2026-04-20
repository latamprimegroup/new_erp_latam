/**
 * Identity sync via Playwright + perfil AdsPower (CDP).
 * Requer AdsPower aberto com Local API; use apenas em conformidade com políticas Google e lei local.
 * Desligado por padrão: GEO_PROVISION_IDENTITY_AUTOMATION=true
 */
import { decrypt } from '@/lib/encryption'
import type { CnpjNormalized } from '@/lib/receita-federal'
import { startAdsPowerBrowser, stopAdsPowerBrowser } from './adspower-industrial'

export type IdentitySyncInput = {
  adsPowerProfileId: string
  partnerLegalName: string | null | undefined
  partnerBirthDate: Date | null | undefined
  fiscal: Pick<
    CnpjNormalized,
    | 'cnpj'
    | 'razaoSocial'
    | 'cep'
    | 'municipio'
    | 'uf'
    | 'logradouro'
    | 'numero'
    | 'complemento'
    | 'bairro'
  >
}

function formatFiscalLine(f: IdentitySyncInput['fiscal']): string {
  const parts = [
    f.logradouro,
    f.numero,
    f.complemento,
    f.bairro,
    f.municipio,
    f.uf,
    f.cep ? `CEP ${f.cep}` : null,
  ].filter(Boolean)
  return parts.join(', ')
}

export async function runIdentitySyncPipeline(input: IdentitySyncInput): Promise<{ logs: string[] }> {
  const logs: string[] = []
  const automation =
    process.env.GEO_PROVISION_IDENTITY_AUTOMATION === '1' ||
    process.env.GEO_PROVISION_IDENTITY_AUTOMATION === 'true'

  if (!automation) {
    logs.push(
      'Automação de identidade desligada (defina GEO_PROVISION_IDENTITY_AUTOMATION=true para tentar fluxo Playwright).'
    )
    logs.push(
      `Dados fiscais para G-Pay (operador): CNPJ ${input.fiscal.cnpj} — ${formatFiscalLine(input.fiscal)}`
    )
    return { logs }
  }

  let ws: string | null = null
  try {
    logs.push(`Abrindo perfil AdsPower #${input.adsPowerProfileId} (headless conforme env)…`)
    const started = await startAdsPowerBrowser(input.adsPowerProfileId)
    ws = started.wsPuppeteer
    if (!ws) {
      logs.push('AdsPower não retornou WebSocket Puppeteer — sincronização manual necessária.')
      return { logs }
    }

    const { chromium } = await import('playwright-core')
    const browser = await chromium.connectOverCDP(ws)
    try {
      const ctx = browser.contexts()[0]
      if (!ctx) {
        logs.push('Nenhum contexto de browser retornado pelo AdsPower — automação abortada.')
        return { logs }
      }
      const page = ctx.pages()[0] || (await ctx.newPage())

      logs.push('Conectado via CDP — navegando myaccount.google.com…')
      await page.goto('https://myaccount.google.com/', { waitUntil: 'domcontentloaded', timeout: 90_000 })

      if (input.partnerLegalName?.trim()) {
        logs.push('Injetando nome do sócio (seletores genéricos — pode falhar se a UI mudar)…')
        try {
          await page.goto('https://myaccount.google.com/personal-info', {
            waitUntil: 'domcontentloaded',
            timeout: 60_000,
          })
          const candidate = page.getByRole('textbox').first()
          await candidate.fill(input.partnerLegalName.trim(), { timeout: 8000 })
        } catch {
          logs.push('Não foi possível preencher nome automaticamente — concluir manualmente no perfil.')
        }
      }

      if (input.partnerBirthDate) {
        logs.push('Data de nascimento: fluxo depende de verificação Google — revisar manualmente se necessário.')
      }

      logs.push('Navegando para área de pagamentos Google (G-Pay)…')
      try {
        await page.goto('https://pay.google.com/gp/w/home/paymentmethods', {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        })
        logs.push(
          `Use o assistente para CNPJ ${input.fiscal.cnpj} e endereço: ${formatFiscalLine(input.fiscal)}`
        )
      } catch {
        logs.push('Falha ao abrir pay.google.com — continuar manualmente.')
      }

      logs.push('Sincronização automatizada (parcial) concluída.')
    } finally {
      await browser.close().catch(() => {})
    }
  } catch (e) {
    logs.push(e instanceof Error ? e.message : 'Erro no pipeline de identidade')
  } finally {
    await stopAdsPowerBrowser(input.adsPowerProfileId).catch(() => {})
  }

  return { logs }
}

/** Descriptografa cookie JSON do cofre para o campo `cookie` do AdsPower (string JSON). */
export function decryptVaultCookieForAdsPower(sessionCookiesEnc: string | null | undefined): string | null {
  if (!sessionCookiesEnc?.trim()) return null
  const plain = decrypt(sessionCookiesEnc)
  if (!plain) return null
  try {
    JSON.parse(plain)
    return plain
  } catch {
    return null
  }
}
