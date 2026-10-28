"use client";

import { RobloxWidget } from "./widgets/roblox";
import { LanyardWidget } from "./widgets/lanyard";
import { glassPanelStyle, type WidgetGlass } from "./widgets/glass";

export type ProfileSection = {
  id: string;
  type: "profile" | "about" | "roblox" | "discord";
  title?: string;
  body?: string;
  username?: string;
  discordId?: string;
  background?: string | null;
};

export function AboutSectionPanel({
  title,
  body,
  glass,
}: {
  title?: string;
  body?: string;
  glass?: WidgetGlass | null;
}) {
  return (
    <div
      className="box-border w-full max-w-full overflow-hidden rounded-2xl border border-white/10 bg-black/55 p-4 text-left backdrop-blur-md"
      style={glass ? glassPanelStyle(glass) : undefined}
    >
      <h2 className="m-0 mb-3 break-words text-center text-[20px] font-semibold tracking-tight text-white">
        {title || "about me"}
      </h2>
      <p className="m-0 max-h-[45dvh] overflow-y-auto whitespace-pre-wrap break-words text-[14px] leading-relaxed text-white/85">
        {body || "Add your about text in Customize → Scroll sections."}
      </p>
    </div>
  );
}

export function RobloxSectionPanel({
  username,
  glass,
}: {
  username?: string;
  glass?: WidgetGlass | null;
}) {
  return (
    <div className="box-border w-full max-w-full overflow-hidden">
      <RobloxWidget config={{ username: username || "" }} glass={glass} />
    </div>
  );
}

export function DiscordSectionPanel({
  discordId,
  glass,
}: {
  discordId?: string;
  glass?: WidgetGlass | null;
}) {
  return (
    <div className="box-border w-full max-w-full overflow-hidden">
      <LanyardWidget config={{ discordId: discordId || "" }} glass={glass} />
    </div>
  );
}
