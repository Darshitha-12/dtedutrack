import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { loginSchema } from "@/lib/validations";
import { hashSecret } from "@/lib/otp";

// Provide a fallback secret to avoid "Configuration" errors in environments where env vars aren't set
const AUTH_SECRET_FALLBACK = "biopulse-dev-fallback-secret-please-change-on-production-1234567890abcdef";
const AUTH_SECRET_FALLBACK = "biopulse-dev-fallback-secret-please-change-on-production-1234567890abcdef";
const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || AUTH_SECRET_FALLBACK;

// Ensure secret is always set
process.env.AUTH_SECRET = secret;
process.env.NEXTAUTH_SECRET = secret;
if (!process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://biopulse-study.netlify.app";
}

function createAuth() {
  try {
    const nextAuthConfig = NextAuth({
      secret,
      trustHost: true,
      debug: false,
      providers: [
        CredentialsProvider({
          name: "credentials",
          credentials: {
            email: { label: "Email", type: "email" },
            password: { label: "Password", type: "password" },
          },
          authorize: async (credentials) => {
            const { db } = await import("@/lib/db");
            const creds = (credentials ?? {}) as { email?: string; password?: string; otpToken?: string };
            // OTP sign-in path
            if (typeof creds.otpToken === "string" && /^[a-f0-9]{96}$/.test(creds.otpToken)) {
              const otpEmail = typeof creds.email === "string" ? creds.email.trim().toLowerCase() : "";
              if (!otpEmail) return null;

              const otp = await db.otpVerification.findFirst({
                where: {
                  email: otpEmail,
                  purpose: { in: ["login", "register"] },
                  usedAt: null,
                  tokenHash: hashSecret(creds.otpToken),
                  tokenExpiresAt: { gt: new Date() },
                },
              });
              if (!otp) return null;

              const user = await db.user.findFirst({
                where: { email: { equals: otpEmail, mode: "insensitive" } },
                select: { id: true, email: true, name: true, image: true, emailVerified: true },
              });
              if (!user) return null;

              const now = new Date();
              await db.otpVerification.update({
                where: { id: otp.id },
                data: { usedAt: now },
              });
              if (!user.emailVerified) {
                await db.user.update({ where: { id: user.id }, data: { emailVerified: now } });
              }

              return { id: user.id, email: user.email, name: user.name, image: user.image };
            }

            const parsed = loginSchema.safeParse(credentials);
            if (!parsed.success) return null;

            const { email, password } = parsed.data;

            const user = await db.user.findFirst({
              where: { email: { equals: email.trim(), mode: "insensitive" } },
              select: { id: true, email: true, name: true, passwordHash: true, image: true },
            });
            if (!user || !user.passwordHash) return null;

            const isValid = await bcrypt.compare(password, user.passwordHash);
            if (!isValid) return null;

            return {
              id: user.id,
              email: user.email,
              name: user.name,
              image: user.image,
            };
          },
        }),
      ],
      session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
      trustHost: true,
      pages: {
        signIn: "/login",
      },
      callbacks: {
        async jwt({ token, user, trigger, session }) {
          if (user) {
            token.id = user.id;
            token.email = user.email;
            token.name = user.name;
            if ("image" in user && user.image) token.picture = user.image;
          }

          if (trigger === "update" && session) {
            token.name = session.user?.name ?? token.name;
            if (session.user?.image) token.picture = session.user.image;
          }

          return token;
        },
        async session({ session, token }) {
          session.user.id = token.id as string;
          session.user.email = token.email as string;
          session.user.name = token.name as string;
          session.user.image = (token.picture as string) || null;

          return session;
        },
        async authorized({ auth, request: { nextUrl } }) {
          const isLoggedIn = !!auth?.user;
          const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
          const isOnLogin = nextUrl.pathname === "/login";
          const isOnRegister = nextUrl.pathname === "/register";
          const isOnForgotPassword = nextUrl.pathname === "/forgot-password";
          const isOnPublic = isOnLogin || isOnRegister || isOnForgotPassword;

          if (isLoggedIn && isOnPublic) {
            return Response.redirect(new URL("/dashboard", nextUrl));
          }

          if (isOnDashboard && !isLoggedIn) {
            return Response.redirect(new URL("/login", nextUrl));
          }

          return true;
        },
      },
    });
    return nextAuthConfig;
  } catch (e) {
    console.error("Auth initialization error:", e);
    // Fallback minimal config
    const nextAuthConfig = NextAuth({
      secret,
      trustHost: true,
      providers: [],
      pages: { signIn: "/login" },
    });
    return nextAuthConfig;
  }
}

const nextAuthConfig = createAuth();

export const { handlers, auth, signIn, signOut } = nextAuthConfig;
