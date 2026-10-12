import * as React from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon, FileImportIcon, Search01Icon, UserAdd01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageBody, StatusBadge, StudentAvatar, Toolbar, errorMessage } from "@/components/common"
import { ImportDialog } from "@/components/import-dialog"
import { GRADES, get, type StudentList } from "@/lib/api"
import { useDashboard } from "@/lib/dashboard"
import { useDebouncedValue } from "@/lib/hooks"
import { formatDay, formatNumber, fullName, plural } from "@/lib/format"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 50
const GRADE_ITEMS = [{ value: "", label: "All grades" }, ...GRADES.map((grade) => ({ value: grade, label: `Grade ${grade}` }))]
const STATUS_ITEMS = [
  { value: "", label: "All records" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
]

export function StudentsPage() {
  const { openStudent, dataVersion } = useDashboard()
  const [search, setSearch] = React.useState("")
  const [grade, setGrade] = React.useState("")
  const [status, setStatus] = React.useState("")
  const [offset, setOffset] = React.useState(0)
  const [data, setData] = React.useState<StudentList | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [importOpen, setImportOpen] = React.useState(false)
  const query = useDebouncedValue(search.trim(), 250)

  React.useEffect(() => setOffset(0), [query, grade, status])

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    get<StudentList>("admin-students", { limit: PAGE_SIZE, offset, q: query, grade, status })
      .then((next) => !cancelled && setData(next))
      .catch((error) => !cancelled && toast.error(errorMessage(error)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [offset, query, grade, status, dataVersion])

  const students = data?.students ?? []
  const total = data?.total ?? 0

  return (
    <PageBody>
      <Toolbar>
        <InputGroup className="w-full sm:w-72">
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Name, student ID, or barcode"
            aria-label="Search students"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </InputGroup>
        <Select items={GRADE_ITEMS} value={grade} onValueChange={(value) => setGrade(String(value ?? ""))}>
          <SelectTrigger aria-label="Grade" className="w-36">
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
        <Select items={STATUS_ITEMS} value={status} onValueChange={(value) => setStatus(String(value ?? ""))}>
          <SelectTrigger aria-label="Status" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <HugeiconsIcon icon={FileImportIcon} strokeWidth={2} data-icon="inline-start" />
            Import
          </Button>
          <Button onClick={() => openStudent({ create: true })}>
            <HugeiconsIcon icon={UserAdd01Icon} strokeWidth={2} data-icon="inline-start" />
            Add student
          </Button>
        </div>
      </Toolbar>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Directory</CardTitle>
          <CardDescription>{data ? plural(total, "student record") : "Loading…"}</CardDescription>
        </CardHeader>
        <CardContent className={cn("px-0 transition-opacity", loading && data && "opacity-60")}>
          {students.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-(--card-spacing)">Student</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead className="hidden md:table-cell">Barcode</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="hidden sm:table-cell">Last visit</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="w-10 pr-(--card-spacing)">
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow
                    key={student.id}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => openStudent({ id: student.id })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        openStudent({ id: student.id })
                      }
                    }}
                  >
                    <TableCell className="pl-(--card-spacing)">
                      <div className="flex items-center gap-3">
                        <StudentAvatar person={student} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{fullName(student)}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">{student.studentId}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{student.grade ?? "—"}</TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">{student.barcode}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(student.visitCount)}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDay(student.lastVisitAt)}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <StatusBadge tone={student.active ? "good" : "muted"}>{student.active ? "Active" : "Inactive"}</StatusBadge>
                    </TableCell>
                    <TableCell className="pr-(--card-spacing) text-muted-foreground">
                      <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyTitle>{loading ? "Loading students…" : "No students found"}</EmptyTitle>
                <EmptyDescription>{loading ? "" : "Try a different search or filter."}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
        {total > PAGE_SIZE ? (
          <CardFooter className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {formatNumber(offset + 1)}–{formatNumber(Math.min(offset + students.length, total))} of {formatNumber(total)}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
                Next
              </Button>
            </div>
          </CardFooter>
        ) : null}
      </Card>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </PageBody>
  )
}
