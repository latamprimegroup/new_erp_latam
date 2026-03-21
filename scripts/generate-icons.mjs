#!/usr/bin/env node
/**
 * Gera ícones PWA 192x192 e 512x512 a partir do logo ADS Ativos.
 * Requer: npm install sharp --save-dev
 * Uso: node scripts/generate-icons.mjs
 */
import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const logoPath = join(root, 'public/logos/ads-azul-ativos-branco.png')
const out192 = join(root, 'public/icons/icon-192.png')
const out512 = join(root, 'public/icons/icon-512.png')

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.log('Execute: npm install sharp --save-dev')
  console.log('Depois: node scripts/generate-icons.mjs')
  process.exit(1)
}

const meta = await sharp(logoPath).metadata()
const w = meta.width || 1024
const h = meta.height || 479
const bg = { r: 13, g: 27, b: 42, alpha: 1 } // #0D1B2A Style Guide ADS

function buildIcon(side) {
  const hNew = Math.round((h * side) / w)
  const pad = Math.max(0, Math.floor((side - hNew) / 2))
  return sharp(logoPath)
    .resize(side, hNew, { fit: 'contain', background: bg })
    .extend({ top: pad, bottom: side - hNew - pad, left: 0, right: 0, background: bg })
    .png()
    .toBuffer()
}

const buf192 = await buildIcon(192)
const buf512 = await buildIcon(512)

writeFileSync(out192, buf192)
writeFileSync(out512, buf512)
console.log('Ícones gerados: icon-192.png, icon-512.png')
