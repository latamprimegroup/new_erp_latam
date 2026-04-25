# Certificados mTLS — Banco Inter

Coloque aqui os certificados gerados no Portal Inter Empresas:

- `inter.crt` — Certificado público (arquivo .crt)
- `inter.key` — Chave privada (arquivo .key)

**⚠️ IMPORTANTE:** Estes arquivos estão no `.gitignore` e **nunca serão enviados ao repositório**.

## Como obter os certificados

1. Acesse: Portal Inter Empresas → Configurações → API Banking → Certificados
2. Gere o par de certificados (ou faça upload do seu CSR)
3. Baixe os arquivos `.crt` e `.key`
4. Renomeie para `inter.crt` e `inter.key`
5. Coloque nesta pasta (`/certs/`)
6. Reinicie o servidor

## Alternativa (Variáveis de Ambiente)

Se preferir não usar arquivos, defina no `.env`:

```
INTER_CERT_CRT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
INTER_CERT_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

O sistema sempre prioriza os arquivos em `/certs/` sobre as variáveis de ambiente.
