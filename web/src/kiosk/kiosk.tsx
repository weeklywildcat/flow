import * as React from "react"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  Alert02Icon,
  ArrowRight02Icon,
  BookOpen01Icon,
  Books01Icon,
  BulbIcon,
  Cancel01Icon,
  LockKeyIcon,
  Logout03Icon,
  PrinterIcon,
  Restaurant01Icon,
  SparklesIcon,
  Tick02Icon,
  UserAdd01Icon,
  UserGroupIcon,
  UserQuestion01Icon,
  WifiDisconnected01Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp"
import { Spinner } from "@/components/ui/spinner"
import { FlowMark } from "@/components/flow-mark"
import { cn } from "@/lib/utils"
import {
  IS_LOCAL,
  KioskError,
  kioskGet,
  kioskPost,
  readToken,
  saveToken,
  type FunFacts,
  type KioskStudent,
  type ScanResult,
} from "./api"
import { createEffects, type Effects } from "./fx"

type SuccessVariant = "checkin" | "checkout"

/** Where the scan was headed before the kiosk stopped to ask for a name. */
type AfterNameCheck = { mode: "checkout" } | { mode: "checkin"; recentlyCleared: boolean; reasons: string[] }

type Screen =
  | { kind: "booting" }
  | { kind: "pairing"; error?: string }
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "reasons"; firstName: string; reasons: string[] }
  | { kind: "new-student"; reasons: string[] }
  | { kind: "recent-clear"; firstName: string; reasons: string[] }
  | { kind: "confirm-name"; student: KioskStudent; next: AfterNameCheck }
  | { kind: "success"; variant: SuccessVariant; title: string; detail: string; hint: string }
  | { kind: "error"; title: string; detail: string }
  | { kind: "offline"; message: string }

const DEFAULT_REASONS = ["Class work", "Printing", "Book checkout", "Lunch", "Meeting", "Other"]
const GRADES = ["9", "10", "11", "12"]
const REASONS_TIMEOUT_MS = 20000
const NEW_STUDENT_TIMEOUT_MS = 60000
const NAME_CHECK_TIMEOUT_MS = 60000

// Each reason gets its own colour so the grid reads at a glance. Class names stay literal
// so Tailwind can see them.
const REASON_STYLES: Record<string, { icon: IconSvgElement; tile: string; badge: string; wave: string }> = {
  "Class work": { icon: BookOpen01Icon, tile: "bg-sky-500/10 hover:bg-sky-500/15 ring-sky-500/20", badge: "bg-sky-500", wave: "#0ea5e9" },
  Printing: { icon: PrinterIcon, tile: "bg-violet-500/10 hover:bg-violet-500/15 ring-violet-500/20", badge: "bg-violet-500", wave: "#8b5cf6" },
  "Book checkout": { icon: Books01Icon, tile: "bg-amber-500/10 hover:bg-amber-500/15 ring-amber-500/25", badge: "bg-amber-500", wave: "#f59e0b" },
  Lunch: { icon: Restaurant01Icon, tile: "bg-orange-500/10 hover:bg-orange-500/15 ring-orange-500/20", badge: "bg-orange-500", wave: "#f97316" },
  Meeting: { icon: UserGroupIcon, tile: "bg-teal-500/10 hover:bg-teal-500/15 ring-teal-500/20", badge: "bg-teal-500", wave: "#14b8a6" },
  Other: { icon: SparklesIcon, tile: "bg-pink-500/10 hover:bg-pink-500/15 ring-pink-500/20", badge: "bg-pink-500", wave: "#ec4899" },
}

const FOOTER: Record<Screen["kind"], { hint: string; status: string }> = {
  booting: { hint: "Starting up…", status: "Connecting" },
  pairing: { hint: "The PIN expires after 10 minutes.", status: "Setup" },
  idle: { hint: "Need help? See the librarian.", status: "Ready" },
  working: { hint: "Need help? See the librarian.", status: "Checking" },
  reasons: { hint: "Tap one reason.", status: "Choose" },
  "new-student": { hint: "This saves your ID for future visits.", status: "Continue" },
  "recent-clear": { hint: "Choose an option to continue.", status: "Confirm" },
  "confirm-name": { hint: "This updates your library record.", status: "Confirm" },
  success: { hint: "Ready for the next scan.", status: "Done" },
  error: { hint: "Please see the librarian.", status: "Help" },
  offline: { hint: "Check Wi-Fi if this message does not clear.", status: "Offline" },
}

function tone(screen: Screen): "idle" | "working" | "success" | "error" {
  if (screen.kind === "success") return "success"
  if (screen.kind === "error" || screen.kind === "offline") return "error"
  if (screen.kind === "working" || screen.kind === "recent-clear") return "working"
  return "idle"
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))
const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback)

