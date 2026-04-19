import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { Router } from 'express';

const redisClient = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
  : null;

const createRateLimitMiddleware = (options) => {
  const defaultOptions = {
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests, please try again later.' },
  };

  const config = { ...defaultOptions, ...options };

  if (redisClient) {
    config.store = new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
    });
  }

  return rateLimit(config);
};

export const apiLimiter = createRateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 100,
});

export const authLimiter = createRateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many authentication attempts, please try again after 15 minutes.' },
});

export const whatsappLimiter = createRateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, error: 'WhatsApp API rate limit reached. Please wait before sending more messages.' },
});

export const bulkMessageLimiter = createRateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, error: 'Bulk message limit reached. Please wait before sending more campaigns.' },
});

export const aiLimiter = createRateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, error: 'AI generation limit reached. Please wait before generating more content.' },
});

export const leadCaptureLimiter = createRateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 100,
});

export function applyLimiter(router: Router, limiter: Function, paths: string[] | '*' = '*') {
  if (paths === '*') {
    router.use(limiter);
  } else {
    paths.forEach((path) => {
      router.use(path, limiter);
    });
  }
}