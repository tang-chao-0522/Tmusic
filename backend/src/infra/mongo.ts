import mongoose from 'mongoose'
import { env } from '../config/env'

export async function connectMongo(logger: { info: Function; warn: Function }) {
  try {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 2_500 })
    logger.info('MongoDB connected')
    return true
  } catch (error) {
    logger.warn({ error }, 'MongoDB unavailable; API will run with limited in-memory behavior')
    return false
  }
}

export function isMongoReady() {
  return mongoose.connection.readyState === 1
}
