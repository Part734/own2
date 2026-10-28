"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ScrollerPanel = {
  key: string;
  node: ReactNode;
  background?: string | null;
};

export default function ProfileScroller({
  panels,
}: {
  panels: ScrollerPanel[];
}) {
  const list = panels.filter((p) => p?.node);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || list.length === 0) return;
    const idx = Math.round(el.scrollTop / Math.max(el.clientHeight, 1));
    setActive(Math.max(0, Math.min(list.length - 1, idx)));
  }, [list.length]);

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
    el.scrollTo({ top: index * el.clientHeight, behavior: "smooth" });
  }

  if (list.length <= 1) {
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[100vw] items-center justify-center overflow-x-hidden px-3 py-8">
        <div className="w-full max-w-[min(400px,calc(100vw-1.5rem))]">{list[0]?.node ?? null}</div>
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] w-full max-w-[100vw] overflow-hidden">
      <div
        ref={scrollerRef}
        className="h-full w-full snap-y snap-mandatory overflow-x-hidden overflow-y-auto overscroll-y-contain scroll-smooth"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {list.map((panel, i) => (
          <section
            key={panel.key || i}
            className="relative box-border flex h-[100dvh] w-full max-w-[100vw] snap-start snap-always items-center justify-center overflow-hidden px-3 pb-24 pt-8"
          >
            {panel.background ? (
              <div
                className="pointer-events-none absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${panel.background})` }}
              >
                <div className="absolute inset-0 bg-black/50" />
              </div>
            ) : null}
            <div className="relative z-10 box-border flex max-h-[calc(100dvh-7rem)] w-full max-w-[min(400px,calc(100vw-1.5rem))] flex-col items-stretch justify-center overflow-x-hidden overflow-y-auto">
              {panel.node}
            </div>
          </section>
        ))}
      </div>

      <div
        className="pointer-events-none absolute inset-y-0 right-2 z-30 flex flex-col items-center justify-center gap-2.5 sm:right-3"
        aria-label="Profile sections"
      >
        {list.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Go to section ${i + 1}`}
            aria-current={active === i}
            onClick={() => goTo(i)}
            className={`pointer-events-auto h-2 w-2 shrink-0 rounded-full transition-all ${
              active === i ? "scale-125 bg-white" : "bg-white/35 hover:bg-white/60"
            }`}
          />
        ))}
      </div>

      {active < list.length - 1 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-14 z-20 flex justify-center">
          <span className="text-[12px] text-white/40">Scroll for more ↓</span>
        </div>
      ) : null}
    </div>
  );
}
