import { notFound } from "next/navigation";
import {
  db,
  ensureAliasesSchema,
  ensureAnalyticsSchema,
  ensureProfileSchema,
  ensureSocialLinksSchema,
  ensureUserBadgeSchema,
} from "@/lib/db";
import {
  aliases,
  users,
  links,
  pageViews,
  profiles,
  socialLinks,
  userBadges,
  badges,
} from "@/lib/schema";
import { headers } from "next/headers";
import { enrichVisitorGeo, getVisitorInfo, viewCooldownCutoff } from "@/lib/analytics";
import { and, eq, gte, sql } from "drizzle-orm";
import { resolveColor, withAlpha } from "@/lib/color";
import ProfileOverlay from "@/components/profile-overlay";
import ProfileAudio from "@/components/profile-audio";
import TiltCard from "@/components/tilt-card";
import ParallaxCard from "@/components/parallax-card";
import ProfileCard from "@/components/profile/profile-card";
import { ProfileWidgets, WIDGET_TEMPLATES } from "@/components/profile/widgets";
import { cardGlass } from "@/components/profile/widgets/glass";
import ProfileScroller from "@/components/profile/profile-scroller";
import { getPremiumStatus } from "@/lib/premium";
import { ensureDefaultBadges, ensurePremiumBadge } from "@/lib/badges";
import { getEnabledWidgets } from "@/lib/widgets";
import { getFeedback, getVoterIp } from "@/lib/feedback";

export async function generateMetadata(
  props: { params: Promise<{ username: string }> }
) {
  const { username } = await props.params;

  return {
    title: `${username} — crying.wiki`,
  };
}

