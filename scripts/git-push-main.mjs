/**
 * Garante push para origin/main antes do deploy remoto.
 * Credenciais GitHub: SSH ou Git Credential Manager (não vão para ficheiros do projeto).
 */
import { spawnSync } from 'node:child_process'

const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
  encoding: 'utf8',
}).stdout?.trim()

if (branch !== 'main') {
  console.error(`Estás na branch "${branch}". Muda para main ou faz merge antes do deploy.`)
  process.exit(1)
}

const dirty = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout
if (dirty?.trim()) {
  console.error('Há alterações não commitadas. Faz commit antes de deploy:ship.')
  process.exit(1)
}

const push = spawnSync('git', ['push', 'origin', 'main'], { stdio: 'inherit' })
process.exit(push.status ?? 1)
