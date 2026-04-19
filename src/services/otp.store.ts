import { redisClient } from '../index.js';
import crypto from 'crypto';
const OTP_EXPIRY_SECONDS = 600; // 10 minutes
export class OtpStore {
static generateOtp(email) {
const otp = crypto.randomInt(100000, 999999).toString();
return {
otp,
expiresAt: Date.now() + OTP_EXPIRY_SECONDS * 1000,
};
}
static async set(email, data) {
const key = `otp:${email}`;
const value = JSON.stringify({ ...data, createdAt: Date.now() });
if (redisClient) {
await redisClient.setex(key, OTP_EXPIRY_SECONDS, value);
} else {
console.warn('[OTP] Redis not available, using in-memory fallback');
global.otpStoreFallback = global.otpStoreFallback || new Map();
global.otpStoreFallback.set(email, {
...data,
expiresAt: Date.now() + OTP_EXPIRY_SECONDS * 1000,
createdAt: Date.now(),
});
}
}
static async get(email) {
const key = `otp:${email}`;
if (redisClient) {
const data = await redisClient.get(key);
return data ? JSON.parse(data) : null;
} else {
global.otpStoreFallback = global.otpStoreFallback || new Map();
const data = global.otpStoreFallback.get(email);
if (data && data.expiresAt > Date.now()) {
return data;
}
global.otpStoreFallback.delete(email);
return null;
}
}
static async delete(email) {
const key = `otp:${email}`;
if (redisClient) {
await redisClient.del(key);
} else {
global.otpStoreFallback = global.otpStoreFallback || new Map();
global.otpStoreFallback.delete(email);
}
}
static async isValid(email, otp) {
const stored = await this.get(email);
if (!stored || stored.expiresAt < Date.now()) {
return false;
}
return stored.otp === otp;
}
}