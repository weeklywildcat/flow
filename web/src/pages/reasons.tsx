import * as React from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, ArrowDown01Icon, ArrowUp01Icon, Cancel01Icon, Coffee01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { PageBody, StatusBadge, errorMessage } from "@/components/common"
import { post, type CafeMode, type ReasonSetting, type ReasonSettings } from "@/lib/api"
import { useCachedGet } from "@/lib/cache"
import { useDashboard } from "@/lib/dashboard"
import { cn } from "@/lib/utils"

const NO_PARAMS = {}
const MAX_REASONS = 12
const MAX_REASON_LENGTH = 30

const CAFE_MODES: { value: CafeMode; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "Opens on its own schedule" },
  { value: "on", label: "On", hint: "Open until you turn it off" },
  { value: "off", label: "Off", hint: "Never shown" },
]

export function ReasonsPage() {
  const settings = useCachedGet<ReasonSettings>("admin-reasons", NO_PARAMS)
  const data = settings.data

  return (
    <PageBody>
      <div className="grid gap-4 md:gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        {data ? <CafeCard settings={data} onSaved={() => void settings.refresh()} /> : <Skeleton className="h-56 w-full" />}
        {data ? <ReasonsCard settings={data} onSaved={() => void settings.refresh()} /> : <Skeleton className="h-96 w-full" />}
      </div>
    </PageBody>
  )
}

function CafeCard({ settings, onSaved }: { settings: ReasonSettings; onSaved: () => void }) {
  const { invalidate } = useDashboard()
  const [pending, setPending] = React.useState<CafeMode | null>(null)

  async function choose(mode: CafeMode) {
    if (pending || mode === settings.cafeMode) return
    setPending(mode)
    try {
      // Only the mode changes here; any unsaved edits in the reasons list are left alone.
      await post<ReasonSettings>("admin-reasons", { reasons: settings.reasons, cafeMode: mode })
      invalidate()
      onSaved()
      toast.success(mode === "on" ? `${settings.cafeName} is on` : mode === "off" ? `${settings.cafeName} is off` : `${settings.cafeName} is back on its schedule`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(null)
    }
  }

  return (
    <Card size="sm" className="self-start">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon icon={Coffee01Icon} strokeWidth={2} className="size-4 text-primary" />
          {settings.cafeName}
        </CardTitle>
        <CardDescription>
          A priority option: while it is open, it shows first and larger on every kiosk, and students see a welcome after checking in.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Right now</span>
          <StatusBadge tone={settings.cafeActive ? "good" : "muted"}>{settings.cafeActive ? "Showing on kiosks" : "Not showing"}</StatusBadge>
        </div>
        <div role="radiogroup" aria-label={`${settings.cafeName} mode`} className="grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1">
          {CAFE_MODES.map((mode) => {
            const selected = (pending ?? settings.cafeMode) === mode.value
            return (
              <button
                key={mode.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={pending !== null}
                onClick={() => void choose(mode.value)}
                className={cn(
                  "flex h-9 items-center justify-center gap-1.5 rounded-xl text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-wait",
                  selected ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {pending === mode.value ? <Spinner className="size-3.5" /> : null}
                {mode.label}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {CAFE_MODES.find((mode) => mode.value === settings.cafeMode)?.hint}. Auto means {settings.cafeSchedule}.
        </p>
      </CardContent>
    </Card>
  )
}

function ReasonsCard({ settings, onSaved }: { settings: ReasonSettings; onSaved: () => void }) {
  const { invalidate } = useDashboard()
  const [draft, setDraft] = React.useState<ReasonSetting[]>(settings.reasons)
  const [newName, setNewName] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  // A save from elsewhere (or the cafe toggle refreshing) should not wipe edits in progress.
  const saved = JSON.stringify(settings.reasons)
  const lastSaved = React.useRef(saved)
  React.useEffect(() => {
    if (lastSaved.current === saved) return
    lastSaved.current = saved
    setDraft(settings.reasons)
  }, [saved, settings.reasons])

  const dirty = JSON.stringify(draft) !== saved
  const enabledCount = draft.filter((reason) => reason.enabled).length
  const trimmedNew = newName.trim()

  function update(index: number, change: Partial<ReasonSetting>) {
    setDraft((list) => list.map((reason, i) => (i === index ? { ...reason, ...change } : reason)))
  }

  function move(index: number, by: -1 | 1) {
    setDraft((list) => {
      const target = index + by
      if (target < 0 || target >= list.length) return list
      const next = [...list]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function add() {
    if (!trimmedNew) return
    if (draft.some((reason) => reason.name.trim().toLowerCase() === trimmedNew.toLowerCase())) {
      toast.error(`"${trimmedNew}" is already in the list.`)
      return
    }
    setDraft((list) => [...list, { name: trimmedNew, enabled: true }])
    setNewName("")
  }

  async function save() {
    setSaving(true)
    try {
      await post<ReasonSettings>("admin-reasons", {
        reasons: draft.map((reason) => ({ ...reason, name: reason.name.trim() })),
        cafeMode: settings.cafeMode,
      })
      invalidate()
      onSaved()
      toast.success("Reasons saved")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Check-in reasons</CardTitle>
        <CardDescription>
          Students pick one of the reasons turned on here. Turning one off hides it from kiosks but keeps it in past visits.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {draft.map((reason, index) => (
          <div key={index} className="flex items-center gap-2">
            <Checkbox
              checked={reason.enabled}
              onCheckedChange={(checked) => update(index, { enabled: checked === true })}
              aria-label={`Show ${reason.name || "this reason"} on kiosks`}
            />
            <Input
              value={reason.name}
              maxLength={MAX_REASON_LENGTH}
              onChange={(event) => update(index, { name: event.target.value })}
              aria-label="Reason name"
              className={cn("h-9", !reason.enabled && "text-muted-foreground")}
            />
            <Button variant="ghost" size="icon-sm" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${reason.name} up`}>
              <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => move(index, 1)} disabled={index === draft.length - 1} aria-label={`Move ${reason.name} down`}>
              <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setDraft((list) => list.filter((_, i) => i !== index))}
              aria-label={`Remove ${reason.name}`}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
          </div>
        ))}
        {draft.length < MAX_REASONS ? (
          <form
            className="mt-2 flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              add()
            }}
          >
            <Input
              value={newName}
              maxLength={MAX_REASON_LENGTH}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Add a reason, like Tutoring"
              aria-label="New reason"
              className="h-9"
            />
            <Button type="submit" variant="outline" disabled={!trimmedNew}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              Add
            </Button>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">That is the most reasons a kiosk can show ({MAX_REASONS}).</p>
        )}
      </CardContent>
      <CardFooter className="justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {enabledCount === 0 ? "Keep at least one reason turned on." : `${enabledCount} showing on kiosks`}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => setDraft(settings.reasons)}>
            Discard
          </Button>
          <Button disabled={!dirty || saving || enabledCount === 0 || draft.some((reason) => !reason.name.trim())} onClick={() => void save()}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            Save changes
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
