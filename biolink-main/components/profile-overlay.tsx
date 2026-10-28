"use client";

import { useEffect, useRef, useState } from "react";

export default function ProfileOverlay({
  overlayText,
  overlayBlur = 85,
  audioUrl = null,
  videoUrl = null,
  backgroundUrl = null,
  children,
}: {
  overlayText: string;
  /** 0–100, maps to backdrop-filter blur */
  overlayBlur?: number;
  audioUrl?: string | null;
  videoUrl?: string | null;
  backgroundUrl?: string | null;
  children: React.ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!audioUrl) return;
    const el = audioRef.current;
    if (el) el.load();
  }, [audioUrl]);

  async function enter() {
    setRevealed(true);
    try {
      if (audioUrl && audioRef.current) {
        audioRef.current.volume = 1;
        await audioRef.current.play();
      } else if (!audioUrl && videoUrl && audioVideoRef.current) {
        audioVideoRef.current.muted = false;
        await audioVideoRef.current.play();
      }
    } catch {
      // Playback blocked or failed — ignore.
    }
  }

  const blurPx = Math.round((Math.min(100, Math.max(0, overlayBlur)) / 100) * 24);

  const mediaElements = (
    <>
      {audioUrl ? (
        <audio ref={audioRef} src={audioUrl} loop preload="auto" className="hidden" />
      ) : null}
      {!audioUrl && videoUrl ? (
        <video
          ref={audioVideoRef}
          src={videoUrl}
          loop
          playsInline
          preload="auto"
          className="hidden"
        />
      ) : null}
    </>
  );

  if (revealed) {
    return (
      <>
        {mediaElements}
        {children}
      </>
    );
  }

  return (
    <>
      {mediaElements}
      <button
        type="button"
        onClick={enter}
        className="group relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-zinc-950 font-sans text-white"
        aria-label={overlayText || "Click to enter"}
      >
        {videoUrl ? (
          <video
            src={videoUrl}
            className="absolute inset-0 h-full w-full object-cover"
            muted
            loop
            playsInline
            autoPlay
          />
        ) : backgroundUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${backgroundUrl})` }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-pink-950/30 via-zinc-950 to-zinc-950" />
        )}

        <div
          className="absolute inset-0 bg-black/40"
          style={{
            backdropFilter: `blur(${blurPx}px)`,
            WebkitBackdropFilter: `blur(${blurPx}px)`,
          }}
        />

        <div className="relative z-10 flex flex-col items-center gap-3 px-8 py-16">
          <p className="text-center text-2xl font-medium tracking-wide text-white/80 transition group-hover:text-white sm:text-3xl">
            {overlayText || "Click to enter"}
          </p>
          <span className="text-xs text-white/40">tap anywhere</span>
        </div>
      </button>
    </>
  );
}
