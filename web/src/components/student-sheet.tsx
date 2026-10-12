import * as React from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Logout03Icon, PencilEdit02Icon, UserQuestion01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { StatusBadge, StudentAvatar, errorMessage } from "@/components/common"
import { GRADES, get, post, type StudentDetail, type StudentList } from "@/lib/api"
import { fetchCached, peekCached } from "@/lib/cache"
import { peekDirectory } from "@/lib/directory"
import { useDashboard, type StudentRef } from "@/lib/dashboard"
import { useNow } from "@/lib/hooks"
import { formatDateTime, formatDay, formatDuration, formatNumber, formatTime, fullName, minutesSince } from "@/lib/format"

const GRADE_ITEMS = [{ value: "", label: "Not set" }, ...GRADES.map((grade) => ({ value: grade, label: `Grade ${grade}` }))]

type Form = { studentId: string; firstName: string; lastName: string; barcode: string; grade: string; active: boolean }
const BLANK: Form = { studentId: "", firstName: "", lastName: "", barcode: "", grade: "", active: true }

async function resolveId(ref: StudentRef): Promise<number> {
  if ("id" in ref) return ref.id
  if ("studentId" in ref) {
    const known = peekDirectory()?.byStudentId.get(ref.studentId)
    if (known) return known.id
    const list = await get<StudentList>("admin-students", { q: ref.studentId, limit: 20 })
    const match = list.students.find((student) => student.studentId === ref.studentId)
    if (!match) throw new Error("That student is no longer in the directory.")
    return match.id
  }
  throw new Error("Nothing to load.")
}

