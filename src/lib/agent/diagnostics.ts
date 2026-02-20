/**
 * Diagnóstico Inteligente — Detecta erros e sugere correções em linguagem simples
 */

export type DiagnosticResult = {
  ok: boolean
  code: string
  message: string
  suggestion?: string
  details?: Record<string, unknown>
}

export type EnvironmentCheck = {
  key: string
  present: boolean
  value: string
}

/**
 * Verifica variáveis de ambiente obrigatórias
 */
export function checkEnvironment(): {
  ok: boolean
  checks: EnvironmentCheck[]
  missing: string[]
  messages: string[]
} {
  const required = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL'] as const
  const optional = ['ENCRYPTION_KEY', 'CRON_SECRET', 'DIRECT_DATABASE_URL', 'FIVESIM_API_KEY', 'GOOGLE_CALENDAR_CLIENT_ID'] as const

  const checks: EnvironmentCheck[] = []
  const missing: string[] = []
  const messages: string[] = []

  for (const key of required) {
    const val = process.env[key]
    const present = !!val && val.length > 0
    checks.push({
      key,
      present,
      value: present ? (val!.slice(0, 8) + '...') : '',
    })
    if (!present) {
      missing.push(key)
      messages.push(`Falta configurar "${key}" nas variáveis de ambiente.`)
    }
  }

  for (const key of optional) {
    const val = process.env[key]
    checks.push({
      key,
      present: !!val && val.length > 0,
      value: val ? val.slice(0, 8) + '...' : '(opcional)',
    })
  }

  return {
    ok: missing.length === 0,
    checks,
    missing,
    messages,
  }
}

/**
 * Mensagem simples para o usuário
 */
export function getSimpleMessage(diag: { ok: boolean; missing?: string[] }): string {
  if (diag.ok) return 'Tudo certo! Ambiente configurado.'
  if (diag.missing?.includes('DATABASE_URL'))
    return 'Configure a conexão com o banco de dados (DATABASE_URL) no painel da sua hospedagem.'
  if (diag.missing?.includes('NEXTAUTH_SECRET'))
    return 'Gere uma chave secreta (NEXTAUTH_SECRET) e adicione nas configurações.'
  if (diag.missing?.includes('NEXTAUTH_URL'))
    return 'Informe o endereço do seu ERP (NEXTAUTH_URL), por exemplo: https://seu-erp.com'
  return 'Verifique as configurações do ambiente.'
}

/**
 * Diagnóstico de conexão com banco
 */
export async function checkDatabase(prisma: { $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown> }): Promise<DiagnosticResult> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return {
      ok: true,
      code: 'DB_OK',
      message: 'Conexão com o banco de dados funcionando.',
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    let suggestion = 'Verifique se o banco está acessível e se a URL está correta.'
    if (msg.includes('connect') || msg.includes('ECONNREFUSED'))
      suggestion = 'O servidor do banco não está acessível. Confira a URL e se o banco está online.'
    if (msg.includes('auth') || msg.includes('password'))
      suggestion = 'Usuário ou senha do banco incorretos. Verifique DATABASE_URL.'
    return {
      ok: false,
      code: 'DB_CONNECTION_FAILED',
      message: 'Não foi possível conectar ao banco de dados.',
      suggestion,
      details: { error: msg },
    }
  }
}
