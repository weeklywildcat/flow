import * as React from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Alert02Icon,
  CheckmarkCircle02Icon,
  Download04Icon,
  GoogleSheetIcon,
  LaptopIcon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { PageBody, StatusBadge, errorMessage, useConfirm } from "@/components/common"
import { ApiError, apiUrl, get, post, type KioskDevice, type SheetStatus } from "@/lib/api"
import { useDashboard } from "@/lib/dashboard"
import { useNow, useVisibleInterval } from "@/lib/hooks"
import { addDays, formatAgo, formatDateTime, formatDay, schoolYearStart, todayLocal } from "@/lib/format"
import { cn } from "@/lib/utils"

/** A kiosk pings every few minutes; ten minutes of silence means it is offline. */
const ONLINE_WINDOW_MS = 10 * 60 * 1000

export function DevicesPage() {
  return (
    <PageBody>
      <div className="grid gap-4 md:gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <KiosksCard />
        <div className="flex flex-col gap-4 md:gap-6">
          <SheetsCard />
          <ExportCard />
        </div>
      </div>
    </PageBody>
  )
}

function KiosksCard() {
  const confirm = useConfirm()
  const { invalidate } = useDashboard()
  const now = useNow(30000)
  const [devices, setDevices] = React.useState<KioskDevice[] | null>(null)
  const [pairOpen, setPairOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      setDevices((await get<{ devices: KioskDevice[] }>("kiosk-devices")).devices)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }, [])
  React.useEffect(() => void load(), [load])
  useVisibleInterval(() => void load(), 30000)

  const active = (devices ?? []).filter((device) => !device.revokedAt)
  const revoked = (devices ?? []).filter((device) => device.revokedAt)
  const online = active.filter((device) => device.lastSeenAt && now - new Date(device.lastSeenAt).getTime() < ONLINE_WINDOW_MS)

  function revoke(device: KioskDevice) {
    confirm({
      title: `Revoke ${device.name}?`,
      description: "This Chromebook stops working as a kiosk right away and needs a new pairing PIN to reconnect.",
      action: "Revoke kiosk",
      destructive: true,
      run: async () => {
        await post("kiosk-revoke", { deviceId: device.id })
        toast.success(`${device.name} revoked`)
        await load()
        invalidate()
      },
    })
  }

  return (
    <Card className="min-w-0 self-start">
      <CardHeader>
        <CardTitle>Kiosks</CardTitle>
        <CardDescription>
          {devices ? `${online.length} of ${active.length} paired Chromebooks online` : "Loading devices…"}
        </CardDescription>
        <CardAction>
          <Button onClick={() => setPairOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            Pair kiosk
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {!devices ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : devices.length ? (
          <ul className="flex flex-col gap-2">
            {[...active, ...revoked].map((device) => {
              const isOnline = online.includes(device)
              return (
                <li
                  key={device.id}
                  className={cn("flex items-center gap-4 rounded-2xl border p-3", device.revokedAt && "opacity-60")}
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl",
                      isOnline ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    )}
                  >
                    <HugeiconsIcon icon={LaptopIcon} strokeWidth={2} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{device.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {device.revokedAt
                        ? `Revoked ${formatDay(device.revokedAt)}`
                        : `Last seen ${formatAgo(device.lastSeenAt, now)} · paired ${formatDay(device.createdAt)}`}
                    </p>
                  </div>
                  <StatusBadge tone={device.revokedAt ? "muted" : isOnline ? "good" : "warn"}>
                    {device.revokedAt ? "Revoked" : isOnline ? "Online" : "Offline"}
                  </StatusBadge>
                  {!device.revokedAt ? (
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => revoke(device)}>
                      Revoke
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : (
          <Empty className="border border-dashed py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={LaptopIcon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>No kiosks yet</EmptyTitle>
              <EmptyDescription>Pair a Chromebook to start checking students in.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setPairOpen(true)}>Pair a kiosk</Button>
            </EmptyContent>
          </Empty>
        )}
      </CardContent>
      <PairDialog open={pairOpen} onOpenChange={setPairOpen} onPaired={load} />
    </Card>
  )
}

function PairDialog({ open, onOpenChange, onPaired }: { open: boolean; onOpenChange: (open: boolean) => void; onPaired: () => void }) {
  const [name, setName] = React.useState("")
  const [pairing, setPairing] = React.useState<{ pin: string; expiresAt: string; name: string } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const now = useNow(1000)

  React.useEffect(() => {
    if (open) {
      setName("")
      setPairing(null)
    }
  }, [open])

  async function generate(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      setPairing(await post("kiosk-pairing", { name: name.trim() }))
      onPaired()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const secondsLeft = pairing ? Math.max(0, Math.floor((new Date(pairing.expiresAt).getTime() - now) / 1000)) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {pairing ? (
          <>
            <DialogHeader>
              <DialogTitle>Enter this PIN on {pairing.name}</DialogTitle>
              <DialogDescription>Open the library kiosk on the Chromebook and type the PIN. It works once.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-2 rounded-3xl bg-primary/10 py-6">
              <span className="font-mono text-4xl font-semibold tracking-[0.2em] text-primary tabular-nums" aria-live="polite">
                {pairing.pin.slice(0, 4)} {pairing.pin.slice(4)}
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {secondsLeft
                  ? `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
                  : "This PIN has expired. Generate a new one."}
              </span>
            </div>
            <DialogFooter>
              {!secondsLeft ? (
                <Button variant="outline" onClick={() => setPairing(null)}>
                  New PIN
                </Button>
              ) : null}
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={generate} className="contents">
            <DialogHeader>
              <DialogTitle>Pair a kiosk</DialogTitle>
              <DialogDescription>Name the Chromebook so you can tell kiosks apart, then generate a one-time PIN.</DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="kiosk-name">Chromebook name</FieldLabel>
              <Input
                id="kiosk-name"
                required
                maxLength={80}
                autoFocus
                placeholder="Front desk Chromebook"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <FieldDescription>PINs expire after 10 minutes. Generating a new one cancels any unused PIN.</FieldDescription>
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? <Spinner /> : null}
                Generate PIN
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SheetsCard() {
  const [status, setStatus] = React.useState<SheetStatus | null>(null)
  const [syncing, setSyncing] = React.useState(false)
  const now = useNow(30000)

  const load = React.useCallback(async () => {
    try {
      setStatus(await get<SheetStatus>("sheet-status"))
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }, [])
  React.useEffect(() => void load(), [load])
  useVisibleInterval(() => void load(), 60000)

  async function sync() {
    setSyncing(true)
    try {
      const result = await post<SheetStatus & { attempted: number; synced: number; failed: number }>("sync-sheets")
      setStatus(result)
      if (!result.attempted) toast.success("Everything was already synced")
      else if (result.failed) toast.error(`${result.synced} synced, ${result.failed} still failing`)
      else toast.success(`${result.synced} event${result.synced === 1 ? "" : "s"} synced`)
    } catch (error) {
      toast.error(error instanceof ApiError && error.status === 503 ? "Google Sheets sync isn't configured on the Worker." : errorMessage(error))
      void load()
    } finally {
      setSyncing(false)
    }
  }

  const waiting = (status?.pending ?? 0) + (status?.exhausted ?? 0)
  const healthy = status?.configured && waiting === 0

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon icon={GoogleSheetIcon} strokeWidth={2} className="size-4 text-primary" />
          Google Sheets archive
        </CardTitle>
        <CardDescription>Every check-in and checkout is copied to the archive sheet.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!status ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            <div
              className={cn(
                "flex items-start gap-3 rounded-2xl p-3 text-sm",
                healthy ? "bg-primary/10" : "bg-amber-500/10"
              )}
            >
              <HugeiconsIcon
                icon={healthy ? CheckmarkCircle02Icon : Alert02Icon}
                strokeWidth={2}
                className={cn("mt-0.5 size-4 shrink-0", healthy ? "text-primary" : "text-amber-700 dark:text-amber-400")}
              />
              <div className="min-w-0">
                <p className="font-medium">
                  {!status.configured
                    ? "Not configured"
                    : healthy
                      ? "Up to date"
                      : `${waiting} event${waiting === 1 ? "" : "s"} waiting to sync`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {!status.configured
                    ? "Add SHEETS_WEBHOOK_URL and SHEETS_WEBHOOK_SECRET to the Worker."
                    : status.exhausted
                      ? `${status.exhausted} stopped retrying automatically. Sync now retries them.`
                      : "Pending events retry every five minutes."}
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Last synced</dt>
                <dd className="font-medium" title={formatDateTime(status.lastSyncedAt)}>{formatAgo(status.lastSyncedAt, now)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last event</dt>
                <dd className="font-medium" title={formatDateTime(status.lastQueuedAt)}>{formatAgo(status.lastQueuedAt, now)}</dd>
              </div>
            </dl>
            {status.lastError ? (
              <p className="rounded-xl bg-muted/60 px-3 py-2 font-mono text-[11px] break-words text-muted-foreground">{status.lastError}</p>
            ) : null}
          </>
        )}
      </CardContent>
      <CardFooter>
        <Button variant="outline" className="w-full" disabled={syncing || !status?.configured} onClick={sync}>
          {syncing ? <Spinner /> : <HugeiconsIcon icon={Refresh01Icon} strokeWidth={2} data-icon="inline-start" />}
          Sync now
        </Button>
      </CardFooter>
    </Card>
  )
}

function ExportCard() {
  const today = todayLocal()
  const [from, setFrom] = React.useState(today.slice(0, 8) + "01")
  const [to, setTo] = React.useState(today)
  const tooLong = Boolean(from && to) && addDays(from, 366) < to
  const invalid = !from || !to || from > to || tooLong

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Export visits</CardTitle>
        <CardDescription>Download a CSV in Eastern time. Archived visits are left out.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            { label: "This month", from: today.slice(0, 8) + "01" },
            { label: "Last 30 days", from: addDays(today, -29) },
            { label: "School year", from: schoolYearStart(today) },
          ].map((preset) => (
            <Button
              key={preset.label}
              size="xs"
              variant={from === preset.from && to === today ? "secondary" : "ghost"}
              onClick={() => {
                setFrom(preset.from)
                setTo(today)
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <FieldLabel htmlFor="export-from">From</FieldLabel>
            <Input id="export-from" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="export-to">To</FieldLabel>
            <Input id="export-to" type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)} />
          </Field>
        </div>
        {tooLong ? <p className="text-xs text-destructive">Choose a range of one year or less.</p> : null}
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          disabled={invalid}
          nativeButton={false}
          render={<a href={invalid ? undefined : apiUrl("export-csv", { from, to })} download />}
        >
          <HugeiconsIcon icon={Download04Icon} strokeWidth={2} data-icon="inline-start" />
          Download CSV
        </Button>
      </CardFooter>
    </Card>
  )
}
