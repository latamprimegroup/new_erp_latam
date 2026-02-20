'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ThemeToggle } from '@/components/ThemeToggle'

const STEPS = [
  { id: 1, title: 'E-mail' },
  { id: 2, title: 'Nome' },
  { id: 3, title: 'Senha' },
  { id: 4, title: 'WhatsApp' },
  { id: 5, title: 'Foto' },
  { id: 6, title: 'Validação' },
  { id: 7, title: 'Concluído' },
]

export default function CadastroPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    email: '',
    name: '',
    password: '',
    confirmPassword: '',
    whatsapp: '',
    photo: null as File | null,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function updateForm(key: string, value: string | File | null) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setError('')
  }

  function validateStep() {
    if (step === 1 && !form.email) {
      setError('Informe seu e-mail')
      return false
    }
    if (step === 2 && !form.name) {
      setError('Informe seu nome completo')
      return false
    }
    if (step === 3) {
      if (!form.password) {
        setError('Crie uma senha')
        return false
      }
      if (form.password.length < 8) {
        setError('A senha deve ter pelo menos 8 caracteres')
        return false
      }
      if (form.password !== form.confirmPassword) {
        setError('As senhas não coincidem')
        return false
      }
    }
    return true
  }

  async function handleNext() {
    if (!validateStep()) return

    if (step < 5) {
      setStep(step + 1)
    } else if (step === 5) {
      setLoading(true)
      setStep(6)
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: form.email,
            name: form.name,
            password: form.password,
            whatsapp: form.whatsapp || undefined,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar')
        await new Promise((r) => setTimeout(r, 800))
        setStep(7)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao cadastrar')
      } finally {
        setLoading(false)
      }
    } else if (step === 6) {
      setStep(7)
    } else {
      router.push('/login')
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#F8FAFC] dark:bg-ads-dark-bg relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="card w-full max-w-md mt-8">
        <div className="text-center mb-6">
          <Link href="/" className="inline-block mb-4">
            <span className="text-2xl font-bold bg-gradient-to-r from-primary-500 to-primary-600 bg-clip-text text-transparent">
              Ads Ativos
            </span>
          </Link>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            ERP — Passo {step} de 7 — {STEPS[step - 1].title}
          </p>
        </div>

        {step === 1 && (
          <>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Olá! Seja bem-vindo(a)! Informe seu e-mail para começar.
            </p>
            <input
              type="email"
              value={form.email}
              onChange={(e) => updateForm('email', e.target.value)}
              className="input-field"
              placeholder="seu@email.com"
              required
            />
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-gray-600 dark:text-gray-300 mb-4">Vamos começar. Qual o seu nome?</p>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateForm('name', e.target.value)}
              className="input-field"
              placeholder="Nome e sobrenome"
            />
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Proteja sua conta. Crie uma senha segura com pelo menos 8 dígitos.
            </p>
            <input
              type="password"
              value={form.password}
              onChange={(e) => updateForm('password', e.target.value)}
              className="input-field mb-3"
              placeholder="Senha"
            />
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(e) => updateForm('confirmPassword', e.target.value)}
              className="input-field"
              placeholder="Confirme sua senha"
            />
          </>
        )}

        {step === 4 && (
          <>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Conecte-se com a gente! Informe seu WhatsApp para receber dicas,
              suporte e novidades.
            </p>
            <input
              type="tel"
              value={form.whatsapp}
              onChange={(e) => updateForm('whatsapp', e.target.value)}
              className="input-field"
              placeholder="(00) 00000-0000"
            />
          </>
        )}

        {step === 5 && (
          <>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Adicione uma foto. É opcional, mas personalize seu perfil.
            </p>
            <label className="block border-2 border-dashed border-gray-300 dark:border-white/20 rounded-lg p-8 text-center cursor-pointer hover:border-primary-600 transition-colors">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => updateForm('photo', e.target.files?.[0] ?? null)}
              />
              {form.photo ? form.photo.name : 'Escolher sua foto (máx 2MB)'}
            </label>
          </>
        )}

        {step === 6 && (
          <div className="text-center py-8">
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              {loading ? 'Validando seu cadastro...' : 'Validação concluída!'}
            </p>
            {loading && (
              <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
            )}
          </div>
        )}

        {step === 7 && (
          <div className="text-center py-4">
            <p className="text-lg font-semibold text-green-600 mb-2">
              Tudo certo, {form.name || 'Cliente'}!
            </p>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Agora você já pode contar com um time especializado e acessar as
              melhores contas do mercado digital.
            </p>
            <div className="space-y-3">
              <button onClick={handleNext} className="btn-primary w-full py-3">
                Acessar Sistema
              </button>
              <button className="btn-secondary w-full py-3">
                Entrar na Comunidade WhatsApp
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        {step < 7 && step !== 6 && (
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={() => setStep(Math.max(1, step - 1))}
              className="btn-secondary flex-1"
              disabled={step === 1}
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="btn-primary flex-1"
              disabled={loading}
            >
              Continuar
            </button>
          </div>
        )}

        {step <= 2 && (
          <p className="mt-6 text-center text-sm text-gray-500">
            Já possui uma conta?{' '}
            <Link href="/login" className="link-accent">
              Acessar Sistema
            </Link>
          </p>
        )}
      </div>
    </main>
  )
}
