"use client";

import { ReactNode } from "react";
import AuthenticatedHeader from "./AuthenticatedHeader";
import GroupsPanel from "./GroupsPanel";
import BottomTabBar from "./BottomTabBar";
import { CommandPalette } from "@/app/_components/shared/CommandPalette";
import { LyncWidget } from "@/app/_components/shared/LyncWidget";
import { useAuth } from "@/hooks/useAuth";

interface MainLayoutProps {
  children: ReactNode;
  showGroupsPanel?: boolean;
}

const MainLayout = ({ children, showGroupsPanel = true }: MainLayoutProps) => {
  const { profile } = useAuth();

  return (
    <div
      className="min-h-screen bg-[#070709] text-zinc-50 transition-colors duration-300 flex flex-col"
      data-role={profile?.user_type ?? "creator"}
    >
      <AuthenticatedHeader />
      <div className="flex flex-1 items-stretch min-h-0">
        {showGroupsPanel && <GroupsPanel />}
        <main className="flex-1 min-w-0 overflow-y-auto pb-16 lg:pb-0">
          {children}
        </main>
      </div>
      <BottomTabBar />
      <CommandPalette />
      <LyncWidget />
    </div>
  );
};

export default MainLayout;
