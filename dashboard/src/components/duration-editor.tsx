import * as React from "react"

import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { StudentAvatar } from "@/components/common"

export type DurationRow = {
  visitId: number
  firstName: string
  lastName: string
  meta: string
  /** The checkout can never land in the future, so this is the elapsed time since check-in. */
  max: number
  initial: number
}

export type DurationValues = Record<number, string>

export function initialDurationValues(rows: DurationRow[]): DurationValues {
  return Object.fromEntries(rows.map((row) => [row.visitId, String(row.initial)]))
}

/** Validates every field; returns the rows whose minutes changed, or an error to show. */
export function readDurations(
  rows: DurationRow[],
  values: DurationValues
): { changed: { visitId: number; durationMinutes: number }[] } | { error: string; visitId: number } {
  const changed: { visitId: number; durationMinutes: number }[] = []
  for (const row of rows) {
    const raw = (values[row.visitId] ?? "").trim()
    const minutes = Number(raw)
    if (raw === "" || !Number.isInteger(minutes) || minutes < 0 || minutes > row.max) {
      return { error: `Enter whole minutes from 0 to ${row.max} for ${row.firstName} ${row.lastName}.`, visitId: row.visitId }
    }
    if (minutes !== row.initial) changed.push({ visitId: row.visitId, durationMinutes: minutes })
  }
  return { changed }
}

export function DurationEditor({
  rows,
  values,
  onChange,
  invalidId,
  applyNote,
}: {
  rows: DurationRow[]
  values: DurationValues
  onChange: (values: DurationValues) => void
  invalidId?: number | null
  applyNote: string
}) {
  const [all, setAll] = React.useState("")
  const [note, setNote] = React.useState<string | null>(null)
  const allId = React.useId()

  function applyAll() {
    const minutes = Number(all)
    if (all.trim() === "" || !Number.isInteger(minutes) || minutes < 0) {
      setNote("Enter a whole number of minutes.")
      return
    }
    let capped = 0
    const next: DurationValues = { ...values }
    for (const row of rows) {
      if (minutes > row.max) capped += 1
      next[row.visitId] = String(Math.min(minutes, row.max))
    }
    onChange(next)
    setNote(capped ? `${capped} kept at their time since check-in.` : null)
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.length > 1 ? (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-muted/60 p-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={allId}>Set all to</Label>
            <InputGroup className="w-36">
              <InputGroupInput
                id={allId}
                type="number"
                inputMode="numeric"
                min={0}
                max={1440}
                placeholder="Minutes"
                value={all}
                onChange={(event) => setAll(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    applyAll()
                  }
                }}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>min</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </div>
          <Button type="button" variant="secondary" onClick={applyAll}>
            Apply to all
          </Button>
          <p className="min-w-40 flex-1 text-xs text-muted-foreground">{note ?? applyNote}</p>
        </div>
      ) : null}
      <div className="max-h-[min(46vh,360px)] overflow-y-auto rounded-2xl border">
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.visitId} className="flex items-center gap-3 px-3 py-2.5">
              <StudentAvatar person={row} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {row.firstName} {row.lastName}
                </p>
                <p className="truncate text-xs text-muted-foreground">{row.meta}</p>
              </div>
              <InputGroup className="w-28 shrink-0">
                <InputGroupInput
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={row.max}
                  className="text-right tabular-nums"
                  aria-label={`Minutes for ${row.firstName} ${row.lastName}`}
                  aria-invalid={invalidId === row.visitId || undefined}
                  value={values[row.visitId] ?? ""}
                  onChange={(event) => onChange({ ...values, [row.visitId]: event.target.value })}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>min</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