export function Kiosk() {
  const [screen, setScreenState] = React.useState<Screen>({ kind: "booting" })
  const [screenKey, setScreenKey] = React.useState(0)
  const [reading, setReading] = React.useState(false)
  const [kick, setKick] = React.useState(0)
  const [selectedReason, setSelectedReason] = React.useState<string | null>(null)
  const [funFacts, setFunFacts] = React.useState<FunFacts | null | "error">(null)

  const screenRef = React.useRef<Screen>(screen)
  const busy = React.useRef(false)
  const barcode = React.useRef("")
  const keyBuffer = React.useRef("")
  const timers = React.useRef<Record<"key" | "auto" | "working" | "connectivity", number | undefined>>({
    key: undefined,
    auto: undefined,
    working: undefined,
    connectivity: undefined,
  })
  const checkingConnection = React.useRef(false)

  const scanInput = React.useRef<HTMLInputElement>(null)
  const scannerHint = React.useRef<HTMLDivElement>(null)
  const focal = React.useRef<HTMLDivElement>(null)
  const fxFront = React.useRef<HTMLDivElement>(null)
  const fxBack = React.useRef<HTMLDivElement>(null)
  const effects = React.useRef<Effects | null>(null)

  const clearTimer = (name: keyof typeof timers.current) => window.clearTimeout(timers.current[name])
  const clearTimers = () => (Object.keys(timers.current) as (keyof typeof timers.current)[]).forEach(clearTimer)

  const go = React.useCallback((next: Screen) => {
    screenRef.current = next
    setScreenState(next)
    setScreenKey((key) => key + 1)
    setReading(false)
  }, [])

  const focusScanner = React.useCallback(() => {
    const kind = screenRef.current.kind
    if (kind === "new-student" || kind === "pairing" || kind === "recent-clear" || kind === "confirm-name") return
    if (document.activeElement?.closest?.("button")) return
    requestAnimationFrame(() => scanInput.current?.focus({ preventScroll: true }))
  }, [])

  // ---- Screens ----------------------------------------------------------------------------

  const showPairing = React.useCallback((error?: string) => {
    clearTimers()
    busy.current = false
    go({ kind: "pairing", error })
  }, [go])

  const showIdle = React.useCallback(() => {
    if (!readToken() && !IS_LOCAL) {
      showPairing()
      return
    }
    clearTimers()
    busy.current = false
    barcode.current = ""
    keyBuffer.current = ""
    if (scanInput.current) scanInput.current.value = ""
    setSelectedReason(null)
    effects.current?.clear()
    go({ kind: "idle" })
    focusScanner()
  }, [go, focusScanner, showPairing])

  const autoReturn = React.useCallback((ms: number) => {
    clearTimer("auto")
    timers.current.auto = window.setTimeout(showIdle, ms)
  }, [showIdle])

  const showError = React.useCallback((title: string, detail: string, ms = 3000) => {
    clearTimers()
    busy.current = false
    go({ kind: "error", title, detail })
    autoReturn(ms)
  }, [go, autoReturn])

  const showSuccess = React.useCallback((variant: SuccessVariant, title: string, detail: string, ms: number, hint = "Ready for the next scan.") => {
    clearTimers()
    busy.current = false
    go({ kind: "success", variant, title, detail, hint })
    autoReturn(ms)
  }, [go, autoReturn])

  const showReasons = React.useCallback((student: Pick<KioskStudent, "firstName"> | undefined, reasons = DEFAULT_REASONS) => {
    clearTimer("working")
    busy.current = false
    setSelectedReason(null)
    setFunFacts(null)
    go({ kind: "reasons", firstName: student?.firstName || "there", reasons })
    autoReturn(REASONS_TIMEOUT_MS)
    focusScanner()

    const requested = barcode.current
    if (!requested) return
    kioskPost<{ funFacts: FunFacts }>("/api/library/student-fun-facts", { barcode: requested })
      .then((data) => {
        if (barcode.current === requested && screenRef.current.kind === "reasons") setFunFacts(data.funFacts)
      })
      .catch(() => {
        if (barcode.current === requested && screenRef.current.kind === "reasons") setFunFacts("error")
      })
  }, [go, autoReturn, focusScanner])

  const showOffline = React.useCallback((text = "Check the Chromebook Wi-Fi connection.") => {
    clearTimers()
    busy.current = true
    go({ kind: "offline", message: text })
    timers.current.connectivity = window.setTimeout(() => void verifyConnectionRef.current(), 5000)
  }, [go])

  const verifyConnection = React.useCallback(async () => {
    if (checkingConnection.current) return
    if (IS_LOCAL) {
      showIdle()
      return
    }
    if (!readToken()) {
      showPairing()
      return
    }
    checkingConnection.current = true
    busy.current = true
    try {
      const data = await kioskGet<{ ok?: boolean }>("/api/library/kiosk-status")
      if (data.ok !== true) throw new Error("Kiosk authentication could not be verified.")
      showIdle()
    } catch (error) {
      if (error instanceof KioskError && error.status === 401) showPairing("This Chromebook needs to be paired again.")
      else showOffline(navigator.onLine ? "The library service is temporarily unavailable." : "Check the Chromebook Wi-Fi connection.")
    } finally {
      checkingConnection.current = false
    }
  }, [showIdle, showPairing, showOffline])
  const verifyConnectionRef = React.useRef(verifyConnection)
  verifyConnectionRef.current = verifyConnection

  /** Picks the scan back up where it was headed once the name question is answered or skipped. */
  const continueAfterNameCheck = React.useCallback((firstName: string, next: AfterNameCheck) => {
    if (next.mode === "checkout") {
      showSuccess("checkout", `See you next time, ${firstName || "friend"}!`, "You’re checked out.", 1500)
    } else if (next.recentlyCleared) {
      clearTimers()
      busy.current = false
      go({ kind: "recent-clear", firstName: firstName || "there", reasons: next.reasons })
    } else {
      showReasons({ firstName }, next.reasons)
    }
  }, [go, showSuccess, showReasons])

  const askForName = React.useCallback((student: KioskStudent, next: AfterNameCheck) => {
    clearTimer("working")
    busy.current = false
    go({ kind: "confirm-name", student, next })
    autoReturn(NAME_CHECK_TIMEOUT_MS)
  }, [go, autoReturn])

  // ---- Scanning ---------------------------------------------------------------------------

  const handleScan = React.useCallback(async (value: string) => {
    const scanned = value.trim()
    if (!scanned || busy.current) return
    clearTimers()
    busy.current = true
    barcode.current = scanned
    setReading(true)
    setKick((count) => count + 1)
    const beatEnds = performance.now() + (effects.current?.scanAccepted(scannerHint.current, focal.current) ?? 0)
    // Let the arrival beat land before the "checking" copy can interrupt it.
    timers.current.working = window.setTimeout(() => go({ kind: "working" }), 640)

    const settle = async () => {
      const remaining = beatEnds - performance.now()
      if (remaining > 0) await sleep(Math.min(remaining, 400))
      effects.current?.bloom(focal.current)
    }

    try {
      const data = await kioskPost<ScanResult>("/api/library/scan", { barcode: scanned, autoCheckout: true })
      clearTimer("working")
      if (data.mode === "checkout") {
        await settle()
        if (data.nameCheck) askForName(data.student, { mode: "checkout" })
        else showSuccess("checkout", `See you next time, ${data.student.firstName || "friend"}!`, "You’re checked out.", 1500)
      } else if (data.mode === "checkin") {
        if (data.nameCheck) {
          await settle()
          askForName(data.student, { mode: "checkin", recentlyCleared: Boolean(data.recentlyCleared), reasons: data.reasons ?? DEFAULT_REASONS })
        } else if (data.recentlyCleared) {
          busy.current = false
          go({ kind: "recent-clear", firstName: data.student.firstName || "there", reasons: data.reasons ?? DEFAULT_REASONS })
        } else {
          await settle()
          showReasons(data.student, data.reasons)
        }
      } else if (data.mode === "new_student") {
        clearTimer("working")
        busy.current = false
        barcode.current = data.barcode || scanned
        go({ kind: "new-student", reasons: data.reasons ?? DEFAULT_REASONS })
        autoReturn(NEW_STUDENT_TIMEOUT_MS)
      } else {
        showError("ID not found", "Please see the librarian.")
      }
    } catch (error) {
      clearTimer("working")
      showError("Could not scan", message(error, "Try again or see the librarian."))
    } finally {
      setReading(false)
      focusScanner()
    }
  }, [go, showSuccess, showReasons, showError, autoReturn, focusScanner, askForName])

  const finishBufferedScan = React.useCallback(() => {
    const value = (scanInput.current?.value || keyBuffer.current).trim()
    if (scanInput.current) scanInput.current.value = ""
    keyBuffer.current = ""
    if (value) void handleScan(value)
    else setReading(false)
  }, [handleScan])

  // A USB scanner types the barcode and presses Enter. Collect keys anywhere on the page
  // except inside the forms and buttons a student is actually using.
  React.useEffect(() => {
    const ignore = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest("[data-kiosk-form], button"))

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (ignore(event.target)) return
      if (event.key === "Escape") {
        event.preventDefault()
        showIdle()
        return
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        finishBufferedScan()
        return
      }
      const kind = screenRef.current.kind
      if (event.key.length === 1 && (kind === "idle" || kind === "error" || kind === "working")) {
        keyBuffer.current += event.key
        setReading(true)
        clearTimer("key")
        timers.current.key = window.setTimeout(() => {
          if (keyBuffer.current.length >= 5) finishBufferedScan()
        }, 230)
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      if (ignore(event.target)) return
      window.setTimeout(focusScanner, 0)
    }
    const onReturn = () => {
      const kind = screenRef.current.kind
      if (kind === "idle" || kind === "pairing") void verifyConnectionRef.current()
      else focusScanner()
    }
    const onVisibility = () => {
      if (!document.hidden) onReturn()
    }
    const onOnline = () => void verifyConnectionRef.current()
    const onOffline = () => showOffline()

    document.addEventListener("keydown", onKeyDown, true)
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("focus", onReturn)
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      document.removeEventListener("keydown", onKeyDown, true)
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("focus", onReturn)
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [showIdle, finishBufferedScan, focusScanner, showOffline])

  // ---- Motion -----------------------------------------------------------------------------

  React.useEffect(() => {
    if (fxFront.current && fxBack.current) effects.current = createEffects(fxFront.current, fxBack.current)
    void verifyConnectionRef.current()
    return () => {
      Object.values(timers.current).forEach((id) => window.clearTimeout(id))
    }
    // Runs once: the refs are stable and verifyConnection is read through its ref.
  }, [])

  React.useEffect(() => {
    if (screen.kind === "success") {
      const variant = screen.variant
      // Wait for the success layout so the burst starts from the badge itself.
      requestAnimationFrame(() => requestAnimationFrame(() => effects.current?.success(focal.current, variant)))
    }
  }, [screen])

  // ---- Actions ----------------------------------------------------------------------------

  async function chooseReason(reason: string, button: HTMLButtonElement) {
    if (busy.current || !barcode.current) return
    clearTimer("auto")
    busy.current = true
    setSelectedReason(reason)
    effects.current?.choiceWave(button, (REASON_STYLES[reason] ?? REASON_STYLES.Other).wave)
    const firstName = screen.kind === "reasons" ? screen.firstName : "there"
    try {
      // Give the wave a head start so the success screen lands inside it.
      await sleep(180)
      await kioskPost("/api/library/checkin", { barcode: barcode.current, reason })
      if (reason === "Lunch") showSuccess("checkin", `Enjoy your lunch, ${firstName}!`, "You’re all set.", 900)
      else showSuccess("checkin", `You’re in, ${firstName}!`, "Scan out when you leave.", 2300, "Use the same ID to check out.")
    } catch (error) {
      showError("Could not check in", message(error, "Try again or see the librarian."))
    } finally {
      focusScanner()
    }
  }

  async function createStudent(form: { firstName: string; lastName: string; grade: string }, reasons: string[]) {
    if (busy.current || !barcode.current) return
    clearTimer("auto")
    busy.current = true
    try {
      const data = await kioskPost<{ student: KioskStudent; reasons?: string[] }>("/api/library/create-student", {
        barcode: barcode.current,
        ...form,
      })
      showReasons(data.student, data.reasons ?? reasons)
    } catch (error) {
      showError("Could not save", message(error, "Try again or see the librarian."), 3500)
    }
  }

  async function confirmName(names: { firstName: string; lastName: string }, next: AfterNameCheck) {
    if (busy.current || !barcode.current) return
    clearTimer("auto")
    busy.current = true
    try {
      const data = await kioskPost<{ student: KioskStudent }>("/api/library/confirm-name", { barcode: barcode.current, ...names })
      continueAfterNameCheck(data.student.firstName, next)
    } catch (error) {
      showError("Could not save your name", message(error, "Try again or see the librarian."), 3500)
    }
  }

  async function pair(pin: string): Promise<string | null> {
    if (busy.current) return null
    busy.current = true
    try {
      const data = await kioskPost<{ token: string }>("/api/library/kiosk-enroll", { pin })
      saveToken(data.token)
      showSuccess("checkin", "Chromebook paired!", "The kiosk is ready to use.", 1400, "Ready for the first scan.")
      return null
    } catch (error) {
      busy.current = false
      return message(error, "Could not pair this Chromebook.")
    }
  }

  // ---- Render -----------------------------------------------------------------------------

  const footer = FOOTER[screen.kind]
  const status = reading ? "Reading" : footer.status
  const hint = screen.kind === "success" ? screen.hint : footer.hint

  return (
    <div className="kiosk relative flex h-dvh flex-col overflow-hidden text-foreground select-none" data-tone={tone(screen)}>
      <div className="fx-layer" ref={fxBack} aria-hidden="true" />

      <header className="relative z-10 flex items-center justify-between gap-4 px-[clamp(1rem,3vw,2.5rem)] pt-[clamp(0.75rem,2.5vh,1.75rem)]">
        <div className="flex items-center gap-3">
          <FlowMark className="size-11 rounded-2xl shadow-lg shadow-primary/25" />
          <div className="leading-tight">
            <p className="text-lg font-bold tracking-tight">Ninety Six High School Library</p>
            <p className="text-sm text-muted-foreground">
              <Greeting />
            </p>
          </div>
        </div>
        <LiveClock />
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-[clamp(1rem,3vw,2.5rem)] py-4">
        <Card
          className={cn(
            "relative w-full gap-0 overflow-hidden bg-card/80 py-0 shadow-2xl shadow-black/10 ring-1 ring-black/5 backdrop-blur-xl transition-[max-width] duration-500",
            screen.kind === "reasons" ? "max-w-3xl" : "max-w-2xl"
          )}
          aria-live="polite"
        >
          <div key={screenKey} className="kiosk-enter px-[clamp(1.5rem,4vw,3rem)] py-[clamp(1.5rem,5vh,3rem)]">
            {screen.kind === "booting" ? (
              <Centered>
                <div ref={focal} className="flex size-24 items-center justify-center rounded-[2rem] bg-primary/10 text-primary">
                  <Spinner className="size-10" />
                </div>
                <Title>Getting ready…</Title>
              </Centered>
            ) : null}

            {screen.kind === "idle" ? (
              <Centered>
                <div ref={focal} className="kiosk-bob relative flex size-28 items-center justify-center rounded-[2.25rem] bg-primary/10 text-primary ring-1 ring-primary/15">
                  <BarcodeMark className="size-16" />
                  <span className="kiosk-scanline absolute inset-x-4 top-1/2 h-0.5 rounded-full bg-primary shadow-[0_0_14px_2px] shadow-primary/60" />
                </div>
                <div className="flex flex-col gap-2">
                  <Title>Scan your student ID</Title>
                  <Lead>to check in or check out</Lead>
                </div>
                <StatusPill active={reading}>{reading ? "Reading your ID…" : "Ready when you are"}</StatusPill>
              </Centered>
            ) : null}

            {screen.kind === "working" ? (
              <Centered>
                <div ref={focal} className="flex size-28 items-center justify-center rounded-[2.25rem] bg-primary/10 text-primary">
                  <Spinner className="size-12" />
                </div>
                <div className="flex flex-col gap-2">
                  <Title>One moment…</Title>
                  <Lead>Looking up your ID</Lead>
                </div>
              </Centered>
            ) : null}

            {screen.kind === "reasons" ? (
              <div className="flex flex-col gap-6">
                <div ref={focal} className="text-center">
                  <Title>Welcome, {screen.firstName}!</Title>
                  <Lead>What brings you in today?</Lead>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {screen.reasons.map((reason) => {
                    const style = REASON_STYLES[reason] ?? REASON_STYLES.Other
                    const chosen = selectedReason === reason
                    return (
                      <button
                        key={reason}
                        type="button"
                        disabled={selectedReason !== null}
                        onClick={(event) => void chooseReason(reason, event.currentTarget)}
                        className={cn(
                          "kiosk-tile flex min-h-[clamp(5.5rem,15vh,8rem)] flex-col items-center justify-center gap-2.5 rounded-3xl p-3 text-center ring-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                          style.tile,
                          chosen && "scale-[1.03] shadow-xl ring-2",
                          selectedReason !== null && !chosen && "opacity-40"
                        )}
                      >
                        <span className={cn("flex size-12 items-center justify-center rounded-2xl text-white shadow-md", style.badge)}>
                          <HugeiconsIcon icon={chosen ? Tick02Icon : style.icon} strokeWidth={2} className="size-6" />
                        </span>
                        <span className="text-lg font-semibold">{reason}</span>
                      </button>
                    )
                  })}
                </div>
                <FunFact facts={funFacts} />
                <div className="flex justify-center">
                  <Button variant="ghost" size="lg" onClick={showIdle} disabled={selectedReason !== null}>
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} data-icon="inline-start" />
                    Not me — cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {screen.kind === "new-student" ? (
              <NewStudentForm onSubmit={(form) => void createStudent(form, screen.reasons)} onCancel={showIdle} focalRef={focal} />
            ) : null}

            {screen.kind === "recent-clear" ? (
              <Centered>
                <div ref={focal} className="flex size-24 items-center justify-center rounded-[2rem] bg-amber-500/15 text-amber-600">
                  <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-12" />
                </div>
                <div className="flex flex-col gap-2">
                  <Title>You were just checked out</Title>
                  <Lead>A librarian cleared your visit less than 30 seconds ago. Want to check in again?</Lead>
                </div>
                <div className="flex flex-wrap justify-center gap-3" data-kiosk-form>
                  <Button size="lg" className="h-12 px-6 text-base" autoFocus onClick={() => showReasons({ firstName: screen.firstName }, screen.reasons)}>
                    Check in again
                  </Button>
                  <Button size="lg" variant="outline" className="h-12 px-6 text-base" onClick={showIdle}>
                    Cancel
                  </Button>
                </div>
              </Centered>
            ) : null}

            {screen.kind === "confirm-name" ? (
              <NameCheckForm
                current={screen.student}
                focalRef={focal}
                onSubmit={(names) => void confirmName(names, screen.next)}
                onSkip={() => continueAfterNameCheck(screen.student.firstName, screen.next)}
              />
            ) : null}

            {screen.kind === "success" ? (
              <Centered>
                <div
                  ref={focal}
                  className={cn(
                    "kiosk-pop flex size-28 items-center justify-center rounded-full text-white shadow-2xl",
                    screen.variant === "checkout" ? "bg-violet-500 shadow-violet-500/40" : "bg-primary shadow-primary/40"
                  )}
                >
                  <HugeiconsIcon icon={screen.variant === "checkout" ? Logout03Icon : Tick02Icon} strokeWidth={2.4} className="size-14" />
                </div>
                <div className="flex flex-col gap-2">
                  <Title>{screen.title}</Title>
                  <Lead>{screen.detail}</Lead>
                </div>
              </Centered>
            ) : null}

            {screen.kind === "error" ? (
              <Centered>
                <div ref={focal} className="kiosk-shake flex size-24 items-center justify-center rounded-[2rem] bg-rose-500/15 text-rose-600">
                  <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-12" />
                </div>
                <div className="flex flex-col gap-2">
                  <Title>{screen.title}</Title>
                  <Lead>{screen.detail}</Lead>
                </div>
                <StatusPill>Please see the librarian</StatusPill>
              </Centered>
            ) : null}

            {screen.kind === "offline" ? (
              <Centered>
                <div ref={focal} className="flex size-24 items-center justify-center rounded-[2rem] bg-rose-500/15 text-rose-600">
                  <HugeiconsIcon icon={WifiDisconnected01Icon} strokeWidth={2} className="size-12" />
                </div>
                <div className="flex flex-col gap-2">
                  <Title>Kiosk offline</Title>
                  <Lead>{screen.message}</Lead>
                </div>
                <StatusPill active>
                  <Spinner className="size-3.5" />
                  Reconnecting automatically
                </StatusPill>
              </Centered>
            ) : null}

            {screen.kind === "pairing" ? <PairingForm error={screen.error} onPair={pair} focalRef={focal} /> : null}
          </div>

          {screen.kind === "reasons" || screen.kind === "new-student" || screen.kind === "confirm-name" ? (
            <div
              key={`countdown-${screenKey}`}
              aria-hidden="true"
              className={cn("kiosk-countdown absolute inset-x-0 bottom-0 h-1.5 bg-primary/40", selectedReason && "[animation-play-state:paused]")}
              style={{ "--duration": `${screen.kind === "reasons" ? REASONS_TIMEOUT_MS : screen.kind === "confirm-name" ? NAME_CHECK_TIMEOUT_MS : NEW_STUDENT_TIMEOUT_MS}ms` } as React.CSSProperties}
            />
          ) : null}
        </Card>

        <div
          ref={scannerHint}
          key={`hint-${kick}`}
          className={cn(
            "absolute right-[clamp(1rem,3vw,2.5rem)] bottom-[clamp(0.25rem,1vh,0.75rem)] flex items-center gap-2 text-[clamp(0.85rem,1.4vw,1.1rem)] font-semibold text-primary",
            kick > 0 && "kiosk-kick"
          )}
          aria-label="Barcode Scanner"
        >
          Barcode Scanner
          <HugeiconsIcon icon={ArrowRight02Icon} strokeWidth={2.5} className="kiosk-nudge size-5" />
        </div>
      </main>

      <footer className="relative z-10 flex items-center justify-between gap-4 px-[clamp(1rem,3vw,2.5rem)] pb-[clamp(0.75rem,2vh,1.25rem)] text-sm text-muted-foreground">
        <span>{hint}</span>
        <span
          className={cn(
            "flex items-center gap-2 rounded-full bg-card/70 px-3 py-1 text-xs font-semibold tracking-wide uppercase ring-1 ring-black/5 backdrop-blur",
            tone(screen) === "error" && "text-rose-600",
            tone(screen) === "success" && "text-primary"
          )}
        >
          <span
            className={cn(
              "size-2 rounded-full",
              tone(screen) === "error" ? "bg-rose-500" : tone(screen) === "working" || reading ? "animate-pulse bg-amber-500" : "bg-primary"
            )}
          />
          {status}
        </span>
      </footer>

      <div className="fx-layer z-20" ref={fxFront} aria-hidden="true" />
      <input
        ref={scanInput}
        className="pointer-events-none absolute size-px opacity-0"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="Scanner input"
        onChange={(event) => {
          const kind = screenRef.current.kind
          if (kind === "reasons" || kind === "new-student" || kind === "confirm-name") {
            event.currentTarget.value = ""
            return
          }
          keyBuffer.current = event.currentTarget.value
          setReading(true)
        }}
      />
    </div>
  )
}

/** Scanner-frame corners around a barcode, drawn by hand so the bars read as a barcode. */
function BarcodeMark({ className }: { className?: string }) {
  const bars = [
    [14, 2.5], [19, 1.5], [22.5, 3], [28, 1.5], [31.5, 2.5], [36, 1.5], [39.5, 3.5], [45, 1.5], [48.5, 2],
  ]
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      <path d="M8 18v-6a4 4 0 0 1 4-4h6M46 8h6a4 4 0 0 1 4 4v6M56 46v6a4 4 0 0 1-4 4h-6M18 56h-6a4 4 0 0 1-4-4v-6" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      {bars.map(([x, width]) => (
        <rect key={x} x={x} y="18" width={width} height="28" rx="0.75" fill="currentColor" />
      ))}
    </svg>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center gap-6 text-center">{children}</div>
}

function Title({ children }: { children: React.ReactNode }) {
  return <h1 className="text-[clamp(2rem,4.6vw,3.5rem)] leading-[1.05] font-extrabold tracking-tight text-balance">{children}</h1>
}

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="text-[clamp(1.05rem,2vw,1.4rem)] text-balance text-muted-foreground">{children}</p>
}

