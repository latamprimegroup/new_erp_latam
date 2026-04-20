import { cookies } from 'next/headers'
import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { ShellEnterprise } from '@/components/ShellEnterprise'
import { DashboardI18nProvider } from '@/contexts/DashboardI18nContext'
import { LOCALE_COOKIE, normalizeLocale } from '@/lib/i18n-config'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login?callbackUrl=/dashboard')

  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value
  const sessionLang = session.user.languageCode
  const initialLocale =
    session.user.role === 'CLIENT'
      ? normalizeLocale(sessionLang || cookieLocale || 'pt-BR')
      : 'pt-BR'

  return (
    <DashboardI18nProvider initialLocale={initialLocale} userRole={session.user.role ?? ''}>
      <ShellEnterprise user={session.user}>
        {children}
      </ShellEnterprise>
    </DashboardI18nProvider>
  )
}
