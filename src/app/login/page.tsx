'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setLoading(false)
    if (res?.error) {
      const msg =
        String(res.error).toLowerCase().includes('muitas') ||
        String(res.error).toLowerCase().includes('tentativa')
        ? 'Muitas tentativas de login. Aguarde 1 minuto e tente novamente.'
        : 'E-mail ou senha inválidos. Tente novamente.'
      setError(msg)
      return
    }
    router.push(callbackUrl)
    router.refresh()
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-white to-primary-50/40 dark:from-ads-dark-bg dark:via-ads-dark-bg dark:to-ads-dark-bg relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="card w-full max-w-md animate-scale-in shadow-xl mt-8">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-4">
            <span className="text-2xl font-bold bg-gradient-to-r from-primary-500 to-primary-600 bg-clip-text text-transparent">
              Ads Ativos
            </span>
            <span className="block text-xs text-gray-500 mt-1 font-medium">ERP</span>
          </Link>
          <p className="text-gray-500 dark:text-gray-400">ERP – Acesse sua conta</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm border border-red-100">
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
