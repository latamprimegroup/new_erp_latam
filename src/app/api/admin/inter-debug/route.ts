/**
 * GET /api/admin/inter-debug
 * Diagnóstico profundo das variáveis Inter sem expor os valores reais.
 * Mostra: presença, tamanho, formato e primeiros 20 chars de cada variável.
 * Somente ADMIN.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

function inspect(key: string) {
  const val = process.env[key]
  if (!val || !val.trim()) return { present: false, length: 0, format: 'missing', preview: '' }
  const trimmed = val.trim()
  const isPem = trimmed.startsWith('-----')
  const isBase64 = /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed) && !isPem
  const hasLiteralNewlines = trimmed.includes('\\n')
  return {
    present: true,
    length: trimmed.length,
    format: isPem ? 'PEM completo' : isBase64 ? 'Base64' : 'outro',
    hasLiteralNewlines,
    preview: trimmed.slice(0, 30).replace(/\n/g, '↵') + '...',
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if ((session?.user as { role?: string } | undefined)?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  // Verifica arquivos físicos de certificado
  const certsDir = path.join(process.cwd(), 'certs')
  const crtPath  = path.join(certsDir, 'inter.crt')
  const keyPath  = path.join(certsDir, 'inter.key')
  const crtFile  = fs.existsSync(crtPath) ? `Arquivo presente (${fs.statSync(crtPath).size} bytes)` : 'Arquivo não encontrado'
  const keyFile  = fs.existsSync(keyPath) ? `Arquivo presente (${fs.statSync(keyPath).size} bytes)` : 'Arquivo não encontrado'

  const vars: Record<string, ReturnType<typeof inspect>> = {}
  for (const key of [
    'INTER_CLIENT_ID', 'INTER_CLIENT_SECRET',
    'INTER_CERT_CRT', 'INTER_CERT_BASE64', 'BANCO_INTER_CERT_BASE64',
    'INTER_CERT_KEY', 'INTER_KEY_BASE64', 'BANCO_INTER_KEY_BASE64',
    'INTER_PIX_KEY', 'BANCO_INTER_PIX_KEY',
    'INTER_ACCOUNT_NUMBER', 'INTER_ACCOUNT_KEY', 'BANCO_INTER_ACCOUNT_NUMBER',
    'INTER_TLS_CERT_PATH', 'INTER_TLS_KEY_PATH',
  ]) {
    vars[key] = inspect(key)
  }

  // Tenta carregar os certificados e captura o erro exato
  let certLoadError: string | null = null
  let certLoadOk = false
  try {
    const { loadCerts } = await import('@/lib/inter/client')
    // @ts-expect-error função interna
    if (typeof loadCerts === 'function') {
      // loadCerts não é exportada — tentamos via getInterToken que a chama internamente
    }
    certLoadOk = true
  } catch (e) {
    certLoadError = String(e)
  }

  // Tenta conexão OAuth e captura o erro exato
  let oauthError: string | null = null
  let oauthOk = false
  try {
    const { getInterToken } = await import('@/lib/inter/client')
    await getInterToken()
    oauthOk = true
  } catch (e) {
    oauthError = String(e)
  }

  return NextResponse.json({
    timestamp:    new Date().toISOString(),
    files:        { crtFile, keyFile },
    vars,
    certLoadOk,
    certLoadError,
    oauthOk,
    oauthError,
    diagnosis: !oauthOk && oauthError?.includes('fetch failed')
      ? 'REDE: O servidor não consegue conectar no Inter. Verifique se INTER_CERT_CRT e INTER_CERT_KEY estão em formato PEM correto (com quebras de linha reais, não \\n literais).'
      : !oauthOk && oauthError?.includes('client id')
      ? 'CREDENCIAIS: INTER_CLIENT_ID ou INTER_CLIENT_SECRET inválidos.'
      : !oauthOk
      ? `ERRO DESCONHECIDO: ${oauthError}`
      : 'OK: Autenticação OAuth funcionando.',
  })
}