export default async function UserProfilePage(
  props: { params: Promise<{ username: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }
) {
  const { username } = await props.params;
  const search = (await props.searchParams) ?? {};
  const previewTemplateId =
    search.templatePreview === "true" && typeof search.templateId === "string" ? search.templateId : null;

  await Promise.all([ensureAliasesSchema(), ensureAnalyticsSchema()]);

  let [user] = await db
    .select({
      id: users.id,
      username: users.username,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.username, username));

  // Alias support: /alias redirects to the owner's profile data.
  if (!user) {
    try {
      const [aliasRow] = await db
        .select({ userId: aliases.userId })
        .from(aliases)
        .where(eq(aliases.alias, username));
      if (aliasRow) {
        const [owner] = await db
          .select({
            id: users.id,
            username: users.username,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.id, aliasRow.userId));
        if (owner) user = owner;
      }
    } catch {
      // aliases table may not exist yet on old DBs.
    }
  }

  if (!user) notFound();

  await Promise.all([
    ensureUserBadgeSchema(),
    ensureSocialLinksSchema(),
    ensureProfileSchema(),
    ensureDefaultBadges(),
  ]);
  await ensurePremiumBadge(user.id);

  // Template preview (?templatePreview=true&templateId=…): render-only
  // overlay, no DB writes and no analytics pollution.
  let previewSnap: {
    profile?: Record<string, unknown>;
    socials?: Array<{ platform: string; url: string; iconUrl?: string | null; order?: number }>;
    links?: Array<{ title: string; url: string }>;
  } | null = null;
  if (previewTemplateId) {
    try {
      const { ensureTemplatesSchema } = await import("@/lib/db");
      const { templates } = await import("@/lib/schema");
      await ensureTemplatesSchema();
      const [tpl] = await db.select({ snapshot: templates.snapshot }).from(templates).where(eq(templates.id, previewTemplateId));
      if (tpl?.snapshot) previewSnap = JSON.parse(tpl.snapshot);
    } catch {
      previewSnap = null;
    }
  }

  if (!previewSnap) {
    try {
      const visitor = await enrichVisitorGeo(getVisitorInfo(await headers()));
      // Cooldown: one counted view per IP per profile every N minutes.
      const cutoff = viewCooldownCutoff();
      const [recent] = await db
        .select({ id: pageViews.id })
        .from(pageViews)
        .where(
          and(
            eq(pageViews.userId, user.id),
            eq(pageViews.ip, visitor.ip),
            gte(pageViews.createdAt, cutoff)
          )
        )
        .limit(1)
        .catch(() => [] as Array<{ id: string }>);
      if (!recent) {
        await db
          .insert(pageViews)
          .values({
            userId: user.id,
            ip: visitor.ip,
            device: visitor.device,
            country: visitor.country,
            city: visitor.city,
            latitude: visitor.latitude == null ? null : String(visitor.latitude),
            longitude: visitor.longitude == null ? null : String(visitor.longitude),
            referrer: visitor.referrer,
            userAgent: visitor.userAgent,
          })
          .execute();
        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[views] ${username} <- ${visitor.ip} ${visitor.country}${visitor.city ? `/${visitor.city}` : ""}`
          );
        }
      } else if (process.env.NODE_ENV !== "production") {
        console.log(`[views] ${username} <- ${visitor.ip} skipped (cooldown)`);
      }
    } catch {
      await db.insert(pageViews).values({ userId: user.id }).execute();
    }
  }

  const [profileRow] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id));

  const STYLE_KEYS = new Set([
    "layout", "blur", "cardBlur", "overlayEnabled", "overlayText",
    "tiltEnabled", "tiltMode", "borderRadius", "borderWidth",
    "cardOpacity", "borderOpacity", "cardWidth", "cardBlurEnabled",
    "avatarShape", "showViews", "viewsPosition", "badgesPosition",
    "customLayout", "accentColor", "primaryColor", "textColor",
    "borderColor", "backgroundColor", "badgeColor", "socialColor",
    "linkHoverColor", "glowEnabled", "usernameGlow", "usernameColor",
    "gradientEnabled", "gradientPrimary", "gradientSecondary",
    "showFeedback", "avatarHidden",
  ]);
  const profile = (previewSnap?.profile
    ? { ...(profileRow ?? {}), ...Object.fromEntries(Object.entries(previewSnap.profile).filter(([k]) => STYLE_KEYS.has(k))) }
    : profileRow) as typeof profileRow | undefined;

  const userLinks = previewSnap?.links
    ? previewSnap.links.slice(0, 25).map((l, i) => ({ id: `preview-${i}`, title: String(l.title ?? "Link"), url: String(l.url ?? "") }))
    : await db
        .select()
        .from(links)
        .where(eq(links.userId, user.id))
        .orderBy(sql`${links.createdAt} desc`);

  const userSocials = previewSnap?.socials
    ? previewSnap.socials.slice(0, 30).map((s, i) => ({
        id: `preview-${i}`,
        platform: String(s.platform ?? "custom"),
        url: String(s.url ?? ""),
        iconUrl: s.iconUrl ?? null,
        order: i,
      }))
    : await db
        .select({
          id: socialLinks.id,
          platform: socialLinks.platform,
          url: socialLinks.url,
          iconUrl: socialLinks.iconUrl,
          order: socialLinks.order,
        })
        .from(socialLinks)
        .where(eq(socialLinks.userId, user.id))
        .orderBy(socialLinks.order);

  const userBadgesList = await db
    .select({
      id: badges.id,
      name: badges.name,
      iconPrefix: badges.iconPrefix,
      iconName: badges.iconName,
      iconUrl: badges.iconUrl,
      color: badges.color,
      userColor: userBadges.color,
      position: userBadges.position,
      userGlow: userBadges.glow,
    })
    .from(userBadges)
    .innerJoin(badges, eq(userBadges.badgeId, badges.id))
    .where(and(eq(userBadges.userId, user.id), eq(userBadges.hidden, 0)))
    .orderBy(userBadges.position, badges.name)
    .then((rows) =>
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        iconPrefix: row.iconPrefix,
        iconName: row.iconName,
        iconUrl: row.iconUrl,
        color: row.userColor ?? row.color,
        glow: row.userGlow == null ? true : row.userGlow !== 0,
      }))
    );

  const showViews =
    profile?.showViews == null ? true : Number(profile.showViews) !== 0;

  let viewCount = 0;

  if (showViews) {
    const [count] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(pageViews)
      .where(eq(pageViews.userId, user.id));

    viewCount = count?.count ?? 0;
  }

  /* ---------------- page chrome (background, tilt, overlay) ---------------- */

  const backgroundBlur = profile?.blur ?? 0;
  const overlayEnabled = !!profile?.overlayEnabled;
  const overlayText = profile?.overlayText ?? "Click to show";
  const tiltEnabled = !!profile?.tiltEnabled;
  const tiltMode = profile?.tiltMode ?? "tilt";

  const primaryColor = resolveColor(
    profile?.primaryColor ?? profile?.accentColor,
    "#ffffff"
  );

  const backgroundColor = resolveColor(profile?.backgroundColor, "#111111");

  const gradientOn = Number(profile?.gradientEnabled ?? 0) !== 0;
  const gradientPrimary = resolveColor(profile?.gradientPrimary, "#881c9c");
  const gradientSecondary = resolveColor(profile?.gradientSecondary, "#0d0d0d");
  const pageBackground = gradientOn
    ? `linear-gradient(135deg, ${gradientPrimary}, ${gradientSecondary})`
    : undefined;

  const linkHoverAccent = resolveColor(
    profile?.linkHoverColor,
    primaryColor
  );

  // Custom (free-move) layout is Premium-only — visitors never see it
  // for users without an active subscription, even if it is stored.
  const premium = await getPremiumStatus(user.id);
  const effectiveProfile = !premium.isPremium && profile?.customLayout
    ? { ...profile, customLayout: null }
    : profile;

  const feedback = await getFeedback(user.id, await getVoterIp());
  const widgets = await getEnabledWidgets(user.id);

  const card = (
    <ProfileCard
      user={user}
      profile={effectiveProfile ?? null}
      badges={userBadgesList}
      socials={userSocials}
      links={userLinks}
      viewCount={viewCount}
      feedback={feedback}
    />
  );

  const mainCard =
    tiltMode === "parallax" ? (
      <ParallaxCard enabled={tiltEnabled} maxTilt={10} perspective={1000}>
        {card}
      </ParallaxCard>
    ) : tiltMode === "tilt" ? (
      <TiltCard
        enabled={tiltEnabled}
        maxTilt={12}
        perspective={1000}
        scale={1.015}
      >
        {card}
      </TiltCard>
    ) : (
      card
    );

  const glass = cardGlass(effectiveProfile ?? null);
  const cardWidth = profile?.cardWidth ?? 420;
  const sectionsOn = Number(profile?.sectionsEnabled ?? 0) !== 0;

  const aboutText =
    (profile?.bio || profile?.description || "").trim() || null;

  const aboutPanel = aboutText ? (
    <div
      className="w-full max-w-md rounded-2xl border border-white/10 bg-black/40 p-6 text-left shadow-2xl backdrop-blur-md"
      style={{ width: Math.min(cardWidth, 420) }}
    >
      <h2 className="mb-3 text-center text-lg font-semibold tracking-tight text-white">
        about me
      </h2>
      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/80">
        {aboutText}
      </p>
    </div>
  ) : null;

  const widgetPanels = sectionsOn
    ? widgets.map((w) => {
        const tpl = WIDGET_TEMPLATES.find((t) => t.type === w.type);
        if (!tpl) return null;
        const Comp = tpl.Component;
        return (
          <div
            key={w.type}
            className="w-full"
            style={{ width: Math.min(cardWidth, 420) }}
          >
            <Comp config={w.config} glass={glass} />
          </div>
        );
      })
    : [];

  const videoUrl = profile?.videoUrl ?? null;
  const audioUrl = profile?.audioUrl ?? null;
  const overlayBlur = Number(profile?.overlayBlur ?? 85);

  const backgroundLayer = videoUrl ? (
    <div className="absolute inset-0 overflow-hidden">
      <video
        src={videoUrl}
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined,
          transform: backgroundBlur > 0 ? "scale(1.05)" : undefined,
        }}
        muted
        loop
        playsInline
        autoPlay
      />
      <div className="absolute inset-0 bg-black/50" />
    </div>
  ) : profile?.backgroundUrl ? (
    <div
      className="absolute inset-0 bg-cover bg-center transition-all"
      style={{
        backgroundImage: `url(${profile.backgroundUrl})`,
        filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined,
        transform: backgroundBlur > 0 ? "scale(1.03)" : undefined,
      }}
    >
      <div className="absolute inset-0 bg-black/50" />
    </div>
  ) : (
    <div
      className="absolute inset-0"
      style={{
        backgroundColor: gradientOn ? gradientSecondary : backgroundColor,
        backgroundImage:
          pageBackground ??
          `radial-gradient(circle at 20% 20%, ${withAlpha(
            primaryColor,
            0.16
          )}, transparent 50%), radial-gradient(circle at 80% 80%, ${withAlpha(
            linkHoverAccent,
            0.1
          )}, transparent 50%)`,
      }}
    />
  );

  const profileContent = (
    <div
      className="relative min-h-screen overflow-hidden font-sans"
      style={{ backgroundColor }}
    >
      {backgroundLayer}

      {sectionsOn ? (
        <div className="relative">
          <ProfileScroller>
            {[
              mainCard,
              aboutPanel,
              ...widgetPanels.filter(Boolean),
            ].filter(Boolean)}
          </ProfileScroller>
        </div>
      ) : (
        <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
          {mainCard}
          <ProfileWidgets
            widgets={widgets}
            width={cardWidth}
            glass={glass}
          />
        </div>
      )}
    </div>
  );

  // Optional enter screen. Music also tries to autoplay on visit when overlay is off.
  if (overlayEnabled) {
    return (
      <ProfileOverlay
        overlayText={overlayText || "Click to enter"}
        overlayBlur={overlayBlur}
        audioUrl={audioUrl}
        videoUrl={videoUrl}
        backgroundUrl={profile?.backgroundUrl ?? null}
      >
        {profileContent}
      </ProfileOverlay>
    );
  }

  return (
    <>
      {audioUrl ? <ProfileAudio src={audioUrl} /> : null}
      {profileContent}
    </>
  );
}
