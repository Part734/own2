"use client";

import { useEffect, useState } from "react";
import { WidgetFrost } from "./tile";
import { glassPanelStyle, type WidgetGlass } from "./glass";

const shell =
  "relative flex min-h-[120px] flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-[#151517] p-4 text-white";

interface RobloxData {
  id: number;
  username: string;
  displayName: string;
  description: string | null;
  avatarUrl: string | null;
  profileUrl: string;
}

export function RobloxWidget({
  config,
  glass = null,
}: {
  config: Record<string, string>;
  glass?: WidgetGlass | null;
}) {
  const username = (config.username ?? "").trim().replace(/^@/, "");
  const [data, setData] = useState<RobloxData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    setData(null);
    setError("");
    fetch(`/api/widgets/roblox?username=${encodeURIComponent(username)}`)
      .then((res) =>
        res.ok
          ? res.json()
          : res.json().then((b) => Promise.reject(new Error(b?.error)))
      )
      .then((body) => {
        if (!cancelled) setData(body as RobloxData);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Roblox unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (!username) {
    return (
      <div className={shell} style={glassPanelStyle(glass)}>
        <WidgetFrost glass={glass} />
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <p className="mt-auto text-xs text-white/45">
            Add your Roblox username in the dashboard to turn this on.
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={shell} style={glassPanelStyle(glass)}>
        <WidgetFrost glass={glass} />
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <div className="mt-auto flex animate-pulse items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white/10" />
            <div className="space-y-2">
              <div className="h-3.5 w-28 rounded bg-white/10" />
              <div className="h-3 w-20 rounded bg-white/10" />
            </div>
          </div>
          {error && <p className="mt-2 text-xs text-white/40">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={shell} style={glassPanelStyle(glass)}>
      <WidgetFrost glass={glass} />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-3">
          {data.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.avatarUrl}
              alt={data.displayName}
              className="h-12 w-12 shrink-0 rounded-xl bg-white/5 object-cover ring-1 ring-white/10"
            />
          ) : (
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 text-sm font-bold">
              {data.displayName[0]?.toUpperCase() ?? "R"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight text-white">
              {data.displayName}
            </p>
            <p className="truncate text-xs text-white/45">@{data.username}</p>
          </div>
        </div>

        {data.description ? (
          <p className="line-clamp-3 text-[13px] leading-relaxed text-white/65">
            {data.description}
          </p>
        ) : null}

        <a
          href={data.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/90 no-underline transition hover:bg-white/10"
        >
          View Profile
          <svg
            className="size-3.5 opacity-70"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 17 17 7" />
            <path d="M7 7h10v10" />
          </svg>
        </a>
      </div>
    </div>
  );
}
