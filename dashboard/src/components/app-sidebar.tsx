import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  Analytics01Icon,
  Clock01Icon,
  ComputerIcon,
  LinkSquare02Icon,
  StudentsIcon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { FlowMark } from "@/components/flow-mark"
import { PAGES, useDashboard, type PageId } from "@/lib/dashboard"

const GROUPS: { label: string; items: { id: PageId; icon: IconSvgElement }[] }[] = [
  { label: "Live", items: [{ id: "now", icon: UserMultiple02Icon }] },
  {
    label: "Records",
    items: [
      { id: "visits", icon: Clock01Icon },
      { id: "students", icon: StudentsIcon },
    ],
  },
  { label: "Insights", items: [{ id: "insights", icon: Analytics01Icon }] },
  { label: "System", items: [{ id: "devices", icon: ComputerIcon }] },
]

export function AppSidebar() {
  const { page, setPage, currentCount } = useDashboard()
  const { isMobile, setOpenMobile } = useSidebar()

  function go(id: PageId) {
    setPage(id)
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" onClick={() => go("now")} tooltip="Flow">
              <FlowMark className="size-8" />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold">Flow</span>
                <span className="truncate text-xs text-muted-foreground">NSHS Library</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={page === item.id}
                      tooltip={PAGES[item.id].title}
                      onClick={() => go(item.id)}
                    >
                      <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                      <span>{PAGES[item.id].title}</span>
                    </SidebarMenuButton>
                    {item.id === "now" && currentCount !== null ? (
                      <SidebarMenuBadge className="tabular-nums">{currentCount}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Open kiosk"
              render={<a href="/library/kiosk" target="_blank" rel="noopener" />}
            >
              <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={2} />
              <span>Open kiosk</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
