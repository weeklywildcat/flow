import * as React from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { FileImportIcon } from "@hugeicons/core-free-icons"

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
import { post } from "@/lib/api"
import { useDashboard } from "@/lib/dashboard"
import { plural } from "@/lib/format"

type ImportStudent = { studentId: string; barcode: string; firstName: string; lastName: string; grade: string }

const HEADER_ALIASES: Record<string, keyof ImportStudent> = {
  studentid: "studentId",
  id: "studentId",
  barcode: "barcode",
  barcodevalue: "barcode",
  firstname: "firstName",
  first: "firstName",
  lastname: "lastName",
  last: "lastName",
  grade: "grade",
}

/** Small RFC 4180 reader: quoted fields, escaped quotes, and CRLF line endings. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else {
      field += char
    }
  }
  if (field !== "" || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""))
}

function normalize(record: Partial<Record<keyof ImportStudent, unknown>>): ImportStudent | null {
  const value = (key: keyof ImportStudent) => String(record[key] ?? "").trim()
  const studentId = value("studentId")
  const student = {
    studentId,
    barcode: value("barcode") || studentId,
    firstName: value("firstName"),
    lastName: value("lastName"),
    grade: value("grade"),
  }
  return student.studentId && student.firstName && student.lastName ? student : null
}

function parseFile(name: string, text: string): { students: ImportStudent[]; skipped: number } {
  const source = text.replace(/^﻿/, "")
  let records: Partial<Record<keyof ImportStudent, unknown>>[]
  if (name.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(source) as unknown
    const list = Array.isArray(parsed) ? parsed : (parsed as { students?: unknown }).students
    if (!Array.isArray(list)) throw new Error("The JSON file needs a students list.")
    records = list.map((item) => {
      const entry = (item ?? {}) as Record<string, unknown>
      const out: Partial<Record<keyof ImportStudent, unknown>> = {}
      for (const [key, value] of Object.entries(entry)) {
        const field = HEADER_ALIASES[key.toLowerCase().replace(/[^a-z]/g, "")]
        if (field) out[field] = value
      }
      return out
    })
  } else {
    const [header, ...rows] = parseCsv(source)
    if (!header) throw new Error("That file is empty.")
    const columns = header.map((cell) => HEADER_ALIASES[cell.toLowerCase().replace(/[^a-z]/g, "")])
    if (!columns.includes("studentId") || !columns.includes("firstName") || !columns.includes("lastName")) {
      throw new Error("The CSV header needs studentId, firstName, and lastName columns.")
    }
    records = rows.map((cells) => {
      const out: Partial<Record<keyof ImportStudent, unknown>> = {}
      columns.forEach((field, index) => {
        if (field) out[field] = cells[index]
      })
      return out
    })
  }
  const students = records.map(normalize).filter((student): student is ImportStudent => student !== null)
  return { students, skipped: records.length - students.length }
}

const CHUNK = 200

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { invalidate } = useDashboard()
  const [file, setFile] = React.useState<{ name: string; students: ImportStudent[]; skipped: number } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [progress, setProgress] = React.useState<number | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (open) {
      setFile(null)
      setError(null)
      setProgress(null)
    }
  }, [open])

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0]
    event.target.value = ""
    if (!picked) return
    try {
      const parsed = parseFile(picked.name, await picked.text())
      if (!parsed.students.length) throw new Error("No usable rows were found in that file.")
      setFile({ name: picked.name, ...parsed })
      setError(null)
    } catch (caught) {
      setFile(null)
      setError(errorMessage(caught))
    }
  }

  async function run() {
    if (!file) return
    let imported = 0
    let skipped = file.skipped
    setProgress(0)
    try {
      for (let start = 0; start < file.students.length; start += CHUNK) {
        const result = await post<{ imported: number; skipped: number }>("import-students", {
          students: file.students.slice(start, start + CHUNK),
        })
        imported += result.imported
        skipped += result.skipped
        setProgress(Math.min(file.students.length, start + CHUNK))
      }
      toast.success(`${plural(imported, "student")} imported${skipped ? ` · ${skipped} skipped` : ""}`)
      invalidate()
      onOpenChange(false)
    } catch (caught) {
      toast.error(`${errorMessage(caught)} ${imported ? `(${imported} were saved first.)` : ""}`)
      setProgress(null)
    }
  }

  const busy = progress !== null

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import students</DialogTitle>
          <DialogDescription>
            Upload a CSV or JSON roster with studentId, barcode, firstName, lastName, and grade. Matching student IDs
            are updated and marked active; the barcode defaults to the student ID.
          </DialogDescription>
        </DialogHeader>
        <input ref={inputRef} type="file" accept=".csv,.json,text/csv,application/json" className="hidden" onChange={choose} />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          <HugeiconsIcon icon={FileImportIcon} strokeWidth={2} className="size-6 text-muted-foreground" />
          {file ? (
            <>
              <span className="text-sm font-medium">{file.name}</span>
              <span className="text-xs text-muted-foreground">
                {plural(file.students.length, "student")} ready
                {file.skipped ? ` · ${plural(file.skipped, "row")} missing an ID or name will be skipped` : ""}
              </span>
            </>
          ) : (
            <>
              <span className="text-sm font-medium">Choose a file</span>
              <span className="text-xs text-muted-foreground">.csv or .json</span>
            </>
          )}
        </button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {file ? (
          <div className="overflow-hidden rounded-2xl border text-xs">
            <table className="w-full">
              <thead className="bg-muted/60 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Student ID</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {file.students.slice(0, 4).map((student) => (
                  <tr key={student.studentId}>
                    <td className="px-3 py-2 tabular-nums">{student.studentId}</td>
                    <td className="px-3 py-2">
                      {student.firstName} {student.lastName}
                    </td>
                    <td className="px-3 py-2">{student.grade || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {file.students.length > 4 ? (
              <p className="border-t px-3 py-2 text-muted-foreground">and {file.students.length - 4} more</p>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!file || busy} onClick={run}>
            {busy ? <Spinner /> : null}
            {busy && file ? `Importing ${progress} of ${file.students.length}…` : file ? `Import ${plural(file.students.length, "student")}` : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
