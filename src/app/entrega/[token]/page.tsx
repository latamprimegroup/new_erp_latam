/**
 * /entrega/[token] — Página pública de entrega segura de credenciais.
 * Registra IP do acesso automaticamente.
 */
import { headers } from 'next/headers'
import { EntregaClient } from './EntregaClient'
import {
  validateMagicLink,
  recordMagicLinkAccess,
  type MagicLinkWithPayload,
} from '@/lib/delivery-magic-link'

export const dynamic = 'force-dynamic'

export default async function EntregaPage({ params }: { params: { token: string } }) {
  const reqHeaders = headers()
  const ip = (
    reqHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    reqHeaders.get('x-real-ip') ??
    null
  )
  const userAgent = reqHeaders.get('user-agent') ?? null
  const referer   = reqHeaders.get('referer') ?? null

  const result = await validateMagicLink(params.token)

  if (!result.valid) {
    const messages: Record<string, string> = {
      NOT_FOUND: 'Este link de entrega não existe ou já foi removido.',
      EXPIRED:   'Este link expirou. Entre em contato com o suporte para um novo link.',
      REVOKED:   'Este link foi revogado. Entre em contato com o suporte.',
      MAX_VIEWS: 'O limite de visualizações deste link foi atingido. Entre em contato com o suporte.',
    }
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
            <span className="text-red-400 text-2xl">🔒</span>
          </div>
          <h1 className="text-white font-bold text-lg">Link Inválido</h1>
          <p className="text-zinc-400 text-sm">{messages[result.reason] ?? 'Link inválido.'}</p>
          <p className="text-zinc-600 text-xs">Ads Ativos — War Room OS</p>
        </div>
      </div>
    )
  }

  // Registra o acesso em background (não bloqueia o render)
  void recordMagicLinkAccess({
    linkId:    result.link.id,
    ip,
    userAgent,
    referer,
  })

  return <EntregaClient link={result.link as MagicLinkWithPayload} />
}
