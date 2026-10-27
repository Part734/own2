"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  btnGradient,
  Card,
  CardContent,
  CardHeader,
  formLabel,
  inputClass,
  Switch,
  ToggleCard,
} from "@/components/dashboard/ui";
import { useToastStack } from "@/components/ui/toast-stack";

interface TracksData {
  videoUrl: string | null;
  audioUrl: string | null;
  overlayEnabled: number | boolean | null;
  overlayText: string | null;
  overlayBlur: number | null;
  backgroundUrl: string | null;
}

export default function TracksClient({ profile }: { profile: TracksData }) {
  const router = useRouter();
  const { pushToast } = useToastStack();
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const [videoUrl, setVideoUrl] = useState(profile.videoUrl ?? "");
  const [audioUrl, setAudioUrl] = useState(profile.audioUrl ?? "");
  const [overlayEnabled, setOverlayEnabled] = useState(
    Number(profile.overlayEnabled ?? 0) !== 0 || Boolean(profile.audioUrl)
  );
  const [overlayText, setOverlayText] = useState(
    profile.overlayText || "Click to enter"
  );
  const [overlayBlur, setOverlayBlur] = useState(
    Number(profile.overlayBlur ?? 85)
  );
  const [uploading, setUploading] = useState<"video" | "audio" | null>(null);
  const [saving, setSaving] = useState(false);

  async function upload(file: File, type: "video" | "audio") {
    setUploading(type);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", type);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Upload failed");
      if (!data?.url) throw new Error("No URL returned");
      if (type === "video") setVideoUrl(data.url);
      else setAudioUrl(data.url);
      pushToast(type === "video" ? "Video uploaded" : "Music uploaded");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  function useAudioFromVideo() {
    if (!videoUrl) {
      pushToast("Upload a background video first.");
      return;
    }
    setAudioUrl(videoUrl);
    setOverlayEnabled(true);
    pushToast("Music set from video — save to apply.");
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: videoUrl || null,
          audioUrl: audioUrl || null,
          overlayEnabled: overlayEnabled ? 1 : 0,
          overlayText: overlayText || "Click to enter",
          overlayBlur,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not save");
      pushToast("Saved!");
      router.refresh();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-28">
      <Card>
        <CardHeader
          title="Background video"
          description="Loops muted behind your profile. Visitors see it on the enter screen and after they click in."
        />
        <CardContent className="space-y-4">
          {videoUrl ? (
            <video
              src={videoUrl}
              className="aspect-video w-full rounded-xl border border-white/10 bg-black object-cover"
              muted
              loop
              playsInline
              controls
            />
          ) : (
            <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-white/15 bg-white/[0.03] text-sm text-white/40">
              No video yet
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f, "video");
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={uploading !== null}
              onClick={() => videoInputRef.current?.click()}
              className={btnGradient}
            >
              {uploading === "video" ? "Uploading…" : "Upload video"}
            </button>
            {videoUrl ? (
              <button
                type="button"
                onClick={() => setVideoUrl("")}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/70 hover:bg-white/5"
              >
                Remove
              </button>
            ) : null}
          </div>
          <p className="text-xs text-white/40">MP4 or WebM · max 50 MB</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Music"
          description="Plays after someone clicks the enter screen. Required for autoplay in browsers."
        />
        <CardContent className="space-y-4">
          {audioUrl ? (
            <audio src={audioUrl} controls className="w-full" />
          ) : (
            <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/40">
              No music yet
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/*,video/mp4,video/webm"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f, "audio");
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={uploading !== null}
              onClick={() => audioInputRef.current?.click()}
              className={btnGradient}
            >
              {uploading === "audio" ? "Uploading…" : "Upload music"}
            </button>
            <button
              type="button"
              disabled={!videoUrl || uploading !== null}
              onClick={useAudioFromVideo}
              className="rounded-lg border border-pink-500/40 bg-pink-600/20 px-4 py-2 text-sm font-semibold text-pink-200 hover:bg-pink-600/30 disabled:opacity-40"
            >
              Use audio from video
            </button>
            {audioUrl ? (
              <button
                type="button"
                onClick={() => setAudioUrl("")}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/70 hover:bg-white/5"
              >
                Remove
              </button>
            ) : null}
          </div>
          <p className="text-xs text-white/40">
            MP3 / WAV / OGG, or use the button to take the sound track from your
            background video.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Click to enter"
          description="Gate the page so music can start after a tap. Blur defaults to 85%."
        />
        <CardContent className="space-y-5">
          <ToggleCard
            label="Enable enter screen"
            checked={overlayEnabled}
            onCheckedChange={setOverlayEnabled}
          />

          <div className="space-y-2">
            <label className={formLabel} htmlFor="overlay-text">
              Button / text
            </label>
            <input
              id="overlay-text"
              value={overlayText}
              onChange={(e) => setOverlayText(e.target.value)}
              placeholder="Click to enter"
              maxLength={80}
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={formLabel} htmlFor="overlay-blur">
                Blur
              </label>
              <span className="text-sm font-medium text-white/70">
                {overlayBlur}%
              </span>
            </div>
            <input
              id="overlay-blur"
              type="range"
              min={0}
              max={100}
              value={overlayBlur}
              onChange={(e) => setOverlayBlur(Number(e.target.value))}
              className="w-full accent-pink-500"
            />
            <p className="text-xs text-white/40">
              How strong the frosted glass is over the preview (85% is the usual look).
            </p>
          </div>

          {/* Mini preview */}
          <div className="relative overflow-hidden rounded-xl border border-white/10">
            <div className="relative grid h-36 place-items-center">
              {videoUrl ? (
                <video
                  src={videoUrl}
                  className="absolute inset-0 h-full w-full object-cover"
                  muted
                  loop
                  playsInline
                  autoPlay
                />
              ) : profile.backgroundUrl ? (
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${profile.backgroundUrl})` }}
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-pink-950/40 to-zinc-900" />
              )}
              <div
                className="absolute inset-0 bg-black/40"
                style={{
                  backdropFilter: `blur(${Math.round((overlayBlur / 100) * 24)}px)`,
                  WebkitBackdropFilter: `blur(${Math.round((overlayBlur / 100) * 24)}px)`,
                }}
              />
              <p className="relative z-10 text-lg font-medium text-white/85">
                {overlayText || "Click to enter"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-[100] flex justify-center px-3 md:bottom-4">
        <button
          type="button"
          disabled={saving || uploading !== null}
          onClick={() => void save()}
          className={`${btnGradient} w-full max-w-md shadow-lg shadow-pink-900/30`}
        >
          {saving ? "Saving…" : "Save video & music"}
        </button>
      </div>
    </div>
  );
}
