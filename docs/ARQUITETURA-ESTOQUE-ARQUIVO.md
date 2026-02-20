# Arquitetura: Módulo Estoque com Arquivo de Contas

> Design como operação de ativos de alta escala — armazenamento centralizado, seguro e venda imediata

## 1. Visão Estratégica

**Objetivo:** Substituir AdsPower e ferramentas externas por um **cofre central** no ERP, onde:

- Contas são armazenadas de forma segura (criptografia em repouso)
- Upload em lote (CSV/JSON) para ingesta rápida
- Download para backup, migração ou entrega ao cliente
- Venda imediata: contas disponíveis são consultáveis e atribuíveis a pedidos em segundos

**Referência:** Operações como MultiLogin, GoLogin, Bright Data — ativos em base de dados, acesso controlado, auditoria completa.

---

## 2. Modelo de Dados

### 2.1 Extensão do StockAccount

| Campo Novo       | Tipo     | Descrição                                           |
|------------------|----------|-----------------------------------------------------|
| `archivedAt`     | DateTime?| Conta arquivada (vault) vs pronta para venda        |
| `source`         | String?  | ORIGIN: `PRODUCTION`, `PRODUCTION_G2`, `IMPORT`, `MANUAL` |

- **archivedAt = null** → conta disponível para venda (status AVAILABLE)
- **archivedAt preenchido** → conta em arquivo/vault (não listada para venda até desarquivar)

### 2.2 StockAccountCredential (novo)

Credenciais de acesso vinculadas a qualquer StockAccount (importação manual ou migração).

| Campo             | Tipo    | Descrição                                |
|-------------------|---------|------------------------------------------|
| stockAccountId    | FK      | Conta de estoque                         |
| email             | String? | Email principal (criptografado)          |
| passwordEncrypted | Text?   | Senha (criptografado AES-256-GCM)        |
| recoveryEmail     | String? | Email recuperação                        |
| twoFaSecret       | Text?   | 2FA TOTP (criptografado)                 |
| twoFaSms          | String? | 2FA SMS                                  |
| googleAdsCustomerId | String?| ID conta Google Ads (123-456-7890)       |
| metaBusinessId    | String? | ID Meta Business                         |
| proxyConfig       | Json?   | Config proxy (host, port, user, pass)    |
| notes             | Text?   | Observações                              |

**Regra:** StockAccount pode ter credenciais em ProductionG2 (via relação) OU em StockAccountCredential (import direto).

### 2.3 AccountArchiveBatch (upload)

| Campo        | Tipo   | Descrição                        |
|--------------|--------|----------------------------------|
| id           | CUID   |                                  |
| filename     | String | Nome do arquivo importado        |
| format       | String | CSV, JSON                        |
| uploadedById | FK     | Usuário que fez upload           |
| totalRows    | Int    | Linhas no arquivo                |
| imported     | Int    | Importadas com sucesso           |
| failed       | Int    | Falhas                           |
| duplicates   | Int    | Duplicados (já existiam)         |
| createdAt    | DateTime |                                  |

---

## 3. Formatos de Arquivo

### 3.1 CSV (upload)

```csv
platform,type,email,password,recovery_email,two_fa,google_ads_id,country,notes
GOOGLE_ADS,G2,user@gmail.com,senha123,recovery@mail.com,,123-456-7890,BR,
META_ADS,PAGE,page@meta.com,senha,,,page_id,MX,
```

- Encoding: UTF-8
- Separador: `,` ou `;`
- Campos sensíveis: `password`, `two_fa` → criptografados antes de gravar

### 3.2 JSON (upload e download)

```json
{
  "accounts": [
    {
      "platform": "GOOGLE_ADS",
      "type": "G2",
      "email": "user@gmail.com",
      "password": "***",
      "recoveryEmail": "rec@mail.com",
      "googleAdsCustomerId": "123-456-7890",
      "country": "BR"
    }
  ]
}
```

### 3.3 Export para AdsPower / MultiLogin

Formato compatível com import em ferramentas de perfil de navegador (quando aplicável):

```json
{
  "name": "ERP Export",
  "profiles": [
    {
      "id": "cuid-erp",
      "name": "Google G2 - 123-456-7890",
      "login": "user@gmail.com",
      "password": "***",
      "platform": "google"
    }
  ]
}
```

---

## 4. APIs

| Método | Rota | Descrição | Auth |
|--------|------|-----------|------|
| POST | /api/estoque/archive/upload | Upload CSV/JSON em lote | ADMIN, FINANCE |
| GET | /api/estoque/archive/export | Download filtrado (CSV/JSON) | ADMIN, FINANCE |
| PATCH | /api/estoque/[id]/archive | Arquivar conta (não vender) | ADMIN, FINANCE |
| PATCH | /api/estoque/[id]/unarchive | Desarquivar (liberar para venda) | ADMIN, FINANCE |
| GET | /api/estoque/archive/batches | Histórico de uploads | ADMIN, FINANCE |

### Segurança em Download

- Credenciais sensíveis: só retornadas para ADMIN/FINANCE autenticados
- AuditLog: `account_credentials_exported` com userId, accountIds, count
- Rate limit: 10 exportações/minuto por usuário

---

## 5. Segurança (Padrão Enterprise)

| Camada | Medida |
|--------|--------|
| **Repouso** | AES-256-GCM para password, 2FA, proxy |
| **Trânsito** | HTTPS (TLS) |
| **Acesso** | RBAC: ADMIN, FINANCE para credenciais |
| **Auditoria** | AuditLog em upload, download, arquivar |
| **Mascaramento** | GET sem credenciais; endpoint dedicado para revelar |
| **Backup** | Export criptografado opcional (chave separada) |

---

## 6. Fluxo de Venda Imediata

1. Conta importada ou vinda da produção → status AVAILABLE, archivedAt = null
2. Comercial/Vendas consulta estoque (já existente) com filtros
3. Pedido criado → contas reservadas (status IN_USE ou lógica de Order)
4. Entrega: credenciais expostas ao cliente via canal seguro (ou export)

---

## 7. Comparativo: ERP vs AdsPower

| Aspecto | AdsPower | ERP (este módulo) |
|---------|----------|-------------------|
| Armazenamento | Local / cloud deles | Seu banco, seu controle |
| Integração vendas | Manual | Direta (estoque ↔ pedido) |
| Auditoria | Limitada | Completa (quem, quando, o quê) |
| Backup | Export manual | Upload/Download via API |
| Criptografia | Depende do provedor | Você controla (ENCRYPTION_KEY) |
| Venda | Copiar/colar | Consulta e atribuição imediata |

---

## 8. Implementação

**Fase 1 (MVP) — Implementado:**
- Schema: StockAccountCredential, AccountArchiveBatch, campos em StockAccount
- Upload CSV/JSON
- Download JSON (filtros básicos)
- Arquivar/desarquivar

**Fase 2:**
- Formato AdsPower no export
- Proxy config no credential
- Dashboard de batches de upload

**Fase 3:**
- Integração direta com pedido (reserva automática)
- Notificações de estoque baixo
