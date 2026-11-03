import { auth } from "@/lib/auth";

export default async function middleware(req: any) {
  try {
    return await auth(req);
  } catch (e) {
    console.error("Middleware auth error:", e);
    return;
  }
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
