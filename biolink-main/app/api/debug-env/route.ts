import { NextResponse } from "next/server";

/** Temporary: shows whether DB env vars exist (not their values). Remove later. */
export async function GET() {
  const names = Object.keys(process.env)
    .filter((k) => /DATABASE|POSTGRES|NEON|JWT/i.test(k))
    .sort();

  return NextResponse.json({
    hasDATABASE_URL: Boolean(process.env.DATABASE_URL),
    hasPOSTGRES_URL: Boolean(process.env.POSTGRES_URL),
    hasJWT_SECRET: Boolean(process.env.JWT_SECRET),
    matchingKeys: names,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
  });
}
