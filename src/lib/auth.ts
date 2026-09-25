import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { loginSchema } from "@/lib/validations";
import { hashSecret } from "@/lib/otp";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
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
        // OTP sign-in path: credentials carry the one-time token issued after
        // a successful email-code verification.
        if (typeof creds.otpToken === "string" && creds.otpToken.length > 0) {
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

          const user = await db.user.findUnique({
            where: { email: otpEmail },
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

        const user = await db.user.findUnique({ 
          where: { email },
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
      const isOnPublic = isOnLogin || isOnRegister;

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
