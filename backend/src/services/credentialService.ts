import { isMongoReady } from '../infra/mongo'
import { ExternalCredentialModel } from '../models/ExternalCredential'
import { decryptCredential } from '../security/credentialCipher'
import { encryptCredential } from '../security/credentialCipher'

export async function getNeteaseCookie(userId: string) {
  if (!isMongoReady()) return undefined
  const credential = await ExternalCredentialModel.findOne({ userId, provider: 'netease' }).lean()
  if (!credential) return undefined
  try {
    return decryptCredential({ ciphertext: credential.ciphertext, iv: credential.iv, authTag: credential.authTag })
  } catch {
    return undefined
  }
}

export async function saveNeteaseCookie(userId: string, cookie: string, accountId?: string) {
  if (!isMongoReady()) throw new Error('MongoDB is required to save credentials')
  const encrypted = encryptCredential(cookie)
  await ExternalCredentialModel.updateOne(
    { userId, provider: 'netease' },
    { $set: { ...encrypted, ...(accountId ? { accountId } : {}), keyVersion: 1, lastValidatedAt: new Date() } },
    { upsert: true },
  )
}

export async function credentialMatchesAccount(userId: string, accountId: string) {
  if (!isMongoReady()) return false
  return Boolean(await ExternalCredentialModel.exists({ userId, provider: 'netease', accountId }))
}

export async function removeNeteaseCookie(userId: string) {
  if (!isMongoReady()) return
  await ExternalCredentialModel.deleteOne({ userId, provider: 'netease' })
}

export async function hasNeteaseCredential(userId: string) {
  if (!isMongoReady()) return false
  return Boolean(await ExternalCredentialModel.exists({ userId, provider: 'netease' }))
}
