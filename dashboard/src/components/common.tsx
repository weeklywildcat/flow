import * as React from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { initials } from "@/lib/format"
import { cn } from "@/lib/utils"

export function PageBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:gap-6 md:p-6", className)}>{children}</div>
}

/** One left-aligned row of filters that scopes everything below it. */
export function Toolbar({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>
}

export function StudentAvatar({
  person,
  className,
}: {
  person: { firstName: string; lastName: string }
  className?: string
}) {
  return (
    <Avatar className={cn("size-8", className)}>
      <AvatarFallback className="text-xs font-semibold">{initials(person)}</AvatarFallback>
    </Avatar>
  )
}

export function StatCard({
  label,
  value,
  detail,
  emphasis,
  loading,
}: {
  label: string
  value: React.ReactNode
  detail?: React.ReactNode
  emphasis?: boolean
  loading?: boolean
}) {
  return (
    <Card size="sm" className={cn(emphasis && "bg-primary text-primary-foreground ring-0")}>
      <CardContent className="flex flex-col gap-1">
        <span className={cn("text-sm", emphasis ? "text-primary-foreground/80" : "text-muted-foreground")}>{label}</span>
        <span className={cn("text-3xl font-semibold tracking-tight", loading && "opacity-50")}>{value}</span>
        {detail ? (
          <span className={cn("text-xs", emphasis ? "text-primary-foreground/80" : "text-muted-foreground")}>{detail}</span>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function StatusBadge({ tone, children }: { tone: "good" | "warn" | "muted" | "bad"; children: React.ReactNode }) {
  const dot = {
    good: "bg-primary",
    warn: "bg-amber-500",
    muted: "bg-muted-foreground/50",
    bad: "bg-destructive",
  }[tone]
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <span className={cn("size-1.5 rounded-full", dot)} aria-hidden="true" />
      {children}
    </Badge>
  )
}

type ConfirmOptions = {
  title: string
  description: React.ReactNode
  action: string
  destructive?: boolean
  run: () => Promise<void>
}

const ConfirmContext = React.createContext<(options: ConfirmOptions) => void>(() => {})

export function useConfirm() {
  return React.useContext(ConfirmContext)
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null)
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const confirm = React.useCallback((next: ConfirmOptions) => {
    setOptions(next)
    setOpen(true)
  }, [])

  async function run() {
    if (!options) return
    setBusy(true)
    try {
      await options.run()
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title}</AlertDialogTitle>
            <AlertDialogDescription>{options?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={options?.destructive ? "destructive" : "default"}
              disabled={busy}
              onClick={(event) => {
                event.preventDefault()
                void run()
              }}
            >
              {busy ? <Spinner /> : null}
              {options?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
