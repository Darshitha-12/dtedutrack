import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// After a database migration/failover a JWT session can still be valid (it is
// signed with the same secret) while the user row it references no longer
// exists. Every write that touches the User foreign key then explodes with a
// P2003. Guard once here and force a fresh sign-in instead.
export async function requireDbUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });
  return user ? session : null;
}