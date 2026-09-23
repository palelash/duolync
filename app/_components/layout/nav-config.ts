import {
  Home, Search, MessageSquare, Heart, Sparkles,
  Compass, FileText, FolderOpen, Megaphone, Radio, Mail,
  BarChart3,
} from "lucide-react";

export interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
}

export const BRAND_NAV_ITEMS: NavItem[] = [
  { icon: Home,         label: "Dashboard",    path: "/brand/dashboard" },
  { icon: Search,       label: "Discover",     path: "/brand/discover" },
  { icon: Sparkles,     label: "Smart Match",  path: "/brand/smart-match" },
  { icon: FileText,     label: "Proposals",    path: "/brand/proposals" },
  { icon: Megaphone,    label: "Campaigns",    path: "/brand/campaigns" },
  { icon: Heart,        label: "Saved",        path: "/brand/saved" },
  { icon: MessageSquare,label: "Messages",     path: "/messages" },
];

export const CREATOR_NAV_ITEMS: NavItem[] = [
  { icon: Home,         label: "Dashboard",          path: "/creator/dashboard" },
  { icon: Megaphone,    label: "Campaigns",           path: "/creator/campaigns" },
  { icon: Radio,        label: "Social Connections",  path: "/creator/presence" },
  { icon: Search,       label: "Discover",            path: "/creator/discover" },
  { icon: BarChart3,    label: "Analytics",           path: "/creator/analytics" },
  { icon: FileText,     label: "My Applications",     path: "/creator/applications" },
  { icon: Mail,         label: "Invitations",         path: "/creator/invitations" },
  { icon: Heart,        label: "Saved",               path: "/creator/saved" },
  { icon: MessageSquare,label: "Messages",            path: "/messages" },
];
