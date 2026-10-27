import DashboardShell from "@/components/dashboard/shell";
import CustomizeNav from "@/components/dashboard/customize-nav";
import { getSession } from "@/lib/auth";
import { db, ensureProfileSchema } from "@/lib/db";
import { profiles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import TracksClient from "./client";

export const metadata = {
  title: "Tracks — crying.wiki",
};

export default async function CustomizeTracksPage() {
  const session = await getSession();
  if (!session) return null;

  let profile: typeof profiles.$inferSelect | null = null;
  try {
    await ensureProfileSchema();
    const [row] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, session.id));
    profile = row ?? null;
  } catch {
    profile = null;
  }

  return (
    <DashboardShell
      title="Tracks"
      icon={
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="8" cy="18" r="4" />
          <path d="M12 18V2l7 4" />
        </svg>
      }
      subnav={<CustomizeNav />}
      maxWidth="max-w-4xl"
    >
      <TracksClient
        profile={{
          videoUrl: profile?.videoUrl ?? null,
          audioUrl: profile?.audioUrl ?? null,
          overlayEnabled: profile?.overlayEnabled ?? 0,
          overlayText: profile?.overlayText ?? "Click to enter",
          overlayBlur: profile?.overlayBlur ?? 85,
          backgroundUrl: profile?.backgroundUrl ?? null,
        }}
      />
    </DashboardShell>
  );
}
