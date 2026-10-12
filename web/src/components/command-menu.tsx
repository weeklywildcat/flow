import * as React from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  Analytics01Icon,
  Clock01Icon,
  ComputerIcon,
  Flag02Icon,
  StudentsIcon,
  UserAdd01Icon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { StudentAvatar } from "@/components/common"
import { get, type Student, type StudentList } from "@/lib/api"
import { PAGES, useDashboard, type PageId } from "@/lib/dashboard"
import { useDebouncedValue } from "@/lib/hooks"
import { fullName } from "@/lib/format"

const PAGE_ICONS: Record<PageId, IconSvgElement> = {
  now: UserMultiple02Icon,
  visits: Clock01Icon,
  flagged: Flag02Icon,
  students: StudentsIcon,
  insights: Analytics01Icon,
  devices: ComputerIcon,
}

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { setPage, openStudent } = useDashboard()
  const [search, setSearch] = React.useState("")
  const [results, setResults] = React.useState<Student[]>([])
  const [loading, setLoading] = React.useState(false)
  const query = useDebouncedValue(search.trim(), 180)

  React.useEffect(() => {
    if (!open) setSearch("")
  }, [open])

  React.useEffect(() => {
    if (!query) {
      setResults([])
      return
    }
    let cancelled = false
    setLoading(true)
    get<StudentList>("admin-students", { q: query, limit: 8 })
      .then((list) => !cancelled && setResults(list.students))
      .catch(() => !cancelled && setResults([]))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [query])

  function run(action: () => void) {
    onOpenChange(false)
    action()
  }

  const pages = (Object.keys(PAGES) as PageId[]).filter(
    (id) => !search || PAGES[id].title.toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Find a student" description="Search by name, student ID, or barcode">
      <Command shouldFilter={false}>
        <CommandInput placeholder="Search students or jump to a page…" value={search} onValueChange={setSearch} />
        <CommandList>
          <CommandEmpty>{loading || search.trim() !== query ? "Searching…" : "No students match that search."}</CommandEmpty>
          {results.length ? (
            <CommandGroup heading="Students">
              {results.map((student) => (
                <CommandItem key={student.id} value={`student-${student.id}`} onSelect={() => run(() => openStudent({ id: student.id }))}>
                  <StudentAvatar person={student} className="size-6" />
                  <span className="flex-1 truncate">{fullName(student)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {student.studentId}
                    {student.grade ? ` · Gr ${student.grade}` : ""}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {pages.length ? (
            <CommandGroup heading="Go to">
              {pages.map((id) => (
                <CommandItem key={id} value={`page-${id}`} onSelect={() => run(() => setPage(id))}>
                  <HugeiconsIcon icon={PAGE_ICONS[id]} strokeWidth={2} />
                  {PAGES[id].title}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {!search ? (
            <CommandGroup heading="Actions">
              <CommandItem value="add-student" onSelect={() => run(() => openStudent({ create: true }))}>
                <HugeiconsIcon icon={UserAdd01Icon} strokeWidth={2} />
                Add a student
              </CommandItem>
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