function StatusPill({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium", active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
      {active ? null : <span className="size-2 animate-pulse rounded-full bg-primary" />}
      {children}
    </span>
  )
}

function FunFact({ facts }: { facts: FunFacts | null | "error" }) {
  let text = "Your library stats are loading…"
  if (facts === "error") text = "Your library stats will be ready in a moment."
  else if (facts) {
    const visits = Math.max(0, Math.round(facts.visitsThisMonth || 0))
    const minutes = Math.max(0, Math.round(facts.minutesThisYear || 0))
    text = `You’ve visited ${visits} ${visits === 1 ? "time" : "times"} this month and spent ${minutes.toLocaleString()} ${minutes === 1 ? "minute" : "minutes"} here this year.`
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-amber-400/10 p-3 ring-1 ring-amber-500/15">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-white shadow-sm">
        <HugeiconsIcon icon={BulbIcon} strokeWidth={2} className="size-5" />
      </span>
      <p className="text-sm">
        <span className="font-semibold">Fun fact · </span>
        <span className="text-muted-foreground">{text}</span>
      </p>
    </div>
  )
}

function NewStudentForm({
  onSubmit,
  onCancel,
  focalRef,
}: {
  onSubmit: (form: { firstName: string; lastName: string; grade: string }) => void
  onCancel: () => void
  focalRef: React.RefObject<HTMLDivElement | null>
}) {
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName] = React.useState("")
  const [grade, setGrade] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const ready = firstName.trim() && lastName.trim() && grade

  return (
    <form
      data-kiosk-form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        if (!ready || saving) return
        setSaving(true)
        onSubmit({ firstName: firstName.trim(), lastName: lastName.trim(), grade })
      }}
    >
      <div ref={focalRef} className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-16 items-center justify-center rounded-3xl bg-sky-500/15 text-sky-600">
          <HugeiconsIcon icon={UserAdd01Icon} strokeWidth={2} className="size-8" />
        </span>
        <Title>Looks like you’re new!</Title>
        <Lead>Tell us who you are. We’ll remember your ID next time.</Lead>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="kiosk-first">First name</FieldLabel>
          <Input id="kiosk-first" className="h-12 text-lg" autoComplete="given-name" autoFocus required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="kiosk-last">Last name</FieldLabel>
          <Input id="kiosk-last" className="h-12 text-lg" autoComplete="family-name" required value={lastName} onChange={(event) => setLastName(event.target.value)} />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Grade</legend>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Grade">
          {GRADES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={grade === value}
              onClick={() => setGrade(value)}
              className={cn(
                "kiosk-tile h-14 rounded-2xl text-lg font-semibold ring-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                grade === value ? "bg-primary text-primary-foreground shadow-lg ring-primary" : "bg-muted/60 ring-black/5 hover:bg-muted"
              )}
            >
              {value}th
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap justify-center gap-3">
        <Button type="button" variant="outline" size="lg" className="h-12 px-6 text-base" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="lg" className="h-12 px-8 text-base" disabled={!ready || saving}>
          {saving ? <Spinner /> : null}
          Continue
        </Button>
      </div>
    </form>
  )
}

