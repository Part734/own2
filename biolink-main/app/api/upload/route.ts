import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, ensureProfileSchema } from "@/lib/db";
import { profiles } from "@/lib/schema";
import { eq } from "drizzle-orm";

const CATBOX_API_URL = "https://catbox.moe/user/api.php";
// Optional: ties uploads to your Catbox account. Anonymous uploads work without it.
const CATBOX_USERHASH = process.env.CATBOX_USERHASH;

type UploadType = "avatar" | "background" | "banner" | "cursor" | "video" | "audio";

/** Uploads a file to Catbox and returns the public URL. */
async function uploadToCatbox(file: File, safeName: string): Promise<string> {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  if (CATBOX_USERHASH) form.append("userhash", CATBOX_USERHASH);
  form.append("fileToUpload", file, safeName);
  const response = await fetch(CATBOX_API_URL, {
    method: "POST",
    body: form,
  });
  const text = (await response.text()).trim();
  if (!response.ok || !/^https?:\/\//i.test(text)) {
    throw new Error(
      text
        ? `Catbox upload failed: ${text.slice(0, 160)}`
        : "Catbox upload failed."
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
    const url = await uploadToCatbox(file, safeName);

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
