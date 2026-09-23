import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);

export async function connectDatabase() {
  const started = Date.now();
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 20,
  });
  logger.info(`MongoDB connected (${Date.now() - started}ms) → ${mongoose.connection.name}`);

  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB error', err));
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

export function databaseState() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] || 'unknown';
}