/**
 * A librarian flagged this student's name as possibly wrong. The fields start empty so the
 * student types their real name instead of tapping past whatever is on file.
 */
function NameCheckForm({
  current,
  focalRef,
  onSubmit,
  onSkip,
}: {
  current: KioskStudent
  focalRef: React.RefObject<HTMLDivElement | null>
  onSubmit: (names: { firstName: string; lastName: string }) => void
  onSkip: () => void
}) {
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const ready = Boolean(firstName.trim() && lastName.trim())

  return (
    <form
      data-kiosk-form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        if (!ready || saving) return
        setSaving(true)
        onSubmit({ firstName: firstName.trim(), lastName: lastName.trim() })
      }}
    >
      <div ref={focalRef} className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-16 items-center justify-center rounded-3xl bg-amber-500/15 text-amber-600">
          <HugeiconsIcon icon={UserQuestion01Icon} strokeWidth={2} className="size-8" />
        </span>
        <Title>Quick name check</Title>
        <Lead>Your name may be entered incorrectly. Can you re-enter it?</Lead>
        <p className="rounded-full bg-muted px-4 py-1.5 text-sm text-muted-foreground">
          We have you as <span className="font-semibold text-foreground">{`${current.firstName} ${current.lastName}`.trim()}</span>
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="kiosk-confirm-first">First name</FieldLabel>
          <Input id="kiosk-confirm-first" className="h-12 text-lg" autoComplete="off" autoFocus required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="kiosk-confirm-last">Last name</FieldLabel>
          <Input id="kiosk-confirm-last" className="h-12 text-lg" autoComplete="off" required value={lastName} onChange={(event) => setLastName(event.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button type="button" variant="ghost" size="lg" className="h-12 px-6 text-base" disabled={saving} onClick={onSkip}>
          Skip for now
        </Button>
        <Button type="submit" size="lg" className="h-12 px-8 text-base" disabled={!ready || saving}>
          {saving ? <Spinner /> : null}
          Save my name
        </Button>
      </div>
    </form>
  )
}

