'use client'

import { Suspense, useState, useRef, useCallback } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ThemeToggle } from '@/components/ThemeToggle'
import { TurnstileGate } from '@/components/auth/TurnstileGate'

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || ''

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const turnstileRunRef = useRef<(() => Promise<string>) | null>(null)

  const onTurnstileReady = useCallback((run: () => Promise<string>) => {
    turnstileRunRef.current = run
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    let turnstileToken = ''
    if (turnstileSiteKey) {
      const run = turnstileRunRef.current
      if (!run) {
        setLoading(false)
        setError('Carregando verificação de segurança… Aguarde um instante e tente novamente.')
        return
      }
      try {
        turnstileToken = await run()
      } catch {
        setLoading(false)
        setError('Não foi possível validar o acesso humano. Atualize a página e tente de novo.')
        return
      }
    }

    const res = await signIn('credentials', {
      email,
      password,
      turnstileToken: turnstileToken || ' ',
      remember: remember ? 'true' : 'false',
      redirect: false,
    })

    setLoading(false)

    if (res?.status === 429) {
      setError(
        'Muitas tentativas de login a partir desta rede. Aguarde alguns minutos ou fale com o suporte.'
      )
      return
    }

    if (res?.error) {
      const err = String(res.error)
      const low = err.toLowerCase()
      if (low.includes('muitas') || low.includes('tentativa') || low.includes('rate')) {
        setError('Muitas tentativas de login. Aguarde e tente novamente.')
        return
      }
      if (
        low.includes('verificação') ||
        low.includes('anti-bot') ||
        low.includes('captcha') ||
        low.includes('turnstile')
      ) {
        setError('Verificação de segurança falhou. Atualize a página e tente de novo.')
        return
      }
      if (low.includes('indisponível') || low.includes('tente novamente em alguns')) {
        setError('Serviço temporariamente indisponível. Tente novamente em alguns instantes.')
        return
      }
      if (low.includes('não encontramos cadastro') || low.includes('e-mail')) {
        setError(err.length < 200 ? err : 'Não encontramos cadastro com este e-mail.')
        return
      }
      if (low.includes('senha incorreta')) {
        setError(err.length < 200 ? err : 'Senha incorreta. Use “Esqueceu a senha?” se precisar.')
        return
      }
      setError(
        err.length > 5 && err.length < 220 && !low.includes('credentialssignin')
          ? err
          : 'E-mail ou senha inválidos. Verifique os dados e tente novamente.'
      )
      return
    }
    router.push(callbackUrl)
    router.refresh()
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-ads-offwhite dark:bg-ads-navy relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="card w-full max-w-md animate-scale-in shadow-ads-lg mt-8">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex flex-col items-center mb-4">
            <Image src="/logos/ads-azul-ativos-branco.png" alt="ADS Ativos" width={140} height={44} className="h-11 w-auto dark:hidden" />
            <Image src="/logos/ads-branco-ativos-branco.png" alt="ADS Ativos" width={140} height={44} className="h-11 w-auto hidden dark:block" />
            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">ERP</span>
          </Link>
          <p className="text-gray-500 dark:text-gray-400">ERP – Acesse sua conta</p>
        </div>

        {turnstileSiteKey ? <TurnstileGate siteKey={turnstileSiteKey} onReady={onTurnstileReady} /> : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              className="bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-200 dark:border-red-800 px-3 py-2 rounded-lg text-sm border border-red-100"
              role="alert"
            >
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="seu@email.com"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-600"
              />
              <span className="text-sm text-gray-600">Manter conectado</span>
            </label>
            <Link
              href="/recuperar-senha"
              className="link-accent text-sm"
            >
              Esqueceu a senha?
            </Link>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 disabled:opacity-50"
          >
            {loading ? 'Acessando...' : 'Acessar Sistema'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Ainda não tem uma conta?{' '}
          <Link href="/cadastro" className="link-accent">
            Cadastre-se agora
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-gray-400">
          Ao continuar, você aceita nossos{' '}
          <Link href="/termos" className="link-primary">
            Termos de Uso
          </Link>
        </p>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-ads-offwhite dark:bg-ads-navy relative">
        <div className="absolute top-4 right-4"><ThemeToggle /></div>
        <div className="card w-full max-w-md animate-pulse h-96" />
      </main>
    }>
      <LoginForm />
    </Suspense>
  )
}
