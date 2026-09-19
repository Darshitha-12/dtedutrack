import { createHash, randomBytes, timingSafeEqual } from "crypto";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SIGNIN_TOKEN_TTL_MS = 3 * 60 * 1000; // 3 minutes
const MAX_ATTEMPTS = 5;

export function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function otpHash(email: string, purpose: string, code: string): string {
  return hashSecret(`${email}:${purpose}:${code}`);
}

export function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function generateSigninToken(): string {
  return randomBytes(32).toString("hex");
}

export { OTP_TTL_MS, SIGNIN_TOKEN_TTL_MS, MAX_ATTEMPTS };