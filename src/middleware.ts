import { withAuth } from 'next-auth/middleware'
import { NextFetchEvent, NextResponse } from 'next/server'
import { checkLoginRateLimit } from '@/lib/rate-limit-login'

// Rotas públicas
const PUBLIC_PATHS = ['/login', '/cadastro', '/recuperar-senha', '/redefinir-senha', '/']

// Mapeamento: path pattern → roles permitidas
const ROUTE_ROLES: Record<string, string[]> = {
  '/dashboard/producao': ['ADMIN', 'PRODUCER'],
  '/dashboard/producao-g2': ['ADMIN', 'PRODUCER', 'FINANCE'],
  '/dashboard/producao/metrics': ['ADMIN', 'PRODUCER'],
  '/dashboard/producao/saldo': ['ADMIN', 'PRODUCER'],
  '/dashboard/estoque': ['ADMIN', 'FINANCE'],
  '/dashboard/base': ['ADMIN'],
  '/dashboard/vendas': ['ADMIN', 'COMMERCIAL'],
  '/dashboard/entregas': ['ADMIN', 'DELIVERER'],
  '/dashboard/entregas-grupos': ['ADMIN', 'DELIVERER', 'COMMERCIAL'],
  '/dashboard/financeiro': ['ADMIN', 'FINANCE'],
  '/dashboard/saques': ['ADMIN', 'FINANCE'],
  '/dashboard/metas': ['ADMIN', 'PRODUCER'],
  '/dashboard/relatorios': ['ADMIN', 'COMMERCIAL'],
  '/dashboard/admin': ['ADMIN'],
  '/dashboard/admin/config': ['ADMIN'],
  '/dashboard/admin/contas-ofertadas': ['ADMIN'],
  '/dashboard/admin/contestacoes': ['ADMIN', 'COMMERCIAL'],
  '/dashboard/admin/tickets': ['ADMIN', 'COMMERCIAL'],
  '/dashboard/admin/solicitacoes': ['ADMIN', 'COMMERCIAL'],
  '/dashboard/admin/contas-entregues': ['ADMIN', 'COMMERCIAL'],
  '/dashboard/admin/black': ['ADMIN'],
  '/dashboard/admin/fornecedores': ['ADMIN'],
  '/dashboard/admin/fechamento-producao': ['ADMIN'],
  '/dashboard/admin/usuarios': ['ADMIN'],
  '/dashboard': ['ADMIN', 'PRODUCER', 'DELIVERER', 'FINANCE', 'COMMERCIAL'],
  '/dashboard/cliente': ['CLIENT'],
  '/dashboard/gestor': ['MANAGER'],
  '/dashboard/plugplay': ['PLUG_PLAY'],
}

function getRolesForPath(pathname: string): string[] | null {
  if (ROUTE_ROLES[pathname]) return ROUTE_ROLES[pathname]
  const segments = pathname.split('/').filter(Boolean)
  for (let i = segments.length; i >= 2; i--) {
    const path = '/' + segments.slice(0, i).join('/')
    if (ROUTE_ROLES[path]) return ROUTE_ROLES[path]
  }
  return null
}

const dashboardAuth = withAuth(
  function middleware(req) {
    const pathname = req.nextUrl.pathname

    if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
      return NextResponse.next()
    }

    if (pathname.startsWith('/dashboard')) {
      const roles = getRolesForPath(pathname)
      const userRole = (req.nextauth.token?.role as string) || ''

      if (roles && !roles.includes(userRole)) {
        if (userRole === 'CLIENT') return NextResponse.redirect(new URL('/dashboard/cliente', req.url))
        if (userRole === 'MANAGER') return NextResponse.redirect(new URL('/dashboard/gestor', req.url))
        if (userRole === 'PLUG_PLAY') return NextResponse.redirect(new URL('/dashboard/plugplay', req.url))
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }
    }

    return NextResponse.next()
  },
  { callbacks: { authorized: ({ token }) => !!token } }
)

export default function middleware(req: Request, event: NextFetchEvent) {
  const url = new URL(req.url)
  const pathname = url.pathname

  // 1. Bloquear /setup em produção (ALLOW_SETUP=1 para liberar em emergência)
  if (pathname === '/setup') {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SETUP !== '1') {
      return NextResponse.redirect(new URL('/login', req.url))
    }
    return NextResponse.next()
  }

  // 2. Rate limit no login (anti brute force) — 5 tentativas/minuto por IP
  if (pathname === '/api/auth/callback/credentials' && req.method === 'POST') {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown'
    const rl = checkLoginRateLimit(ip)
    if (!rl.success) {
      return new NextResponse(
        JSON.stringify({ error: 'Muitas tentativas. Aguarde 1 minuto e tente novamente.' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }

  // 3. Dashboard: exigir autenticação
  if (pathname.startsWith('/dashboard')) {
    return dashboardAuth(req as Parameters<typeof dashboardAuth>[0], event)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/auth/callback/credentials', '/setup'],
}