function PairingForm({
  error,
  onPair,
  focalRef,
}: {
  error?: string
  onPair: (pin: string) => Promise<string | null>
  focalRef: React.RefObject<HTMLDivElement | null>
}) {
  const [pin, setPin] = React.useState("")
  const [problem, setProblem] = React.useState(error ?? "")
  const [pairing, setPairing] = React.useState(false)

  async function submit(value = pin) {
    if (value.length !== 8 || pairing) return
    setPairing(true)
    setProblem("")
    const failure = await onPair(value)
    if (failure) {
      setProblem(failure)
      setPin("")
      setPairing(false)
    }
  }

  return (
    <form
      data-kiosk-form
      className="flex flex-col items-center gap-6 text-center"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div ref={focalRef} className="flex size-20 items-center justify-center rounded-[1.75rem] bg-primary/10 text-primary">
        <HugeiconsIcon icon={LockKeyIcon} strokeWidth={2} className="size-10" />
      </div>
      <div className="flex flex-col gap-2">
        <Title>Pair this Chromebook</Title>
        <Lead>Ask the librarian for a pairing PIN, then type it here.</Lead>
      </div>
      <InputOTP
        maxLength={8}
        pattern={REGEXP_ONLY_DIGITS}
        value={pin}
        onChange={setPin}
        onComplete={(value: string) => void submit(value)}
        autoFocus
        disabled={pairing}
        aria-label="Pairing PIN"
      >
        <InputOTPGroup>
          {[0, 1, 2, 3].map((index) => (
            <InputOTPSlot key={index} index={index} className="size-12 text-xl" />
          ))}
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          {[4, 5, 6, 7].map((index) => (
            <InputOTPSlot key={index} index={index} className="size-12 text-xl" />
          ))}
        </InputOTPGroup>
      </InputOTP>
      {problem ? (
        <p role="alert" className="text-sm font-medium text-rose-600">
          {problem}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="h-12 px-8 text-base" disabled={pin.length !== 8 || pairing}>
        {pairing ? <Spinner /> : null}
        Pair this Chromebook
      </Button>
    </form>
  )
}

function Greeting() {
  const hour = useClock().getHours()
  return <>{hour < 12 ? "Good morning!" : hour < 17 ? "Good afternoon!" : "Good evening!"}</>
}

function LiveClock() {
  const now = useClock()
  return (
    <div className="text-right leading-tight">
      <p className="text-2xl font-bold tracking-tight tabular-nums">
        {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
      </p>
      <p className="text-sm text-muted-foreground">{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
    </div>
  )
}

function useClock(): Date {
  const [now, setNow] = React.useState(() => new Date())
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15000)
    return () => window.clearInterval(id)
  }, [])
  return now
}
