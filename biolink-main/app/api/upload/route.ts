import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, ensureProfileSchema } from "@/lib/db";
import { profiles } from "@/lib/schema";
import { eq } from "drizzle-orm";

const KIM_API_KEY = process.env.KIM_API_KEY;
const KIM_BASE_URL = process.env.KIM_BASE_URL || "https://zzz.cried.online";

type UploadType = "avatar" | "background" | "banner" | "cursor" | "video" | "audio";

function extractUploadedUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const data = root.data;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (d.file && typeof d.file === "object") {
      const file = d.file as Record<string, unknown>;
      if (typeof file.url === "string" && file.url) return file.url;
    }
    if (typeof d.url === "string" && d.url) return d.url;
  }
  if (typeof root.url === "string" && root.url) return root.url;
  return null;
}

async function uploadToKim(file: File, safeName: string): Promise<string> {
  if (!KIM_API_KEY) throw new Error("NO_KIM");
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
      if (text) message = `Storage provider (${response.status}): ${text.slice(0, 200)}`;
    }
    throw new Error(message);
  }

  const result = await response.json().catch(() => null);
  const url = extractUploadedUrl(result);
  if (!url) throw new Error("Unexpected response from storage provider");
  return url;
}

/** Public fallback host when KIM_API_KEY is not set. */
async function uploadToCatbox(file: File, safeName: string): Promise<string> {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("fileToUpload", file, safeName);
  const response = await fetch("https://catbox.moe/user/api.php", {
    method: "POST",
    body: form,
  });
  const text = (await response.text()).trim();
  if (!response.ok || !/^https?:\/\//i.test(text)) {
    throw new Error(
      text
        ? `Fallback storage failed: ${text.slice(0, 160)}`
        : "Fallback storage failed."
    );
  }
  return text;
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

  const patch: Record<string, string> = { [column]: url };
  // Background video should also drive the profile video player.
  if (type === "video") {
    // leave backgroundUrl alone
  }
  if (type === "background" && /\.(mp4|webm|mov)(\?|$)/i.test(url)) {
    patch.videoUrl = url;
  }

  if (existing) {
    await db
      .update(profiles)
      .set(patch)
      .where(eq(profiles.userId, userId));
  } else {
    await db.insert(profiles).values({
      userId,
      ...patch,
    });
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const rawType = String(formData.get("type") ?? "").trim().toLowerCase();
  let normalizedType = (["icon", "custom"].includes(rawType)
    ? "avatar"
    : rawType) as UploadType;

  if (!file || !["avatar", "background", "banner", "cursor", "video", "audio"].includes(normalizedType)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // If user picked a video file under "Background", store as video.
  if (normalizedType === "background" && file.type.startsWith("video/")) {
    normalizedType = "video";
  }

  const MAX_BYTES =
    normalizedType === "video" || normalizedType === "audio"
      ? 50 * 1024 * 1024
      : 25 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    const maxMb = MAX_BYTES / 1048576;
    return NextResponse.json(
      {
        error: `File is too large (${(file.size / 1048576).toFixed(1)} MB). Max is ${maxMb} MB.`,
      },
      { status: 413 }
    );
  }

  const safeName =
    (file.name || "upload").replace(/[^\x20-\x7E]/g, "_").slice(0, 120) ||
    "upload";

  try {
    let url: string;
    try {
      url = await uploadToKim(file, safeName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Fall back when KIM is missing or rejects the request.
      if (msg === "NO_KIM" || /rejected|401|403|Storage provider/i.test(msg)) {
        console.warn("KIM upload failed, trying catbox fallback:", msg);
        url = await uploadToCatbox(file, safeName);
      } else {
        throw err;
      }
    }

    try {
      await persistProfileAsset(session.id, normalizedType, url);
    } catch (err) {
      console.error("Failed to persist uploaded asset on profile:", err);
    }

    return NextResponse.json({ url, type: normalizedType });
  } catch (error) {
    console.error("Upload error:", error);
    const message =
      error instanceof Error ? error.message : "Upload failed. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
