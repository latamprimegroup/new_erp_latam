'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ThemeToggle } from '@/components/ThemeToggle'

/**
 * Página de setup inicial — cria primeiro administrador
 * Só exibida quando não existe nenhum admin no sistema
 */
export default function SetupPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showMigrate, setShowMigrate] = useState(false)
  const [migrating, setMigrating] = useState(false)

  useEffect(() => {
    fetch('/api/admin/deploy/check')
      .then((r) => r.json())
      .then((d) => {
        if (d.productionActive) {
          router.replace('/login')
          return
        }
        const needsSeed = d.nextStep === 'DB_SEED'
        const needsMigrate = d.nextStep === 'DB_MIGRATE'
        if (needsMigrate && !d.canDeploy) {
          setError('Configure as variáveis de ambiente (DATABASE_URL, etc.) e tente novamente.')
          setReady(false)
        } else if (needsMigrate && d.canDeploy) {
          setError('')
          setReady(true)
          setShowMigrate(true)
        } else {
          setReady(needsSeed)
        }
      })
      .catch(() => setError('Não foi possível verificar o sistema.'))
      .finally(() => setLoading(false))
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }
    if (password.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/deploy/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (res.ok) {
        router.replace('/login')
        router.refresh()
      } else {
        setError(data.message || 'Erro ao criar administrador')
      }
    } catch {
      setError('Erro ao criar administrador')
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-ads-offwhite dark:bg-ads-navy relative">
        <div className="absolute top-4 right-4"><ThemeToggle /></div>
        <div className="card w-full max-w-md animate-pulse mt-8">
          <div className="h-6 bg-gray-200 rounded w-2/3 mb-4" />
          <div className="h-32 bg-gray-100 rounded" />
        </div>
      </main>
    )
  }

  if (!ready) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-ads-offwhite dark:bg-ads-navy relative">
        <div className="absolute top-4 right-4"><ThemeToggle /></div>
        <div className="card w-full max-w-md mt-8">
          <h1 className="text-xl font-bold text-slate-800 dark:text-gray-100 mb-2">Configuração necessária</h1>
          <p className="text-slate-600 dark:text-gray-300 mb-4">{error}</p>
          <Link href="/login" className="link-primary">
            Voltar ao login
          </Link>
        </div>
      </main>
    )
  }

  async function runMigrate() {
    setMigrating(true)
    setError('')
    try {
      const res = await fetch('/api/admin/deploy/migrate', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        const checkRes = await fetch('/api/admin/deploy/check')
        const check = await checkRes.json()
        setShowMigrate(check.nextStep !== 'DB_MIGRATE')
        setReady(check.nextStep === 'DB_SEED' || check.productionActive)
      } else {
        setError(data.message || 'Erro ao criar banco')
      }
    } catch {
      setError('Erro ao criar banco de dados')
    }
    setMigrating(false)
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-ads-offwhite dark:bg-ads-navy relative">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <div className="card w-full max-w-md animate-scale-in mt-8">
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex flex-col items-center">
            <Image src="/logos/ads-azul-ativos-branco.png" alt="ADS Ativos" width={140} height={44} className="h-11 w-auto dark:hidden" priority />
            <Image src="/logos/ads-branco-ativos-branco.png" alt="ADS Ativos" width={140} height={44} className="h-11 w-auto hidden dark:block" priority />
          </Link>
        </div>
        {showMigrate ? (
          <>
            <h1 className="text-xl font-bold text-slate-800 dark:text-gray-100 mb-1">Criar banco de dados</h1>
            <p className="text-slate-600 dark:text-gray-300 text-sm mb-6">
              Clique no botão para criar as tabelas do sistema.
            </p>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}
            <button
              onClick={runMigrate}
              disabled={migrating}
              className="btn-primary w-full py-4 text-lg"
            >
              {migrating ? 'Criando banco…' : 'Criar banco de dados'}
            </button>
            <p className="mt-4 text-center text-sm text-slate-500 dark:text-gray-400">
              Depois de criar o banco, recarregue a página.
            </p>
          </>
        ) : (
          <>
        <h1 className="text-xl font-bold text-slate-800 dark:text-gray-100 mb-1">Criar administrador</h1>
        <p className="text-slate-600 dark:text-gray-300 text-sm mb-6">
          Defina o e-mail e senha do primeiro usuário administrador.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="admin@empresa.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">Senha (mín. 8 caracteres)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="••••••••"
              required
              minLength={8}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">Confirmar senha</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="input-field"
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full py-3"
          >
            {submitting ? 'Criando…' : 'Criar administrador'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-gray-400">
          <Link href="/login" className="link-primary">
            Já tem conta? Faça login
          </Link>
        </p>
          </>
        )}
      </div>
    </main>
  )
}
