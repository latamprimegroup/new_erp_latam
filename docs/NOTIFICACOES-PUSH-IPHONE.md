# Notificações Push no iPhone

## Visão geral

O ERP envia notificações push para administradores nos seguintes eventos:

| Evento | Mensagem | Exemplo |
|--------|----------|---------|
| Conta em análise | Conta pronta para revisão | "G2-001 pronta para revisão — João" |
| Conta aprovada | Conta aprovada | "G2-001 aprovada — João" |
| Conta no estoque | Conta + fonte de tráfego | "G2-001 — Google Ads" |
| Venda realizada | Quantidade + plataformas | "2 conta(s) — Google Ads, Meta Ads • Cliente X" |

## Requisitos

- **iPhone**: iOS 16.4 ou superior
- **PWA**: Adicione o ERP à tela inicial (Compartilhar → Adicionar à Tela de Início)
- **HTTPS**: Funciona apenas em ambiente seguro
- **Variáveis de ambiente**: VAPID keys

## Configuração

### 1. Gerar chaves VAPID

```bash
npx web-push generate-vapid-keys
```

### 2. Adicionar ao .env

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<chave pública>
VAPID_PRIVATE_KEY=<chave privada>
```

### 3. Instalar dependência

```bash
npm install web-push
```

### 4. Aplicar schema

```bash
npx prisma db push
```

### 5. Ativar no admin

1. Acesse **Admin → Configurações**
2. Na seção **Notificações no iPhone**, clique em **Ativar no celular**
3. Aceite a permissão quando o navegador solicitar
4. Clique em **Enviar teste** para validar

## Fontes de tráfego

As notificações exibem a plataforma da conta:
- **Google Ads** — contas G2 e produção Google
- **Meta Ads** — produção Meta
- **Kwai Ads** — produção Kwai
- **TikTok Ads** — quando implementado

## Desenvolvimento

- Web Push não funciona em `localhost` em alguns navegadores
- Use um tunnel (ngrok, etc.) ou deploy em staging para testar
