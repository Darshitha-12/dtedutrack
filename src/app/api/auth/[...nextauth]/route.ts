import { handlers } from "@/lib/auth";

// Ensure secrets are set
if (!process.env.AUTH_SECRET && !process.env.NEXTAUTH_SECRET) {
  process.env.AUTH_SECRET = "biopulse-dev-fallback-secret-please-change-on-production-1234567890abcdef";
}
if (!process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = "https://biopulse-study.netlify.app";
}

export const { GET, POST } = handlers;
