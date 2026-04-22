import { getServerSession } from 'next-auth/next'
import { authOptions }      from '@/lib/auth'
import { redirect }         from 'next/navigation'
import Link                 from 'next/link'
import { signOut }          from 'next-auth/react'
import LogoutButton         from './LogoutButton'

export const metadata = { title: 'Aguardando Aprovação — Ads Ativos OS' }

export default async function AguardandoAprovacaoPage() {
  const session = await getServerSession(authOptions)

  // Se não está logado → login
  if (!session?.user) redirect('/login')

  // Se já foi aprovado → dashboard
  if (session.user.status === 'ACTIVE') redirect('/dashboard')

  // Se banido → login com flag
  if (session.user.status === 'BANNED') redirect('/login?banido=1')

  const name  = session.user.name  || 'Usuário'
  const email = session.user.email || ''
  const role  = session.user.role  || ''

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0D1B2A] via-[#0f2240] to-[#0D1B2A] flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6 animate-fade-in">

        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 mb-4 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-white">Ads Ativos OS</h1>
          <p className="text-blue-300 text-sm mt-1">War Room — Acesso Restrito</p>
        </div>

        {/* Card principal */}
        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-3xl p-8 space-y-5">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-500/20 border border-amber-500/30 mb-2">
              <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-black text-white">Cadastro Recebido!</h2>
            <p className="text-white/60 text-sm leading-relaxed">
              Olá, <span className="text-white font-semibold">{name}</span>. Seu cadastro foi registrado com sucesso.
              O acesso ao ERP Ads Ativos depende de <span className="text-amber-400 font-bold">aprovação manual do CEO Tiago Alfredo</span>.
            </p>
          </div>

          {/* Detalhes do cadastro */}
          <div className="bg-white/5 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-white/50">E-mail</span>
              <span className="text-white font-medium">{email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">Perfil solicitado</span>
              <span className="text-blue-300 font-medium">{role}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">Status</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Aguardando Aprovação
              </span>
            </div>
          </div>

          {/* Instruções */}
          <div className="space-y-3 text-sm text-white/60">
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-600/30 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-blue-400 text-xs font-bold">1</span>
              </div>
              <p>Aguarde o contato da equipe Ads Ativos via WhatsApp ou e-mail.</p>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-600/30 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-blue-400 text-xs font-bold">2</span>
              </div>
              <p>Após a aprovação, faça login novamente para acessar o sistema completo.</p>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-600/30 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-blue-400 text-xs font-bold">3</span>
              </div>
              <p>Em caso de dúvidas, entre em contato pelo WhatsApp oficial da Ads Ativos.</p>
            </div>
          </div>

          {/* Botão de sair */}
          <LogoutButton />
        </div>

        {/* Footer */}
        <p className="text-center text-white/20 text-xs">
          Ads Ativos OS © 2026 — Sistema de Gestão Interno. Acesso não autorizado é crime (Lei 12.737/2012).
        </p>
      </div>
    </div>
  )
}
