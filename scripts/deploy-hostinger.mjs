/**
 * Deploy no VPS Hostinger via SSH + chave (sem senhas no repositório).
 *
 * Pré-requisitos no servidor: git, node, npm, pm2; clone apontando para este repo;
 * código já existir em origin/main (faz `npm run deploy:ship` para verificar + push + deploy).
 */
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function loadEnvDeploy() {
  const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
  const envPath = join(root, '.env.deploy')
  if (!existsSync(envPath)) {
    console.error(
      'Cria o ficheiro .env.deploy na raiz do projeto (copia de .env.deploy.example).',
    )
    process.exit(1)
  }
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

loadEnvDeploy()

function expandHome(p) {
  if (!p) return p
  if (p.startsWith('~/') || p === '~') {
    const rest = p === '~' ? '' : p.slice(2)
    return join(homedir(), rest)
  }
  return p
}

function shellQuoteSingle(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`
}

function need(name) {
  const v = process.env[name]
  if (!v || !String(v).trim()) {
    console.error(`Falta a variável ${name}. Copia .env.deploy.example para .env.deploy.`)
    process.exit(1)
  }
  return String(v).trim()
}

const host = need('DEPLOY_HOST')
const user = need('DEPLOY_USER')
const deployPath = need('DEPLOY_PATH')
const keyPath = resolve(expandHome(need('DEPLOY_SSH_KEY_PATH')))
const pm2Name = (process.env.DEPLOY_PM2_NAME || 'erp-ads-ativos').trim()

if (!existsSync(keyPath)) {
  console.error(`Chave SSH não encontrada: ${keyPath}`)
  process.exit(1)
}

const remoteScript = [
  'set -e',
  `cd ${shellQuoteSingle(deployPath)}`,
  'git fetch origin main',
  'git reset --hard origin/main',
  'npm ci',
  'npm run build',
  `pm2 restart ${shellQuoteSingle(pm2Name)}`,
].join('\n')

const sshArgs = [
  '-i',
  keyPath,
  '-o',
  'BatchMode=yes',
  '-o',
  'StrictHostKeyChecking=accept-new',
  `${user}@${host}`,
  'bash',
  '-s',
]

console.log(`A ligar a ${user}@${host} …`)

const r = spawnSync('ssh', sshArgs, {
  input: remoteScript,
  stdio: ['pipe', 'inherit', 'inherit'],
  encoding: 'utf8',
})

if (r.error) {
  console.error(r.error)
  process.exit(1)
}
process.exit(r.status ?? 1)
