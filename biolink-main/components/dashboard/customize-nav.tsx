"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { label: "Profile", href: "/dashboard/customize/profile" },
  { label: "Appearance", href: "/dashboard/customize/appearance" },
  { label: "Links", href: "/dashboard/links" },
  { label: "Badges", href: "/dashboard/badges" },
  { label: "Widgets", href: "/dashboard/customize/widgets" },
  { label: "Tracks", href: "/dashboard/customize/tracks" },
];

export default function CustomizeNav() {
  const pathname = usePathname();

  return (
    <nav className="-mx-4 overflow-x-auto px-4 pt-1.5 [scrollbar-width:none] lg:mx-0 lg:border-b lg:pt-3 [&::-webkit-scrollbar]:hidden">
      <ul className="flex min-w-max flex-row flex-nowrap items-center gap-1.5 sm:gap-2">
        {items.map((item) => {
          const isActive = pathname === item.href;
          return (
            <li key={item.href} className="relative pb-1.5 lg:pb-2">
              <Link
                href={item.href}
                className={`flex items-center gap-2.5 rounded-md border-b border-b-transparent px-3 py-2 text-sm font-semibold duration-300 sm:py-1.5 ${
                  isActive
                    ? "bg-white/5 text-white"
                    : "text-white/50 hover:bg-white/5 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
              {isActive ? (
                <div className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-pink-500" />
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
