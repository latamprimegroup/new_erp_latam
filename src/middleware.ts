import { withAuth } from 'next-auth/middleware'
import { NextFetchEvent, NextResponse } from 'next/server'
import { checkLoginRateLimit } from '@/lib/rate-limit-login'

// Rotas públicas
const PUBLIC_PATHS = ['/login', '/cadastro', '/recuperar-senha', '/redefinir-senha', '/']

// Mapeamento: path pattern → roles permitidas
const ROUTE_ROLES: Record<string, string[]> = {
  '/dashboard/gerente-producao': ['ADMIN', 'PRODUCTION_MANAGER'],
  '/dashboard/ads-core': ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER'],
  '/dashboard/ads-core/gestao-contas': ['ADMIN', 'PRODUCTION_MANAGER'],
  '/dashboard/ads-core/bi': ['ADMIN', 'PRODUCTION_MANAGER'],
  '/dashboard/ads-core/atribuicao': ['ADMIN', 'PRODUCTION_MANAGER'],
  '/dashboard/ads-core/nichos': ['ADMIN', 'PRODUCTION_MANAGER'],
  '/dashboard/ads-core/demandas': ['ADMIN', 'PRODUCTION_MANAGER'],
  '/dashboard/ads-core/relatorios-producao': ['ADMIN', 'PRODUCTION_MANAGER'],
  '/dashboard/ads-core/rg-abastecimento': ['ADMIN', 'PRODUCTION_MANAGER'],
  '/dashboard/ads-core/inventario': ['ADMIN', 'PRODUCTION_MANAGER'],
  '/dashboard/producao': ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER'],
  '/dashboard/producao/conferencia': ['ADMIN', 'PRODUCTION_MANAGER'],
  '/dashboard/producao-g2': ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER'],
  '/dashboard/producao/metrics': ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER'],
  // Apenas quem tem saldo próprio (produtor) ou admin; alinhado a `producao/saldo/page.tsx`
  '/dashboard/producao/saldo': ['ADMIN', 'PRODUCER'],
  '/dashboard/producao/vault-earnings': ['ADMIN', 'PRODUCER'],
  '/dashboard/estoque': ['ADMIN', 'FINANCE'],
  '/dashboard/base': ['ADMIN', 'PRODUCTION_MANAGER'],
  '/dashboard/vendas': ['ADMIN', 'COMMERCIAL'],
  '/dashboard/commercial': ['ADMIN', 'COMMERCIAL'],
  '/dashboard/roi-crm': ['ADMIN', 'COMMERCIAL'],
  '/dashboard/entregas': ['ADMIN', 'DELIVERER'],
  '/dashboard/entregas-grupos': ['ADMIN', 'DELIVERER', 'COMMERCIAL', 'PRODUCER', 'PRODUCTION_MANAGER'],
  '/dashboard/logistica': ['ADMIN', 'DELIVERER', 'COMMERCIAL', 'PRODUCER', 'PRODUCTION_MANAGER'],
  '/dashboard/suporte': ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER', 'DELIVERER', 'COMMERCIAL'],
  '/dashboard/financeiro': ['ADMIN', 'FINANCE'],
  '/dashboard/saques': ['ADMIN', 'FINANCE'],
  '/dashboard/metas': ['ADMIN', 'PRODUCER'],
  '/dashboard/relatorios': ['ADMIN', 'COMMERCIAL', 'FINANCE'],
  // Mais permissivo que /dashboard/admin genérico: API e nav já incluem DELIVERER/COMMERCIAL
  '/dashboard/admin/delivery-dashboard': ['ADMIN', 'DELIVERER', 'COMMERCIAL'],
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
  '/dashboard': ['ADMIN', 'PRODUCER', 'DELIVERER', 'FINANCE', 'COMMERCIAL', 'PRODUCTION_MANAGER'],
  '/dashboard/cliente': ['CLIENT'],
  '/dashboard/gestor': ['MANAGER'],
  '/dashboard/plugplay': ['PLUG_PLAY'],
  '/dashboard/treinamento': ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER', 'FINANCE', 'DELIVERER', 'COMMERCIAL', 'MANAGER'],
  '/dashboard/area-cliente': ['CLIENT'],
  '/dashboard/ecosystem': ['CLIENT'],
  '/dashboard/gtm-conversao': [
    'ADMIN',
    'COMMERCIAL',
    'DELIVERER',
    'PRODUCER',
    'PRODUCTION_MANAGER',
    'MANAGER',
    'PLUG_PLAY',
  ],
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
        // FINANCE: redireciona para o hub financeiro em vez de rota genérica
        if (userRole === 'FINANCE') return NextResponse.redirect(new URL('/dashboard/financeiro', req.url))
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

  // 2. Rate limit no login (anti brute force) — por IP na rota de credenciais
  if (pathname === '/api/auth/callback/credentials' && req.method === 'POST') {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown'
    const rl = checkLoginRateLimit(ip)
    if (!rl.success) {
      const sec = rl.retryAfterSeconds ?? 60
      return new NextResponse(
        JSON.stringify({
          error: `Muitas tentativas de login neste IP. Aguarde ${sec} segundos e tente novamente.`,
          code: 'RATE_LIMIT',
          retryAfterSeconds: sec,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(sec),
          },
        }
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
