import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ComputerIcon, Moon02Icon, Search01Icon, Sun03Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useTheme } from "@/components/theme-provider"
import { SYNCED_EVENT } from "@/lib/api"
import { PAGES, useDashboard } from "@/lib/dashboard"
import { useNow } from "@/lib/hooks"

export function SiteHeader({ onSearch }: { onSearch: () => void }) {
  const { page } = useDashboard()
  const { title, description } = PAGES[page]

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 rounded-t-[inherit] border-b bg-background/85 px-4 backdrop-blur supports-backdrop-filter:bg-background/70">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-1 data-vertical:h-4 data-vertical:self-center" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold leading-tight">{title}</h1>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">{description}</p>
      </div>
      <SyncStatus />
      <Button
        variant="outline"
        className="hidden w-56 justify-start text-muted-foreground md:flex"
        onClick={onSearch}
      >
        <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
        <span className="flex-1 text-left">Find a student…</span>
        <Kbd>⌘K</Kbd>
      </Button>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onSearch} aria-label="Find a student">
        <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
      </Button>
      <ThemeMenu />
    </header>
  )
}

function SyncStatus() {
  const [syncedAt, setSyncedAt] = React.useState<number | null>(null)
  const now = useNow(5000)

  React.useEffect(() => {
    const onSynced = () => setSyncedAt(Date.now())
    window.addEventListener(SYNCED_EVENT, onSynced)
    return () => window.removeEventListener(SYNCED_EVENT, onSynced)
  }, [])

  const seconds = syncedAt === null ? null : Math.max(0, Math.floor((now - syncedAt) / 1000))
  const stale = seconds !== null && seconds > 90
  const label =
    seconds === null ? "Connecting…" : seconds < 10 ? "Live" : seconds < 60 ? `Updated ${seconds}s ago` : `Updated ${Math.floor(seconds / 60)}m ago`

  return (
    <div className="hidden items-center gap-2 pr-1 text-xs text-muted-foreground lg:flex" aria-live="polite">
      <span className="relative flex size-2">
        {!stale && seconds !== null ? (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
        ) : null}
        <span className={`relative inline-flex size-2 rounded-full ${stale || seconds === null ? "bg-muted-foreground/50" : "bg-primary"}`} />
      </span>
      {label}
    </div>
  )
}

function ThemeMenu() {
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Change theme" />}>
        <HugeiconsIcon icon={Sun03Icon} strokeWidth={2} className="dark:hidden" />
        <HugeiconsIcon icon={Moon02Icon} strokeWidth={2} className="hidden dark:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as typeof theme)}>
          <DropdownMenuRadioItem value="light">
            <HugeiconsIcon icon={Sun03Icon} strokeWidth={2} />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <HugeiconsIcon icon={Moon02Icon} strokeWidth={2} />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <HugeiconsIcon icon={ComputerIcon} strokeWidth={2} />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
