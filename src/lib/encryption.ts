/**
 * Criptografia AES-256-GCM para dados sensíveis em repouso.
 * Requer ENCRYPTION_KEY no .env (32 bytes em hex, ex: openssl rand -hex 32)
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const TAG_LENGTH = 16
const KEY_LENGTH = 32
const PREFIX = 'enc:v1:'

function getKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY?.trim()
  if (!raw) return null
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  const buf = Buffer.from(raw, 'base64')
  return buf.length === KEY_LENGTH ? buf : null
}

/** Indica se criptografia está ativa (ENCRYPTION_KEY definida) */
export function isEncryptionAvailable(): boolean {
  return getKey() !== null
}

/**
 * Criptografa texto. Retorna string com prefixo enc:v1: se ENCRYPTION_KEY estiver definida.
 * Caso contrário, retorna o texto em claro (compatibilidade em desenvolvimento).
 */
export function encrypt(plaintext: string): string {
  if (!plaintext || typeof plaintext !== 'string') return plaintext
  const key = getKey()
  if (!key) return plaintext
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const combined = Buffer.concat([iv, tag, encrypted])
  return PREFIX + combined.toString('base64')
}

/**
 * Descriptografa ou retorna texto legado (não criptografado).
 */
export function decrypt(encrypted: string | null | undefined): string | null {
  if (encrypted == null || typeof encrypted !== 'string' || !encrypted.trim()) return null
  if (!encrypted.startsWith(PREFIX)) {
    // Legado: armazenado sem criptografia
    return encrypted
  }
  try {
    const key = getKey()
    if (!key) return null
    const combined = Buffer.from(encrypted.slice(PREFIX.length), 'base64')
    if (combined.length < IV_LENGTH + TAG_LENGTH) return null
    const iv = combined.subarray(0, IV_LENGTH)
    const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
    const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH)
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
    decipher.setAuthTag(tag)
    return decipher.update(ciphertext) + decipher.final('utf8')
  } catch {
    return null
  }
}

/**
 * Verifica se a string está criptografada (formato atual).
 */
export function isEncrypted(value: string | null | undefined): boolean {
  return !!value?.startsWith(PREFIX)
}
