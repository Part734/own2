"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Vertical full-page sections with side dots (halo.rip style).
 * Each child is one snap panel. Turn off from customize → sections disabled
 * falls back to the normal stacked layout (this component is simply not used).
 */
export default function ProfileScroller({
  children,
}: {
  children: ReactNode[];
}) {
  const panels = children.filter(Boolean);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || panels.length === 0) return;
    const idx = Math.round(el.scrollTop / Math.max(el.clientHeight, 1));
    setActive(Math.max(0, Math.min(panels.length - 1, idx)));
  }, [panels.length]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  function goTo(index: number) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({
      top: index * el.clientHeight,
      behavior: "smooth",
    });
  }

  if (panels.length <= 1) {
    return <>{panels[0] ?? null}</>;
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <div
        ref={scrollerRef}
        className="h-full w-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain scroll-smooth"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {panels.map((panel, i) => (
          <section
            key={i}
            className="flex h-[100dvh] w-full snap-start snap-always items-center justify-center px-4 py-8"
          >
            <div className="flex max-h-full w-full max-w-lg flex-col items-center justify-center overflow-y-auto">
              {panel}
            </div>
          </section>
        ))}
      </div>

      {/* Side dots */}
      <div
        className="pointer-events-none absolute inset-y-0 right-3 z-20 flex flex-col items-center justify-center gap-2 sm:right-5"
        aria-label="Profile sections"
      >
        {panels.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Go to section ${i + 1}`}
            aria-current={active === i}
            onClick={() => goTo(i)}
            className={`pointer-events-auto h-2 w-2 rounded-full transition-all duration-300 ${
              active === i
                ? "scale-125 bg-white shadow-[0_0_12px_rgba(255,255,255,0.55)]"
                : "bg-white/35 hover:bg-white/60"
            }`}
          />
        ))}
      </div>

      {active < panels.length - 1 ? (
        <button
          type="button"
          onClick={() => goTo(active + 1)}
          className="pointer-events-auto absolute bottom-5 left-1/2 z-20 -translate-x-1/2 text-[11px] font-medium tracking-wide text-white/55 transition hover:text-white/85"
        >
          Scroll for more
          <span className="mt-0.5 block animate-bounce text-center text-sm">↓</span>
        </button>
      ) : null}
    </div>
  );
}
