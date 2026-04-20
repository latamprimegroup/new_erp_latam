import Link from 'next/link'
import Image from 'next/image'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function TermosPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-ads-offwhite dark:bg-ads-navy relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="card w-full max-w-lg mt-8 text-left">
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex flex-col items-center mb-4">
            <Image
              src="/logos/ads-azul-ativos-branco.png"
              alt="ADS Ativos"
              width={140}
              height={44}
              className="h-11 w-auto dark:hidden"
              priority
            />
            <Image
              src="/logos/ads-branco-ativos-branco.png"
              alt="ADS Ativos"
              width={140}
              height={44}
              className="h-11 w-auto hidden dark:block"
              priority
            />
          </Link>
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Termos de uso
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
          Texto legal definitivo deve ser fornecido pela assessoria jurídica. Esta página
          confirma o compromisso do uso da plataforma Ads Ativos ERP.
        </p>
        <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-300 space-y-2 mb-8">
          <li>Uso autorizado apenas para contas cadastradas e perfis definidos pelo administrador.</li>
          <li>Proibido compartilhar credenciais ou dados sensíveis de terceiros sem autorização.</li>
          <li>O sistema pode ser atualizado; recomenda-se revisar estes termos periodicamente.</li>
        </ul>
        <p className="text-center">
          <Link href="/login" className="link-accent text-sm">
            Voltar ao login
          </Link>
        </p>
      </div>
    </main>
  )
}
