import React from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Sidebar from "./sidebar";
import MobileNav from "./mobile-nav";

export default async function DashboardShell({
  children,
}: {
  title?: string;
  icon?: React.ReactNode;
  subnav?: React.ReactNode;
  maxWidth?: string;
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/register");

  return (
    <div className="flex min-h-svh w-full bg-[#080808]">
      <Sidebar session={session} />
      <MobileNav username={session.username ?? ""} />
      <main
        id="mainContent"
        className="w-full overflow-x-hidden px-4 pt-[76px] sm:px-6 md:px-[45px] md:pl-[345px] md:pt-[45px]"
        style={{
          // Room for mobile bottom tab bar + floating save bar + home indicator.
          paddingBottom:
            "max(6rem, calc(4rem + env(safe-area-inset-bottom, 0px)))",
        }}
      >
        {children}
      </main>
    </div>
  );
}
