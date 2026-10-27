import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, ensureProfileSchema } from "@/lib/db";
import { profiles } from "@/lib/schema";
import { eq } from "drizzle-orm";

const KIM_API_KEY = process.env.KIM_API_KEY;
const KIM_BASE_URL = "https://zzz.cried.online";

type UploadType = "avatar" | "background" | "banner" | "cursor" | "video" | "audio";

function extractUploadedUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const data = root.data;
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  // Current KIM response: { success, data: { file: { url } } }
  if (d.file && typeof d.file === "object") {
    const file = d.file as Record<string, unknown>;
    if (typeof file.url === "string" && file.url) return file.url;
  }

  // Older / alternate shape: { success, data: { url } }
  if (typeof d.url === "string" && d.url) return d.url;

  return null;
}

async function persistProfileAsset(
  userId: number,
  type: UploadType,
  url: string
) {
  await ensureProfileSchema();
  const column =
    type === "avatar"
      ? "avatarUrl"
      : type === "background"
        ? "backgroundUrl"
        : type === "banner"
          ? "bannerUrl"
          : type === "video"
            ? "videoUrl"
            : type === "audio"
              ? "audioUrl"
              : "cursorUrl";

  const [existing] = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.userId, userId));

  if (existing) {
    await db
      .update(profiles)
      .set({ [column]: url })
      .where(eq(profiles.userId, userId));
  } else {
    await db.insert(profiles).values({
      userId,
      [column]: url,
    });
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const rawType = String(formData.get("type") ?? "").trim().toLowerCase();
  const normalizedType = (["icon", "custom"].includes(rawType)
    ? "avatar"
    : rawType) as UploadType;

  if (!file || !["avatar", "background", "banner", "cursor", "video", "audio"].includes(normalizedType)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!KIM_API_KEY) {
    return NextResponse.json(
      { error: "Uploads are not configured (missing KIM_API_KEY)." },
      { status: 500 }
    );
  }

  const MAX_BYTES =
    normalizedType === "video" || normalizedType === "audio"
      ? 50 * 1024 * 1024
      : 25 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `File is too large (${(file.size / 1048576).toFixed(1)} MB). Max is 25 MB.`,
      },
      { status: 413 }
    );
  }

  // Non-ASCII filenames break outgoing headers — send a safe fallback.
  const safeName =
    (file.name || "upload").replace(/[^\x20-\x7E]/g, "_").slice(0, 120) ||
    "upload";

  try {
    const response = await fetch(`${KIM_BASE_URL}/v1/upload`, {
      method: "POST",
      headers: {
        "x-kim-api-key": KIM_API_KEY,
        "x-kim-mode": "moe",
        "x-kim-visibility": "public",
        "x-filename": safeName,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let message = `Storage provider rejected the upload (${response.status}).`;
      try {
        const errorData = JSON.parse(text) as {
          error?: { message?: string } | string;
        };
        const detail =
          typeof errorData?.error === "string"
            ? errorData.error
            : errorData?.error?.message;
        if (detail) message = `Storage provider: ${detail}`;
      } catch {
        if (text)
          message = `Storage provider (${response.status}): ${text.slice(0, 200)}`;
      }
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const result = await response.json().catch(() => null);
    const url = extractUploadedUrl(result);
    if (!url) {
      console.error("Unexpected KIM upload response:", result);
      return NextResponse.json(
        { error: "Unexpected response from storage provider" },
        { status: 500 }
      );
    }

    // Persist immediately so the public profile shows the new asset without
    // requiring a separate Save click.
    try {
      await persistProfileAsset(session.id, normalizedType, url);
    } catch (err) {
      console.error("Failed to persist uploaded asset on profile:", err);
    }

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Upload failed: ${error.message}`
            : "Internal server error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { url } = await req.json();
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const urlObj = new URL(url);
    const key = urlObj.pathname.slice(1);

    if (!key) {
      return NextResponse.json(
        { error: "Could not extract file key from URL" },
        { status: 400 }
      );
    }

    const response = await fetch(`${KIM_BASE_URL}/v1/delete`, {
      method: "DELETE",
      headers: {
        "x-kim-api-key": KIM_API_KEY || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ key }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        {
          error:
            (errorData as { error?: { message?: string } })?.error?.message ||
            "Deletion from storage provider failed",
        },
        { status: response.status }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
