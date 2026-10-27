import { NextResponse } from "next/server";

const cache = new Map<string, { at: number; data: unknown }>();
const TTL_MS = 5 * 60 * 1000;

export async function GET(req: Request) {
  const username = (new URL(req.url).searchParams.get("username") ?? "")
    .trim()
    .replace(/^@/, "");

  if (!username || username.length < 3 || username.length > 20) {
    return NextResponse.json({ error: "Invalid Roblox username" }, { status: 400 });
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return NextResponse.json({ error: "Invalid Roblox username" }, { status: 400 });
  }

  const key = username.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.data);
  }

  try {
    const lookupRes = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        usernames: [username],
        excludeBannedUsers: true,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!lookupRes.ok) {
      throw new Error(`Roblox lookup failed (${lookupRes.status})`);
    }

    const lookup = (await lookupRes.json()) as {
      data?: Array<{ id: number; name: string; displayName?: string }>;
    };

    const user = lookup.data?.[0];
    if (!user?.id) {
      return NextResponse.json({ error: "Roblox user not found" }, { status: 404 });
    }

    const [profileRes, thumbRes] = await Promise.all([
      fetch(`https://users.roblox.com/v1/users/${user.id}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      }),
      fetch(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=150x150&format=Png&isCircular=false`,
        {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        }
      ),
    ]);

    let description: string | null = null;
    let displayName = user.displayName || user.name;
    let created: string | null = null;

    if (profileRes.ok) {
      const profile = (await profileRes.json()) as {
        description?: string;
        displayName?: string;
        created?: string;
      };
      description = profile.description?.trim() || null;
      displayName = profile.displayName || displayName;
      created = profile.created ?? null;
    }

    let avatarUrl: string | null = null;
    if (thumbRes.ok) {
      const thumbs = (await thumbRes.json()) as {
        data?: Array<{ imageUrl?: string }>;
      };
      avatarUrl = thumbs.data?.[0]?.imageUrl ?? null;
    }

    const payload = {
      id: user.id,
      username: user.name,
      displayName,
      description,
      avatarUrl,
      created,
      profileUrl: `https://www.roblox.com/users/${user.id}/profile`,
    };

    cache.set(key, { at: Date.now(), data: payload });
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Roblox widget error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load Roblox profile",
      },
      { status: 502 }
    );
  }
}
