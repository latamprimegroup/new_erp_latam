# Checklist de Deploy em Produção

## Antes de subir

### 1. Variáveis de ambiente
- [ ] `NEXTAUTH_URL` = URL final (ex: `https://erp.seudominio.com`)
- [ ] `NEXTAUTH_SECRET` = gerado com `openssl rand -base64 32`
- [ ] `DATABASE_URL` = com connection pooling (Neon, Supabase, RDS Proxy)
- [ ] `ENCRYPTION_KEY` = gerado com `openssl rand -hex 32`
- [ ] `CRON_SECRET` = para rotas de cron autenticadas

### 2. Segurança aplicada
- **Setup**: `/setup` bloqueado em produção (use `ALLOW_SETUP=1` só em emergência)
- **Login**: rate limit de 5 tentativas/minuto por IP (anti brute force)
- **Headers**: X-Frame-Options, CSP, X-Content-Type-Options
- **PWA**: habilitado em produção

### 3. Banco de dados
- [ ] Migrations executadas
- [ ] Backup automático configurado
- [ ] Connection pooling ativo

## Opcional (escala)

### Rate limit com Redis
Em múltiplas instâncias, o rate limit em memória não é compartilhado. Para Redis:
```bash
npm install @upstash/ratelimit @upstash/redis
```
Configure `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` e adapte `src/lib/rate-limit-login.ts`.

### Monitoramento
- Sentry para erros
- Health check em `/api/health` para load balancer
