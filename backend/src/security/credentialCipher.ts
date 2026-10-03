import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { env } from '../config/env'

function encryptionKey() {
  let configured = env.CREDENTIAL_ENCRYPTION_KEY
  if (!configured) {
    if (env.NODE_ENV === 'production') throw new Error('CREDENTIAL_ENCRYPTION_KEY is required in production')
    const directory = join(process.cwd(), '.local')
    const path = join(directory, 'credential.key')
    mkdirSync(directory, { recursive: true })
    try { writeFileSync(path, randomBytes(32).toString('base64'), { flag: 'wx', mode: 0o600 }) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    configured = readFileSync(path, 'utf8').trim()
  }
  const key = Buffer.from(configured, 'base64')
  if (key.length !== 32) throw new Error('CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes')
  return key
}

export function encryptCredential(plaintext: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') }
}

export function decryptCredential(input: { ciphertext: string; iv: string; authTag: string }) {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(input.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(input.authTag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(input.ciphertext, 'base64')), decipher.final()]).toString('utf8')
}
