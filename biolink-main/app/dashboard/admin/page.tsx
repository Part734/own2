import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db, ensureUsersSchema, ensureAnalyticsSchema } from "@/lib/db";
import { users, badges, pageViews } from "@/lib/schema";
import { ensureDefaultBadges, canAccessAdminPanel } from "@/lib/badges";
import { desc, eq, sql } from "drizzle-orm";
import Sidebar from "@/components/dashboard/sidebar";
import AdminClient from "./admin-client";

export default async function AdminPage() {
  const session = await getSession();

  let canAccess = false;
  try {
    canAccess = await canAccessAdminPanel(session);
  } catch {
    canAccess = false;
  }
  if (!canAccess) {
    redirect("/dashboard");
  }
  if (!session) redirect("/register");

  let allUsers: Array<{
    id: number;
    username: string;
    email: string;
    isAdmin: boolean;
    premium: boolean;
    createdAt: Date;
    lastIp: string | null;
  }> = [];
  let allBadges: Array<typeof badges.$inferSelect> = [];

  try {
    await ensureDefaultBadges();
    await ensureUsersSchema();
    await ensureAnalyticsSchema();

    const rows = await db.select().from(users);

    // Latest non-null IP per user from page_views
    const ipRows = await db
      .select({
        userId: pageViews.userId,
        ip: pageViews.ip,
        createdAt: pageViews.createdAt,
      })
      .from(pageViews)
      .where(sql`${pageViews.ip} IS NOT NULL`)
      .orderBy(desc(pageViews.createdAt))
      .limit(5000);

    const lastIpByUser = new Map<number, string>();
    for (const row of ipRows) {
      if (row.userId != null && row.ip && !lastIpByUser.has(row.userId)) {
        lastIpByUser.set(row.userId, row.ip);
      }
    }

    allUsers = rows.map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      isAdmin: !!(user as { isAdmin?: unknown }).isAdmin,
      premium: !!(user as { premium?: unknown }).premium,
      createdAt: user.createdAt,
      lastIp: lastIpByUser.get(user.id) ?? null,
    }));
    allBadges = await db.select().from(badges);
  } catch (e) {
    console.error("Admin page load error:", e);
    allUsers = [];
    allBadges = [];
  }

  return (
    <div className="relative flex min-h-screen font-sans text-white">
      <Sidebar session={session} />
      <main className="flex-1 overflow-y-auto px-4 py-8 md:px-8 md:py-10">
        <div className="w-full max-w-6xl">
          <div className="mb-6">
            <h1 className="m-0 text-2xl font-bold text-white">Admin Panel</h1>
            <p className="mt-1 text-sm text-white/45">
              Manage users, badges, and staff access. Your UID:{" "}
              <span className="font-mono text-pink-300">{session.id}</span>
            </p>
          </div>
          <AdminClient allUsers={allUsers} allBadges={allBadges} />
        </div>
      </main>
    </div>
  );
}
