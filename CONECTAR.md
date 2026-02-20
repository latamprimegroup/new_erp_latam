# Conectar e rodar o ERP Ads Ativos

## 1. Ajustar o `.env`

O arquivo `.env` já foi criado. **Ajuste a linha do banco** se o seu PostgreSQL usar outro usuário/senha/porta:

```env
DATABASE_URL="postgresql://USUARIO:SENHA@localhost:5432/erp_ads_ativos"
```

Exemplos:
- Usuário `postgres`, senha `postgres`: `postgresql://postgres:postgres@localhost:5432/erp_ads_ativos`
- Porta 5433: `postgresql://postgres:postgres@localhost:5433/erp_ads_ativos`

## 2. Criar o banco (se ainda não existir)

No PostgreSQL:

```bash
createdb erp_ads_ativos
```

Ou no `psql`:

```sql
CREATE DATABASE erp_ads_ativos;
```

## 3. Comandos no projeto

No terminal, na pasta do projeto:

```bash
cd /Users/tiagoalfredo/erp-ads-ativos

# Instalar dependências
npm install

# Gerar cliente Prisma e criar tabelas no banco
npm run db:generate
npm run db:push

# (Opcional) Criar usuários de teste
npm run db:seed

# Subir o servidor
npm run dev
```

## 4. Acessar

- **App:** http://localhost:3000  
- **Login de teste (após seed):**
  - Admin: `admin@adsativos.com` / `admin123`
  - Cliente: `cliente@adsativos.com` / `cliente123`
  - Produtor: `produtor@adsativos.com` / `produtor123`
  - Comercial: `comercial@adsativos.com` / `comercial123`
  - Entregador: `entregador@adsativos.com` / `entregador123`

## 5. Se der erro de conexão com o banco

- Confirme que o PostgreSQL está rodando: `pg_isready -h localhost -p 5432`
- Confirme usuário, senha e nome do banco no `.env`
- Se usar Docker: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:15`
