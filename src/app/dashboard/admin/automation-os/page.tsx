import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { Radio, Globe, Cpu, Shield } from 'lucide-react'

export default async function AutomationOsAdminPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user?.role !== 'ADMIN') redirect('/dashboard')

  return (
    <div className="max-w-3xl space-y-6 text-zinc-200">
      <div>
        <h1 className="text-xl font-bold text-white mb-1">Automation OS — Admin</h1>
        <p className="text-sm text-zinc-500">
          O cliente usa <strong className="text-zinc-300">Infraestrutura de Guerra</strong> em{' '}
          <code className="rounded bg-zinc-900 px-1 text-xs">/dashboard/ecosystem</code>. Aqui liga os módulos
          existentes sem duplicar dados.
        </p>
      </div>

      <ul className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/80 p-5 text-sm">
        <li className="flex gap-3">
          <Globe className="h-5 w-5 shrink-0 text-sky-400" />
          <span>
            <Link href="/dashboard/admin/provisioning" className="text-sky-400 hover:underline">
              Provisioning Engine
            </Link>{' '}
            — domínios, DNS e deploy de landings.
          </span>
        </li>
        <li className="flex gap-3">
          <Cpu className="h-5 w-5 shrink-0 text-amber-400" />
          <span>
            <Link href="/dashboard/estoque" className="text-amber-400 hover:underline">
              Estoque
            </Link>{' '}
            — contas e blocos; o cliente vê cards no ecossistema após entrega.
          </span>
        </li>
        <li className="flex gap-3">
          <Shield className="h-5 w-5 shrink-0 text-emerald-400" />
          <span>
            <Link href="/dashboard/admin/war-room" className="text-emerald-400 hover:underline">
              War Room
            </Link>{' '}
            — monitoramento operacional.
          </span>
        </li>
        <li className="flex gap-3">
          <Shield className="h-5 w-5 shrink-0 text-rose-400" />
          <span>
            <Link href="/dashboard/admin/guard" className="text-rose-400 hover:underline">
              Ads Ativos Guard
            </Link>{' '}
            — compliance (blacklist + IA + VSL assíncrono).
          </span>
        </li>
        <li className="flex gap-3">
          <Radio className="h-5 w-5 shrink-0 text-violet-400" />
          <span>
            Multilogin: variáveis <code className="text-xs text-zinc-500">ADSPOWER_LOCAL_API_URL</code>,{' '}
            <code className="text-xs text-zinc-500">DOLPHIN_LOCAL_API_URL</code> no servidor (documentação para API
            local no PC do cliente).
          </span>
        </li>
      </ul>

      <p className="text-xs text-zinc-600">
        FFmpeg: definir <code className="rounded bg-zinc-900 px-1">FFMPEG_PATH</code> para a rota de limpeza de vídeo
        usada pelo cliente.
      </p>
    </div>
  )
}
