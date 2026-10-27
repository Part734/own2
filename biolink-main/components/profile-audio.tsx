"use client";

import { useEffect, useRef } from "react";

/**
 * Tries to start background music as soon as the page loads.
 * Modern browsers often block unmuted autoplay until a user gesture;
 * we still attempt play() and retry on the first pointer/key interaction.
 */
export default function ProfileAudio({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !src) return;

    el.volume = 1;
    el.loop = true;

    const tryPlay = () => {
      void el.play().catch(() => {
        /* blocked — wait for gesture */
      });
    };

    tryPlay();

    const unlock = () => {
      tryPlay();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, [src]);

  return <audio ref={ref} src={src} loop preload="auto" className="hidden" />;
}
