# Segurança e Proteção de Dados — Produção e Estoque

> Políticas para nunca perder contas de produção/estoque (podem ficar anos no sistema)

## 1. Soft Delete (Regra de Ouro)

**Nunca apagar fisicamente** registros de:
- `StockAccount`
- `StockAccountCredential`
- `ProductionG2`
- `ProductionAccount`

Usar **soft delete**: definir `deletedAt = now()` em vez de `DELETE`. Dados permanecem no banco para auditoria e recuperação.

### Modelos com deletedAt
| Modelo | Campo | Comportamento |
|--------|-------|---------------|
| StockAccount | deletedAt | null = ativo. Preenchido = excluído (não aparece em listagens) |
| StockAccountCredential | deletedAt | idem |
| ProductionG2 | deletedAt | idem |
| ProductionAccount | deletedAt | idem |

### Filtro em queries
Todas as consultas de leitura devem incluir `deletedAt: null` no `where` para não retornar registros excluídos.

---

## 2. Backup Automático

### API de Backup
```
GET /api/admin/backup
```
- **Auth:** ADMIN (ou `?secret=CRON_SECRET` para cron)
- **Retorno:** JSON com todos os dados críticos (contas, credenciais, produção)
- **Rate limit:** 2x/hora para acesso manual

### Agendamento (cron)
```bash
# Diário às 3h
0 3 * * * curl -H "Authorization: Bearer TOKEN" "https://seu-erp.com/api/admin/backup?secret=CRON_SECRET" -o /backups/erp-$(date +\%Y-\%m-\%d).json
```

### Recomendações
- Armazenar backups em local **diferente** do servidor (S3, outro datacenter)
- Retenção: mínimo 30 dias, ideal 1 ano para contas antigas
- Testar restauração periodicamente

---

## 3. Banco de Dados (PostgreSQL)

### Backups nativos
- Habilitar **WAL archiving** ou **continuous backup** (ex: Neon, Supabase, RDS)
- Point-in-time recovery (PITR) para restauração em caso de corrupção
- Replicação para standby (alta disponibilidade)

### Exemplo (pg_dump diário)
```bash
pg_dump $DATABASE_URL -Fc -f backup-$(date +%Y-%m-%d).dump
```

---

## 4. Criptografia

- **Em repouso:** `passwordPlain`, `passwordEncrypted`, `twoFaSecret` criptografados com AES-256-GCM
- **Chave:** `ENCRYPTION_KEY` no `.env` (32 bytes hex)
- **Backup:** O JSON de backup contém credenciais descriptografadas — armazenar em local seguro e criptografado (ex: volume criptografado, S3 com encryption)

---

## 5. Auditoria

- `AuditLog` registra: upload, export, backup, alterações críticas
- Campos `oldValue` e `newValue` para rastrear mudanças
- Logs não editáveis (governança)

---

## 6. Recuperação de Desastre

1. **Perda de registros:** Restaurar do backup JSON ou pg_dump
2. **Corrupção:** Restaurar PITR do PostgreSQL
3. **Ransomware:** Ter backups off-site e imutáveis (ex: S3 Object Lock)

---

## 7. Checklist de Operação

- [ ] Backup diário via API ou pg_dump
- [ ] Backups armazenados off-site
- [ ] ENCRYPTION_KEY definida e guardada em cofre
- [ ] Teste de restauração anual
- [ ] Nenhum endpoint DELETE para StockAccount / ProductionG2 / ProductionAccount
