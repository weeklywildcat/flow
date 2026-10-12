import { cn } from "@/lib/utils"

export function FlowMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground",
        className
      )}
    >
      <svg viewBox="0 0 32 32" className="size-[70%]" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round">
        <path d="M7 11c4-4 8 4 12 0s4-2 6-2" />
        <path d="M7 17c4-4 8 4 12 0s4-2 6-2" />
        <path d="M7 23c4-4 8 4 12 0" />
      </svg>
    </span>
  )
}
