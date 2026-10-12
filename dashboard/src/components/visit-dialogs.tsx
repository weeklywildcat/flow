import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { errorMessage } from "@/components/common"
import {
  DurationEditor,
  initialDurationValues,
  readDurations,
  type DurationRow,
  type DurationValues,
} from "@/components/duration-editor"
import { post, type Visit } from "@/lib/api"
import { formatDateTime, formatDuration, formatTime, minutesSince } from "@/lib/format"

/** Visits longer than this get a second look before everyone is checked out. */
export const REVIEW_AFTER_MINUTES = 30

function useDurationForm(rows: DurationRow[]) {
  const [values, setValues] = React.useState<DurationValues>({})
  const [invalidId, setInvalidId] = React.useState<number | null>(null)
  const key = rows.map((row) => row.visitId).join(",")
  React.useEffect(() => {
    setValues(initialDurationValues(rows))
    setInvalidId(null)
    // Reset only when a different set of visits opens.
  }, [key])
  return { values, setValues, invalidId, setInvalidId }
}

export function ClearDialog({
  open,
  onOpenChange,
  visits,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  visits: Visit[]
  onDone: () => void
}) {
  const rows = React.useMemo<DurationRow[]>(() => {
    const now = Date.now()
    return visits
      .filter((visit) => (minutesSince(visit.checkedInAt, now) ?? 0) > REVIEW_AFTER_MINUTES)
      .map((visit) => {
        const elapsed = Math.min(1440, minutesSince(visit.checkedInAt, now) ?? 0)
        return {
          visitId: visit.visitId,
          firstName: visit.firstName,
          lastName: visit.lastName,
          meta: `In at ${formatTime(visit.checkedInAt)} · here ${formatDuration(elapsed)}`,
          max: elapsed,
          initial: elapsed,
        }
      })
    // Recompute when the dialog opens so elapsed times are fresh.
  }, [visits, open])
  const { values, setValues, invalidId, setInvalidId } = useDurationForm(rows)
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    const result = readDurations(rows, values)
    if ("error" in result) {
      setInvalidId(result.visitId)
      toast.error(result.error)
      return
    }
    setBusy(true)
    try {
      await post("admin-clear-with-durations", { adjustments: result.changed })
      const corrected = result.changed.length
      toast.success(
        corrected
          ? `Everyone was checked out · ${corrected} time${corrected === 1 ? "" : "s"} corrected`
          : "Everyone was checked out"
      )
      onOpenChange(false)
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const others = visits.length - rows.length

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Check everyone out</DialogTitle>
          <DialogDescription>
            {rows.length === 1 ? "One student has" : `${rows.length} students have`} been here more than{" "}
            {REVIEW_AFTER_MINUTES} minutes. If anyone forgot to scan out, correct how long they actually stayed.
            {others > 0 ? ` The other ${others} will be checked out as of now.` : ""}
          </DialogDescription>
        </DialogHeader>
        <DurationEditor
          rows={rows}
          values={values}
          onChange={setValues}
          invalidId={invalidId}
          applyNote="Nobody is set longer than they have been checked in."
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : null}
            Check out {visits.length} {visits.length === 1 ? "student" : "students"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DurationDialog({
  visits,
  onOpenChange,
  onDone,
}: {
  visits: Visit[] | null
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const rows = React.useMemo<DurationRow[]>(() => {
    const now = Date.now()
    return (visits ?? []).map((visit) => {
      const recorded = Math.max(0, visit.durationMinutes ?? 0)
      return {
        visitId: visit.visitId,
        firstName: visit.firstName,
        lastName: visit.lastName,
        meta: `In ${formatDateTime(visit.checkedInAt)} · recorded ${formatDuration(recorded)}`,
        max: Math.min(1440, minutesSince(visit.checkedInAt, now) ?? 1440),
        initial: recorded,
      }
    })
  }, [visits])
  const { values, setValues, invalidId, setInvalidId } = useDurationForm(rows)
  const [busy, setBusy] = React.useState(false)
  const count = rows.length

  async function submit() {
    const result = readDurations(rows, values)
    if ("error" in result) {
      setInvalidId(result.visitId)
      toast.error(result.error)
      return
    }
    if (!result.changed.length) {
      toast("No durations were changed.")
      return
    }
    setBusy(true)
    try {
      await post("admin-update-visit-durations", { updates: result.changed })
      const updated = result.changed.length
      toast.success(`${updated} visit duration${updated === 1 ? "" : "s"} updated`)
      onOpenChange(false)
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={visits !== null} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit {count === 1 ? "visit duration" : `${count} visit durations`}</DialogTitle>
          <DialogDescription>
            Check-in times stay the same. Flow moves each checkout so totals, stats, and exports use the corrected
            length.
          </DialogDescription>
        </DialogHeader>
        <DurationEditor
          rows={rows}
          values={values}
          onChange={setValues}
          invalidId={invalidId}
          applyNote="No checkout can move past the current time."
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : null}
            Save {count === 1 ? "duration" : "durations"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
