# Como publicar o ERP no domínio e ver online

Três caminhos comuns: **Vercel + banco na nuvem** (mais fácil), **Railway** (app + banco juntos) ou **VPS** (mais controle).

---

## Opção 1: Vercel + banco na nuvem (recomendado para começar)

O app Next.js sobe na **Vercel**; o banco fica em um serviço separado.

### 1. Banco de dados na nuvem

Escolha um e crie um banco PostgreSQL:

| Serviço | Plano grátis | Site |
|---------|----------------|------|
| **Neon** | Sim | [neon.tech](https://neon.tech) |
| **Supabase** | Sim | [supabase.com](https://supabase.com) |
| **Railway** | Créditos grátis | [railway.app](https://railway.app) |

Depois de criar o projeto e o banco, copie a **connection string**.

**Connection pooling (recomendado para Vercel + escala):**

- **Neon:** Use a URL **pooled** (porta 5432 com `?pgbouncer=true` ou a connection string "Pooled" no dashboard). A URL direta serve para migrações.
- **Supabase:** Use a URL do **Connection Pooler** (porta 6543) para `DATABASE_URL`. A URL direta (porta 5432) vai em `DIRECT_DATABASE_URL` para `prisma migrate`/`db push`.
- **Railway:** A URL padrão já funciona. Se oferecer pooler, prefira-o para produção.

Configure no `.env`:
```
DATABASE_URL="postgresql://...?sslmode=require"        # URL com pool (para o app)
DIRECT_DATABASE_URL="postgresql://...?sslmode=require" # URL direta (para migrações). Se não houver pooler, use o mesmo valor do DATABASE_URL
```

### 2. Subir o código na Vercel

1. Crie conta em [vercel.com](https://vercel.com).
2. No GitHub: faça upload do projeto (crie um repositório e dê push no código).
3. Na Vercel: **Add New** → **Project** → importe o repositório do GitHub.
4. Em **Environment Variables** (Configurações do projeto) adicione:

   | Nome | Valor |
   |------|--------|
   | `DATABASE_URL` | A connection string com pool (ou direta se não houver pooler) |
   | `DIRECT_DATABASE_URL` | URL direta do banco (pode ser igual ao `DATABASE_URL` em setups simples) |
   | `NEXTAUTH_URL` | `https://seu-projeto.vercel.app` (troque pelo domínio que a Vercel te der) |
   | `NEXTAUTH_SECRET` | Uma senha forte (ex: gere em [generate-secret.vercel.app](https://generate-secret.vercel.app)) |

5. **Deploy**. A Vercel vai rodar `npm run build` e publicar.

### 3. Ver online e usar seu domínio

- **Ver online:** use o link que a Vercel mostra (ex: `https://erp-ads-ativos.vercel.app`).
- **Domínio próprio:** no projeto na Vercel → **Settings** → **Domains** → adicione seu domínio (ex: `erp.seudominio.com.br`) e siga as instruções de DNS.

### 4. Rodar migrações no banco (uma vez)

O build na Vercel não executa `prisma db push`. Uma vez só, na sua máquina (com o mesmo `DATABASE_URL` que está na Vercel):

```bash
cd erp-ads-ativos
# No .env local, use o mesmo DATABASE_URL do banco na nuvem
npm run db:push
npm run db:seed
```

Depois disso, o app online já usa as tabelas e usuários de teste.

---

## Opção 2: Railway (app + PostgreSQL no mesmo lugar)

1. Crie conta em [railway.app](https://railway.app).
2. **New Project** → **Deploy from GitHub** (conecte o repositório).
3. No mesmo projeto: **New** → **Database** → **PostgreSQL**. A Railway gera um `DATABASE_URL` automaticamente.
4. No serviço do **app** (não no banco): **Variables** → **Add Variable** → **Reference** e escolha a variável do Postgres (ex: `DATABASE_URL`). Adicione também:
   - `NEXTAUTH_URL` = `https://seu-app.railway.app` (ou seu domínio)
   - `NEXTAUTH_SECRET` = uma chave secreta forte
5. **Deploy**. Depois, no **Settings** do serviço do app, em **Deploy**, configure o comando de build se precisar (Next.js costuma ser detectado).
6. Para criar as tabelas: no serviço do app, abra **Settings** → **Deploy** e em "Build Command" pode usar o que a Railway sugerir; para rodar migrações uma vez, use o **Railway CLI** ou um job que rode `npx prisma db push`.

Domínio: **Settings** do serviço → **Domains** → adicione o domínio padrão da Railway ou o seu próprio.

---

## Opção 3: Domínio próprio sem Vercel (VPS)

Você contrata um **servidor (VPS)** e aponta seu **domínio** para o IP dele. Tudo roda na sua máquina: app + banco.

### Passo 1: Contratar um VPS

| Provedor    | Exemplo de preço | Observação        |
|------------|-------------------|-------------------|
| DigitalOcean | ~US$ 6/mês      | Droplet básico    |
| Contabo    | ~€ 5/mês         | Bom custo-benefício |
| Hostinger VPS | R$ 20–40/mês  | Suporte em PT     |
| AWS Lightsail | ~US$ 5/mês    | Escala fácil      |

Crie um servidor **Ubuntu 22.04** e anote o **IP público** (ex: `165.232.123.45`).

### Passo 2: Conectar no servidor e instalar o necessário

No seu computador, conecte por SSH (troque pelo seu IP e usuário):

```bash
ssh root@165.232.123.45
```

No servidor, rode:

```bash
# Atualizar sistema
apt update && apt upgrade -y

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# PostgreSQL
apt install -y postgresql postgresql-contrib

# Nginx (proxy reverso + HTTPS)
apt install -y nginx certbot python3-certbot-nginx

# PM2 (manter o app rodando)
npm install -g pm2
```

### Passo 3: Configurar o PostgreSQL

```bash
sudo -u postgres psql -c "CREATE USER erp_user WITH PASSWORD 'sua_senha_forte';"
sudo -u postgres psql -c "CREATE DATABASE erp_ads_ativos OWNER erp_user;"
```

Connection string que você vai usar:  
`postgresql://erp_user:sua_senha_forte@localhost:5432/erp_ads_ativos`

### Passo 4: Enviar o projeto para o servidor

**No seu PC** (na pasta do projeto):

```bash
# Se ainda não tiver repositório Git
git init
git add .
git commit -m "Deploy"

# Enviar para o servidor (troque pelo seu IP)
scp -r . root@165.232.123.45:/var/www/erp-ads-ativos
```

Ou clone direto no servidor se o código estiver no GitHub:

```bash
# No servidor
cd /var/www
git clone https://github.com/SEU_USUARIO/erp-ads-ativos.git
cd erp-ads-ativos
```

### Passo 5: Configurar o app no servidor

```bash
cd /var/www/erp-ads-ativos

# Criar o .env (use seu domínio real)
nano .env
```

Conteúdo do `.env` (ajuste o domínio e a senha):

```env
DATABASE_URL="postgresql://erp_user:sua_senha_forte@localhost:5432/erp_ads_ativos"
NEXTAUTH_URL="https://erp.seudominio.com.br"
NEXTAUTH_SECRET="gere-uma-chave-longa-aleatoria-aqui"
```

Salve (Ctrl+O, Enter, Ctrl+X no nano).

```bash
npm install
npx prisma generate
npx prisma db push
npx prisma db seed   # usuários de teste
npm run build
```

Subir o app com PM2 (e manter rodando):

```bash
pm2 start npm --name "erp" -- start
pm2 save
pm2 startup   # segue a instrução que aparecer
```

O Next.js estará rodando na porta **3000**.

### Passo 6: Apontar seu domínio no DNS

No painel onde você comprou o domínio (Registro.br, GoDaddy, Cloudflare, etc.):

- Crie um registro **A** (ou **A/AAAA**):
  - **Nome/host:** `erp` (ou deixe em branco para usar `seudominio.com.br`)
  - **Valor/aponta para:** IP do seu VPS (ex: `165.232.123.45`)
  - TTL: 300 ou 3600

Assim, `erp.seudominio.com.br` (ou `seudominio.com.br`) passará a apontar para o servidor.

### Passo 7: Nginx + HTTPS (SSL)

No servidor:

```bash
nano /etc/nginx/sites-available/erp
```

Cole (troque `erp.seudominio.com.br` pelo seu domínio):

```nginx
server {
    listen 80;
    server_name erp.seudominio.com.br;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Ative o site e teste:

```bash
ln -s /etc/nginx/sites-available/erp /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

Gerar certificado HTTPS (Let’s Encrypt):

```bash
certbot --nginx -d erp.seudominio.com.br
```

Siga as perguntas (e-mail, aceitar termos). O Certbot ajusta o Nginx para HTTPS.

### Passo 8: Ajustar NEXTAUTH_URL

No `.env` do servidor, `NEXTAUTH_URL` deve ser exatamente a URL que as pessoas usam:

```env
NEXTAUTH_URL="https://erp.seudominio.com.br"
```

Reinicie o app:

```bash
pm2 restart erp
```

---

**Resumo domínio próprio sem Vercel:** você usa um VPS (servidor seu), instala Node + PostgreSQL + Nginx, sobe o projeto, configura `.env` e PM2, aponta o DNS do domínio para o IP do servidor e usa Nginx + Certbot para HTTPS. O ERP fica em `https://erp.seudominio.com.br` (ou no domínio que configurou).

---

## Checklist rápido (Vercel)

- [ ] Banco PostgreSQL criado (Neon/Supabase/Railway) e URLs copiadas (`DATABASE_URL` e `DIRECT_DATABASE_URL` — use a mesma URL nos dois se não houver pooler)
- [ ] Projeto no GitHub
- [ ] Projeto importado na Vercel
- [ ] Variáveis `DATABASE_URL`, `NEXTAUTH_URL` e `NEXTAUTH_SECRET` configuradas
- [ ] Deploy feito
- [ ] Na sua máquina (com mesmo `DATABASE_URL`): `npm run db:push` e `npm run db:seed`
- [ ] Acessar o link da Vercel (ou seu domínio) e testar o login

Depois disso o ERP fica **publicado no domínio** e você consegue **ver e usar online**.

---

## Escala e confiabilidade (faturamento alto, muitos colaboradores)

- **Connection pooling:** Use `DATABASE_URL` com pool (Neon pooled, Supabase pooler porta 6543) e `DIRECT_DATABASE_URL` para migrações. Evita esgotar conexões em serverless.
- **Rate limiting:** Já aplicado em registro, vendas, financeiro, produção e estoque (por usuário autenticado). Em produção com várias instâncias, considere Redis (@upstash/ratelimit) em vez do store em memória.
- **Digest diário:** Enviado em lotes paralelos (8 usuários por vez). O cron `/api/cron/daily-digest` roda às 08:00 (ver `vercel.json`). Protegido por `CRON_SECRET`.