export function StudentSheet({ student: ref, onClose }: { student: StudentRef | null; onClose: () => void }) {
  const { invalidate, dataVersion } = useDashboard()
  const [detail, setDetail] = React.useState<StudentDetail | null>(null)
  const [editing, setEditing] = React.useState(false)
  const [form, setForm] = React.useState<Form>(BLANK)
  const [busy, setBusy] = React.useState(false)
  const now = useNow(30000)
  const creating = ref !== null && "create" in ref
  const open = ref !== null

  const latest = React.useRef(0)
  const load = React.useCallback(
    async (target: StudentRef) => {
      // Only the most recently opened student may write to the sheet.
      const ticket = ++latest.current
      try {
        const id = await resolveId(target)
        const cached = peekCached<StudentDetail>("admin-student", { id })
        if (cached && ticket === latest.current) setDetail(cached)
        const fresh = await fetchCached<StudentDetail>("admin-student", { id })
        if (ticket === latest.current) setDetail(fresh)
      } catch (error) {
        if (ticket !== latest.current) return
        toast.error(errorMessage(error))
        onClose()
      }
    },
    [onClose]
  )

  React.useEffect(() => {
    setDetail(null)
    setEditing(false)
    if (!ref) return
    if ("create" in ref) {
      setForm(BLANK)
      setEditing(true)
      return
    }
    void load(ref)
  }, [ref, load])

  // Pick up checkouts and edits made elsewhere while the sheet is open.
  React.useEffect(() => {
    if (detail && !editing) void load({ id: detail.student.id })
    // eslint-disable-line react-hooks/exhaustive-deps
  }, [dataVersion])

  const student = detail?.student
  const openVisit = detail?.recentVisits.find((visit) => !visit.checkedOutAt)
  const liveMinutes =
    student && student.activeSince
      ? (student.completedTimeMinutes ?? 0) + (minutesSince(student.activeSince, now) ?? 0)
      : student?.timeSpentMinutes

  function startEdit() {
    if (!student) return
    setForm({
      studentId: student.studentId,
      firstName: student.firstName,
      lastName: student.lastName,
      barcode: student.barcode,
      grade: student.grade ?? "",
      active: student.active,
    })
    setEditing(true)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await post<{ id: number }>("admin-students", {
        id: student?.id ?? 0,
        studentId: form.studentId.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        barcode: form.barcode.trim(),
        grade: form.grade,
        active: form.active,
      })
      toast.success(student ? "Student updated" : "Student added")
      setEditing(false)
      invalidate()
      await load({ id: result.id })
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function setNameCheck(requested: boolean) {
    if (!student) return
    setBusy(true)
    try {
      await post("admin-name-check", { id: student.id, requested })
      toast.success(requested ? `${student.firstName} will be asked to re-enter their name next time they scan` : "Name check canceled")
      invalidate()
      await load({ id: student.id })
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function checkOut() {
    if (!openVisit || !student) return
    setBusy(true)
    try {
      await post("checkout", { visitId: openVisit.visitId, method: "librarian" })
      toast.success(`${fullName(student)} checked out`)
      invalidate()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const set = (key: keyof Form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  return (
    <Sheet open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        {editing ? (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={save}>
            <SheetHeader>
              <SheetTitle>{creating ? "Add student" : `Edit ${student ? fullName(student) : "student"}`}</SheetTitle>
              <SheetDescription>
                {creating ? "Create a directory record so the kiosk recognizes their ID." : "Changes apply the next time they scan."}
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="student-id">Student ID</FieldLabel>
                  <Input
                    id="student-id"
                    required
                    maxLength={64}
                    disabled={!creating}
                    value={form.studentId}
                    onChange={set("studentId")}
                    autoFocus={creating}
                  />
                  {!creating ? <FieldDescription>Student IDs can't be changed once created.</FieldDescription> : null}
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel htmlFor="first-name">First name</FieldLabel>
                    <Input id="first-name" required maxLength={80} value={form.firstName} onChange={set("firstName")} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="last-name">Last name</FieldLabel>
                    <Input id="last-name" required maxLength={80} value={form.lastName} onChange={set("lastName")} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel htmlFor="barcode">Barcode</FieldLabel>
                    <Input id="barcode" required maxLength={80} className="font-mono" value={form.barcode} onChange={set("barcode")} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="grade">Grade</FieldLabel>
                    <Select
                      items={GRADE_ITEMS}
                      value={form.grade}
                      onValueChange={(value) => setForm((current) => ({ ...current, grade: String(value ?? "") }))}
                    >
                      <SelectTrigger id="grade" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GRADE_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field orientation="horizontal">
                  <Checkbox
                    id="active"
                    checked={form.active}
                    onCheckedChange={(checked) => setForm((current) => ({ ...current, active: Boolean(checked) }))}
                  />
                  <FieldLabel htmlFor="active" className="font-normal">
                    Active — the kiosk accepts this barcode
                  </FieldLabel>
                </Field>
              </FieldGroup>
            </div>
            <SheetFooter className="flex-row justify-end border-t">
              <Button type="button" variant="outline" disabled={busy} onClick={() => (creating ? onClose() : setEditing(false))}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Spinner /> : null}
                {creating ? "Add student" : "Save changes"}
              </Button>
            </SheetFooter>
          </form>
        ) : (
          <>
            <SheetHeader className="border-b">
              {student ? (
                <div className="flex items-center gap-4 pr-8">
                  <StudentAvatar person={student} className="size-12 text-base" />
                  <div className="min-w-0">
                    <SheetTitle className="truncate text-lg">{fullName(student)}</SheetTitle>
                    <SheetDescription className="flex flex-wrap items-center gap-2">
                      <span className="tabular-nums">ID {student.studentId}</span>
                      <span aria-hidden="true">·</span>
                      <span>{student.grade ? `Grade ${student.grade}` : "Grade not set"}</span>
                      <StatusBadge tone={student.active ? "good" : "muted"}>{student.active ? "Active" : "Inactive"}</StatusBadge>
                    </SheetDescription>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <Skeleton className="size-12 rounded-full" />
                  <div className="flex flex-col gap-2">
                    <SheetTitle className="sr-only">Loading student</SheetTitle>
                    <SheetDescription className="sr-only">Loading</SheetDescription>
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                </div>
              )}
            </SheetHeader>
            <div className="flex-1 overflow-y-auto">
              {student && detail ? (
                <div className="flex flex-col gap-6 p-6">
                  {student.nameCheckRequestedAt ? (
                    <div className="flex items-center gap-3 rounded-2xl bg-amber-500/10 p-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
                        <HugeiconsIcon icon={UserQuestion01Icon} strokeWidth={2} className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-medium">Name check pending</p>
                        <p className="text-xs text-muted-foreground">
                          The kiosk will ask them to re-enter their name at their next scan. Requested {formatDay(student.nameCheckRequestedAt)}.
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void setNameCheck(false)}>
                        Cancel
                      </Button>
                    </div>
                  ) : null}
                  {openVisit ? (
                    <div className="flex items-center gap-3 rounded-2xl bg-primary/10 p-3">
                      <span className="relative flex size-2.5">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
                        <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
                      </span>
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-medium">In the library now</p>
                        <p className="text-xs text-muted-foreground">
                          {openVisit.reason} · since {formatTime(openVisit.checkedInAt)}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" disabled={busy} onClick={checkOut}>
                        <HugeiconsIcon icon={Logout03Icon} strokeWidth={2} data-icon="inline-start" />
                        Check out
                      </Button>
                    </div>
                  ) : null}
                  <dl className="grid grid-cols-2 gap-3">
                    <Metric label="Visits" value={formatNumber(student.visitCount)} />
                    <Metric label="Time in library" value={formatDuration(liveMinutes)} />
                    <Metric label="Average visit" value={formatDuration(student.averageCompletedVisitMinutes)} />
                    <Metric label="Last visit" value={formatDay(student.lastVisitAt)} />
                  </dl>
                  <section className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium">Recent visits</h3>
                    {detail.recentVisits.length ? (
                      <ul className="divide-y rounded-2xl border">
                        {detail.recentVisits.map((visit) => (
                          <li key={visit.visitId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                            <div className="min-w-0">
                              <p className="font-medium">{visit.reason}</p>
                              <p className="text-xs text-muted-foreground tabular-nums">{formatDateTime(visit.checkedInAt)}</p>
                            </div>
                            <span className="shrink-0 text-muted-foreground tabular-nums">
                              {visit.checkedOutAt ? formatDuration(visit.durationMinutes) : "Still here"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No library visits yet.</p>
                    )}
                  </section>
                  <p className="font-mono text-xs text-muted-foreground">Barcode {student.barcode}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 p-6">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-40 w-full" />
                </div>
              )}
            </div>
            <SheetFooter className="flex-row flex-wrap justify-end border-t">
              {student && !student.nameCheckRequestedAt ? (
                <Button variant="outline" disabled={busy} onClick={() => void setNameCheck(true)}>
                  <HugeiconsIcon icon={UserQuestion01Icon} strokeWidth={2} data-icon="inline-start" />
                  Ask to confirm name
                </Button>
              ) : null}
              <Button variant="outline" disabled={!student} onClick={startEdit}>
                <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} data-icon="inline-start" />
                Edit student
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted/60 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tracking-tight">{value}</dd>
    </div>
  )
}
