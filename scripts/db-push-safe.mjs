/**
 * db-push-safe.mjs
 * Executa `prisma db push` apenas se DATABASE_URL estiver disponível.
 * Usado no build da Vercel — não falha o build se a variável não estiver definida.
 */
import { execSync } from 'child_process'

const url = process.env.DATABASE_URL

if (!url || url.startsWith('mysql://ci:')) {
  console.log('[db-push-safe] DATABASE_URL não configurada ou é placeholder CI — pulando prisma db push.')
  process.exit(0)
}

console.log('[db-push-safe] DATABASE_URL detectada — executando prisma db push...')

try {
  execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' })
  console.log('[db-push-safe] Schema sincronizado com sucesso.')
} catch (err) {
  console.error('[db-push-safe] AVISO: prisma db push falhou:', err.message)
  console.error('[db-push-safe] Build continua, mas verifique o schema no banco de dados.')
  // Não faz process.exit(1) — build não é interrompido
}
