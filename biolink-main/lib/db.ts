import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Lazy DB init so `next build` can import this module without DATABASE_URL
 * (Vercel collects page data at build time; the real URL is only required
 * when a request actually hits the database).
 */
type Sql = NeonQueryFunction<false, false>;
type Db = NeonHttpDatabase<typeof schema>;

let _sql: Sql | null = null;
let _db: Db | null = null;

function connectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    ""
  );
}

function getSql(): Sql {
  if (_sql) return _sql;
  const url = connectionString();
  if (!url) {
    throw new Error(
      "No database connection string. Set DATABASE_URL (or POSTGRES_URL) in the environment."
    );
  }
  _sql = neon(url);
  return _sql;
}

/** Tagged-template SQL client (used by ensure* helpers). */
export const sql: Sql = ((strings: TemplateStringsArray, ...values: unknown[]) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (getSql() as any)(strings, ...values)) as Sql;

function getDb(): Db {
  if (_db) return _db;
  _db = drizzle(getSql(), { schema });
  return _db;
}

/** Drizzle client — connects on first property access, not at import time. */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/** Run each schema ensure at most once per process (avoids repeated ALTER TABLE on every request). */
const ensured = new Set<string>();
async function once(key: string, fn: () => Promise<void>) {
  if (ensured.has(key)) return;
  try {
    await fn();
    ensured.add(key);
  } catch (error) {
    console.error(`${key} error:`, error);
  }
}

export async function ensureUserBadgeSchema() {
  await once("userBadge", async () => {
    await sql`ALTER TABLE IF EXISTS user_badges ADD COLUMN IF NOT EXISTS hidden INTEGER NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE IF EXISTS user_badges ADD COLUMN IF NOT EXISTS color TEXT`;
    await sql`ALTER TABLE IF EXISTS user_badges ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE IF EXISTS user_badges ADD COLUMN IF NOT EXISTS glow INTEGER NOT NULL DEFAULT 1`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS user_badges_user_badge_idx ON user_badges (user_id, badge_id)`;
    await sql`CREATE INDEX IF NOT EXISTS user_badges_user_hidden_idx ON user_badges (user_id, hidden)`;
  });
}

export async function ensureSocialLinksSchema() {
  await once("socialLinks", async () => {
    await sql`ALTER TABLE IF EXISTS social_links ADD COLUMN IF NOT EXISTS icon_url TEXT`;
    await sql`ALTER TABLE IF EXISTS social_links ADD COLUMN IF NOT EXISTS "order" INTEGER NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE IF EXISTS social_links ADD COLUMN IF NOT EXISTS clicks INTEGER NOT NULL DEFAULT 0`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS social_links_user_platform_idx ON social_links (user_id, platform)`;
  });
}

export async function ensureUsersSchema() {
  await once("users", async () => {
    await sql`ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS is_admin INTEGER NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS premium INTEGER NOT NULL DEFAULT 0`;
  });
}

export async function ensurePremiumSchema() {
  await once("premium", async () => {
    await sql`CREATE TABLE IF NOT EXISTS premium_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan TEXT NOT NULL DEFAULT 'plus',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    )`;
    await sql`CREATE INDEX IF NOT EXISTS premium_subscriptions_user_id_idx ON premium_subscriptions (user_id)`;
    await ensureUsersSchema();
    await sql`UPDATE users SET premium = 1 WHERE premium = 0 AND id IN (SELECT user_id FROM premium_subscriptions WHERE status = 'active' AND (expires_at IS NULL OR expires_at > NOW()))`;
  });
}

