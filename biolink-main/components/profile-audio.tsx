"use client";

import { useEffect, useRef, useState } from "react";

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
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[80] -translate-x-1/2 rounded-full border border-white/20 bg-black/75 px-4 py-2 text-[13px] font-medium text-white shadow-lg backdrop-blur-md"
        >
          ▶ Play music
        </button>
      ) : null}
    </>
  );
}
