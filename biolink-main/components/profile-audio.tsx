"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Background music. Tries autoplay on load; if the browser blocks it,
 * starts on the first tap anywhere. Shows a small unmute control until playing.
 */
export default function ProfileAudio({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [needsTap, setNeedsTap] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !src) return;

    el.loop = true;
    el.volume = 1;

    const tryPlay = async () => {
      try {
        await el.play();
        setNeedsTap(false);
        return true;
      } catch {
        setNeedsTap(true);
        return false;
      }
    };

    void tryPlay();

    const unlock = () => {
      void tryPlay();
    };

    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, [src]);

  return (
    <>
      <audio ref={ref} src={src} loop preload="auto" playsInline className="hidden" />
      {needsTap ? (
        <button
          type="button"
          onClick={() => {
            const el = ref.current;
            if (!el) return;
            void el.play().then(() => setNeedsTap(false)).catch(() => {});
          }}
          className="fixed bottom-4 right-4 z-[80] rounded-full border border-white/20 bg-black/70 px-4 py-2 text-[13px] font-medium text-white backdrop-blur-md"
        >
          ▶ Play music
        </button>
      ) : null}
    </>
  );
}