export async function ensureWidgetsSchema() {
  await once("widgets", async () => {
    await sql`CREATE TABLE IF NOT EXISTS profile_widgets (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      config TEXT
    )`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS profile_widgets_user_type_idx ON profile_widgets (user_id, type)`;
    await sql`CREATE INDEX IF NOT EXISTS profile_widgets_user_id_idx ON profile_widgets (user_id)`;
  });
}

export async function ensureFeedbackSchema() {
  await once("feedback", async () => {
    await sql`CREATE TABLE IF NOT EXISTS profile_feedback (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      profile_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      voter_ip TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'like',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS profile_feedback_profile_voter_idx ON profile_feedback (profile_user_id, voter_ip)`;
    await sql`CREATE INDEX IF NOT EXISTS profile_feedback_profile_kind_idx ON profile_feedback (profile_user_id, kind)`;
  });
}

export async function ensureProfileSchema() {
  await once("profile", async () => {
    await sql`ALTER TABLE IF EXISTS profiles
      ADD COLUMN IF NOT EXISTS avatar_url TEXT,
      ADD COLUMN IF NOT EXISTS background_url TEXT,
      ADD COLUMN IF NOT EXISTS banner_url TEXT,
      ADD COLUMN IF NOT EXISTS cursor_url TEXT,
      ADD COLUMN IF NOT EXISTS layout TEXT NOT NULL DEFAULT 'centered',
      ADD COLUMN IF NOT EXISTS blur INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS card_blur INTEGER NOT NULL DEFAULT 20,
      ADD COLUMN IF NOT EXISTS overlay_enabled INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS overlay_text TEXT NOT NULL DEFAULT 'Click to show',
      ADD COLUMN IF NOT EXISTS tilt_enabled INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS tilt_mode TEXT NOT NULL DEFAULT 'tilt',
      ADD COLUMN IF NOT EXISTS border_radius INTEGER NOT NULL DEFAULT 24,
      ADD COLUMN IF NOT EXISTS border_width INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS display_name TEXT,
      ADD COLUMN IF NOT EXISTS card_opacity INTEGER NOT NULL DEFAULT 100,
      ADD COLUMN IF NOT EXISTS border_opacity INTEGER NOT NULL DEFAULT 100,
      ADD COLUMN IF NOT EXISTS card_width INTEGER NOT NULL DEFAULT 420,
      ADD COLUMN IF NOT EXISTS card_blur_enabled INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS avatar_shape TEXT NOT NULL DEFAULT 'circle',
      ADD COLUMN IF NOT EXISTS location TEXT,
      ADD COLUMN IF NOT EXISTS occupation TEXT,
      ADD COLUMN IF NOT EXISTS bio TEXT,
      ADD COLUMN IF NOT EXISTS show_views INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS views_position TEXT NOT NULL DEFAULT 'top-right',
      ADD COLUMN IF NOT EXISTS badges_position TEXT NOT NULL DEFAULT 'auto',
      ADD COLUMN IF NOT EXISTS custom_layout TEXT,
      ADD COLUMN IF NOT EXISTS accent_color TEXT NOT NULL DEFAULT 'white',
      ADD COLUMN IF NOT EXISTS primary_color TEXT NOT NULL DEFAULT 'white',
      ADD COLUMN IF NOT EXISTS text_color TEXT NOT NULL DEFAULT 'white',
      ADD COLUMN IF NOT EXISTS border_color TEXT NOT NULL DEFAULT 'white',
      ADD COLUMN IF NOT EXISTS background_color TEXT NOT NULL DEFAULT '#111111',
      ADD COLUMN IF NOT EXISTS badge_color TEXT NOT NULL DEFAULT 'white',
      ADD COLUMN IF NOT EXISTS social_color TEXT NOT NULL DEFAULT 'white',
      ADD COLUMN IF NOT EXISTS link_hover_color TEXT NOT NULL DEFAULT 'white',
      ADD COLUMN IF NOT EXISTS glow_enabled INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS username_glow INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS gradient_enabled INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS gradient_primary TEXT NOT NULL DEFAULT '#881c9c',
      ADD COLUMN IF NOT EXISTS gradient_secondary TEXT NOT NULL DEFAULT '#0d0d0d',
      ADD COLUMN IF NOT EXISTS show_feedback INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS username_color TEXT,
      ADD COLUMN IF NOT EXISTS avatar_hidden INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS sections_enabled INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS video_url TEXT,
      ADD COLUMN IF NOT EXISTS audio_url TEXT,
      ADD COLUMN IF NOT EXISTS overlay_blur INTEGER NOT NULL DEFAULT 85`;
  });
}

export async function ensureAnalyticsSchema() {
  await once("analytics", async () => {
    await sql`ALTER TABLE IF EXISTS page_views ADD COLUMN IF NOT EXISTS ip TEXT`;
    await sql`ALTER TABLE IF EXISTS page_views ADD COLUMN IF NOT EXISTS device TEXT`;
    await sql`ALTER TABLE IF EXISTS page_views ADD COLUMN IF NOT EXISTS country TEXT`;
    await sql`ALTER TABLE IF EXISTS page_views ADD COLUMN IF NOT EXISTS city TEXT`;
    await sql`ALTER TABLE IF EXISTS page_views ADD COLUMN IF NOT EXISTS latitude TEXT`;
    await sql`ALTER TABLE IF EXISTS page_views ADD COLUMN IF NOT EXISTS longitude TEXT`;
    await sql`ALTER TABLE IF EXISTS page_views ADD COLUMN IF NOT EXISTS referrer TEXT`;
    await sql`ALTER TABLE IF EXISTS page_views ADD COLUMN IF NOT EXISTS user_agent TEXT`;
    await sql`CREATE INDEX IF NOT EXISTS page_views_user_created_idx ON page_views (user_id, created_at)`;
  });
}

export async function ensureAliasesSchema() {
  await once("aliases", async () => {
    await sql`CREATE TABLE IF NOT EXISTS aliases (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      alias TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS aliases_user_id_idx ON aliases (user_id)`;
  });
}

export async function ensureTemplatesSchema() {
  await once("templates", async () => {
    await sql`CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      owner_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      preview_url TEXT,
      tags TEXT NOT NULL DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'public',
      premium_only INTEGER NOT NULL DEFAULT 0,
      snapshot TEXT NOT NULL,
      use_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS templates_owner_id_idx ON templates (owner_id)`;
    await sql`CREATE TABLE IF NOT EXISTS template_favorites (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      template_id TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS template_favorites_template_user_idx ON template_favorites (template_id, user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS template_favorites_template_id_idx ON template_favorites (template_id)`;
    await sql`CREATE TABLE IF NOT EXISTS template_uses (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      template_id TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS template_uses_template_id_idx ON template_uses (template_id)`;
    await sql`CREATE INDEX IF NOT EXISTS template_uses_user_id_idx ON template_uses (user_id)`;
  });
}
