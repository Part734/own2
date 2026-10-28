import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, ensureProfileSchema } from "@/lib/db";
import { profiles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { createHash, createHmac, randomUUID } from "crypto";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET = process.env.R2_BUCKET;
// Public base URL of the bucket (r2.dev URL or your custom domain), no trailing slash.
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");

type UploadType = "avatar" | "background" | "banner" | "cursor" | "video" | "audio";

const sha256Hex = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) =>
  createHmac("sha256", key).update(data).digest();

/** Uploads a file to Cloudflare R2 (signed S3 request, no extra packages) and returns the public URL. */
async function uploadToR2(file: File, safeName: string): Promise<string> {
  const accessKey = process.env.R2_ACCESS_KEY_ID;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!R2_ACCOUNT_ID || !R2_BUCKET || !R2_PUBLIC_URL || !accessKey || !secretKey) {
    throw new Error("Upload storage is not configured.");
  }

  const ext =
    (safeName.split(".").pop() || "bin")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase()
      .slice(0, 8) || "bin";
  const key = `uploads/${randomUUID()}.${ext}`;
  const body = Buffer.from(await file.arrayBuffer());

  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const path = `/${R2_BUCKET}/${key}`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    "PUT",
    path,
    "",
    `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), "auto"), "s3"),
    "aws4_request"
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  const response = await fetch(`https://${host}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      "Content-Type": file.type || "application/octet-stream",
    },
    body,
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 160);
    throw new Error(`R2 upload failed (${response.status}): ${detail}`);
  }

  return `${R2_PUBLIC_URL}/${key}`;
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
    const url = await uploadToR2(file, safeName);

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
