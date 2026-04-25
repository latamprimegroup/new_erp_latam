import Link from 'next/link'

const WA_NUMBER_RAW =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER
  || process.env.NEXT_PUBLIC_WHATSAPP_SUPORTE
  || '5511999999999'

function normalizeWaNumber(input: string) {
  const digits = String(input || '').replace(/\D/g, '')
  if (!digits) return '5511999999999'
  return digits.startsWith('55') ? digits : `55${digits}`
}

function firstSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]
  return value
}

type DecoyPageProps = {
  searchParams: Record<string, string | string[] | undefined>
}

export default function PaginaIscaPage({ searchParams }: DecoyPageProps) {
  const source = firstSearchParam(searchParams.source) || 'desconhecido'
  const reason = firstSearchParam(searchParams.reason) || 'not_informed'
  const code = firstSearchParam(searchParams.code) || 'N/A'
  const token = firstSearchParam(searchParams.token) || 'sem-token'

  const waNumber = normalizeWaNumber(WA_NUMBER_RAW)
  const trackedMessage = [
    'Olá, preciso de ativos para minha operação.',
    '',
    `Origem: pagina-isca`,
    `Canal: ${source}`,
    `Motivo: ${reason}`,
    `Código: ${code}`,
    `Token: ${token}`,
  ].join('\n')
  const waHref = `https://wa.me/${waNumber}?text=${encodeURIComponent(trackedMessage)}`

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 space-y-4">
          <p className="text-xs uppercase tracking-[0.16em] text-emerald-300 font-semibold">
            Ads Ativos • Operação assistida
          </p>
          <h1 className="text-3xl font-extrabold leading-tight">
            Precisando de ativos para escalar sua operação com segurança?
          </h1>
          <p className="text-zinc-300 text-sm leading-relaxed">
            Nossa mesa comercial libera ativos prontos para operação com suporte dedicado, curadoria de qualidade
            e acompanhamento de entrega. Fale agora com a equipe para receber opções no seu perfil de compra.
          </p>
          <ul className="text-sm text-zinc-200 space-y-1 list-disc list-inside">
            <li>Contas e perfis selecionados para tráfego pago</li>
            <li>Opções para operação Brasil e Global</li>
            <li>Atendimento rápido via WhatsApp com rastreio de origem</li>
          </ul>
          <div className="flex flex-wrap gap-3 pt-2">
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition"
            >
              Chamar no WhatsApp
            </a>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-xl border border-zinc-700 hover:border-zinc-500 px-4 py-2 text-sm font-semibold text-zinc-200 transition"
            >
              Voltar para início
            </Link>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-[11px] text-zinc-500">
            Referência de rastreio desta visita: <span className="text-zinc-300">{source}</span> •{' '}
            <span className="text-zinc-300">{reason}</span> • <span className="text-zinc-300">{code}</span>
          </p>
        </section>
      </div>
    </main>
  )
}
