import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Boxes,
  Package,
  CalendarClock,
  Stamp,
  Settings,
  Leaf,
  ScrollText,
  FileBarChart,

} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";

const items = [
  { title: "Tableau de bord", url: "/dashboard", icon: LayoutDashboard, roles: null },
  { title: "Batches", url: "/batches", icon: Boxes, roles: null },
  { title: "Inventaire", url: "/inventory", icon: Package, roles: null },
  { title: "Événements", url: "/events", icon: CalendarClock, roles: null },
  { title: "Timbres d'accise", url: "/stamps", icon: Stamp, roles: null },
  { title: "Journal d'activité", url: "/activity", icon: ScrollText, roles: ["admin", "supervisor"] as const },
  { title: "Rapports mensuels", url: "/reports", icon: FileBarChart, roles: ["admin", "supervisor"] as const },
  { title: "Paramètres", url: "/settings", icon: Settings, roles: null },
];


export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { roles } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Leaf className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold">ONO Cannabis</span>
            <span className="text-xs text-muted-foreground">PostHarvest Companion</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items
                .filter((item) => !item.roles || item.roles.some((r) => roles.includes(r)))
                .map((item) => {
                const active = pathname === item.url || pathname.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link to={item.url} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

