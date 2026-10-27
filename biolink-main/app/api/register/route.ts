import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { SignJWT } from "jose";
import { db, ensureUsersSchema, ensureProfileSchema } from "@/lib/db";
import { profiles, users } from "@/lib/schema";
import { eq } from "drizzle-orm";

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "fallback-dev-secret-change-me"
);

export async function POST(req: Request) {
  try {
    const { username, email, password } = await req.json();

    if (!username?.trim() || !email?.trim() || !password) {
      return NextResponse.json(
        { error: "Please fill in every field." },
        { status: 400 }
      );
    }

    const cleanUsername = String(username).trim().toLowerCase();

    if (!/^[a-z0-9_]{3,32}$/.test(cleanUsername)) {
      return NextResponse.json(
        {
          error:
            "Username must be 3–32 characters and only contain letters, numbers, and underscores.",
        },
        { status: 400 }
      );
    }

    const reserved = new Set([
      "admin",
      "api",
      "casino",
      "dashboard",
      "help",
      "login",
      "logout",
      "register",
      "settings",
      "status",
      "terms",
      "privacy",
      "support",
      "www",
      "static",
      "assets",
      "favicon",
      "robots",
      "sitemap",
    ]);
    if (reserved.has(cleanUsername)) {
      return NextResponse.json(
        { error: "That username is reserved." },
        { status: 400 }
      );
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json(
        { error: "That email doesn't look right." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    await ensureUsersSchema();
    await ensureProfileSchema();

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, cleanUsername));

    if (existing) {
      return NextResponse.json(
        { error: "That username is already taken." },
        { status: 409 }
      );
    }

    const [existingEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()));

    if (existingEmail) {
      return NextResponse.json(
        { error: "That email is already registered." },
        { status: 409 }
      );
    }

    const passwordHash = await hash(password, 12);

    const [user] = await db
      .insert(users)
      .values({
        username: cleanUsername,
        email: email.trim().toLowerCase(),
        passwordHash,
      })
      .returning({ id: users.id, username: users.username });

    await db.insert(profiles).values({ userId: user.id });

    const token = await new SignJWT({
      sub: String(user.id),
      username: user.username,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

    const res = NextResponse.json({
      ok: true,
      user: { id: user.id, username: user.username },
    });

    res.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (err) {
    console.error("Register error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: message.includes("database") || message.includes("DATABASE") || message.includes("connect")
          ? message.slice(0, 240)
          : `Something went wrong: ${message.slice(0, 180)}`,
      },
      { status: 500 }
    );
  }
}
