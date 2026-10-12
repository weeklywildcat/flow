// Motion for the kiosk: the drifting background orbs and the one-shot effects that answer a
// scan, a reason tap, and a finished check-in or checkout. Everything runs on the Web
// Animations API and cleans up its own nodes, so React never has to track particles.

type Point = { x: number; y: number }

const reducedMotion = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)")
  : null

export function motionReduced(): boolean {
  return Boolean(reducedMotion?.matches)
}

export const SCAN_FLIGHT_MS = 280
const BURST_COLORS = ["#10b981", "#0ea5e9", "#8b5cf6", "#f59e0b", "#f43f5e", "#14b8a6"]
const BURST_SHAPES = ["", "is-sparkle", "is-diamond"]

function centerOf(element: Element | null): Point | null {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  if (!rect.width && !rect.height) return null
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

/** Closed Catmull-Rom loop sampled into dense keyframes, so the path has no visible corners. */
function smoothLoop(points: [number, number][], perSegment: number, format: (a: number, b: number) => string): Keyframe[] {
  const frames: Keyframe[] = []
  const count = points.length
  for (let i = 0; i < count; i += 1) {
    const p0 = points[(i - 1 + count) % count]
    const p1 = points[i]
    const p2 = points[(i + 1) % count]
    const p3 = points[(i + 2) % count]
    for (let step = 0; step < perSegment; step += 1) {
      const t = step / perSegment
      const t2 = t * t
      const t3 = t2 * t
      const value = (k: 0 | 1) =>
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
      frames.push({ transform: format(value(0), value(1)) })
    }
  }
  frames.push(frames[0])
  return frames
}

const drift = (x: number, y: number) => `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`
const shape = (scale: number, angle: number) => `scale(${scale.toFixed(4)}) rotate(${angle.toFixed(2)}deg)`

/**
 * Starts the background orbs. They idle slowly on the welcome screen and pick up speed while a
 * student is mid-flow; drift, breathing and colour each run on unrelated periods so they never
 * fall back into step.
 */
export function startBackgroundMotion(nodes: {
  primaryDrift: HTMLElement
  secondaryDrift: HTMLElement
  primaryOrb: HTMLElement
  secondaryOrb: HTMLElement
}) {
  const layers: { animation: Animation; welcomeRate: number }[] = []
  if (motionReduced() || typeof nodes.primaryOrb.animate !== "function") {
    return { setWelcome: () => {}, stop: () => {} }
  }

  const add = (element: HTMLElement, frames: Keyframe[], duration: number, easing: string, seed: number, welcomeRate: number) => {
    const animation = element.animate(frames, { duration, easing, iterations: Infinity })
    animation.currentTime = seed
    layers.push({ animation, welcomeRate })
  }

  const slowPrimary = 26000 / 3800
  const slowSecondary = 32000 / 5200
  add(nodes.primaryDrift, smoothLoop([[-22, -12], [18, 26], [58, 10], [88, 44], [70, 84], [22, 76], [-16, 54], [-44, 18]], 8, drift), 32500, "linear", 9000, slowPrimary)
  add(nodes.secondaryDrift, smoothLoop([[26, 64], [-10, 50], [-48, 18], [-76, -20], [-58, -58], [-18, -48], [20, -12], [46, 28]], 8, drift), 39500, "linear", 21000, slowSecondary)
  add(nodes.primaryOrb, smoothLoop([[0.94, -4], [1.07, 4], [1.01, 9], [0.97, 2]], 10, shape), 50000, "linear", 7000, slowPrimary)
  add(nodes.secondaryOrb, smoothLoop([[1.04, 6], [0.95, -2], [1.02, -8], [1.07, 1]], 10, shape), 61000, "linear", 15000, slowSecondary)
  add(nodes.primaryOrb, [
    { backgroundPosition: "8% 18%, 86% 12%, 32% 90%, 88% 78%, 50% 50%" },
    { backgroundPosition: "68% 24%, 20% 2%, 84% 44%, 12% 20%, 46% 42%" },
    { backgroundPosition: "100% 72%, 0% 52%, 44% 0%, 76% 30%, 42% 54%" },
    { backgroundPosition: "30% 100%, 72% 76%, 0% 58%, 22% 92%, 54% 46%" },
    { backgroundPosition: "8% 18%, 86% 12%, 32% 90%, 88% 78%, 50% 50%" },
  ], 78000, "ease-in-out", 11000, slowPrimary)
  add(nodes.secondaryOrb, [
    { backgroundPosition: "100% 74%, 10% 0%, 92% 40%, 20% 100%, 50% 50%" },
    { backgroundPosition: "32% 14%, 78% 44%, 0% 88%, 72% 28%, 44% 48%" },
    { backgroundPosition: "0% 62%, 100% 100%, 48% 0%, 100% 65%, 58% 48%" },
    { backgroundPosition: "76% 100%, 18% 68%, 70% 22%, 8% 42%, 52% 54%" },
    { backgroundPosition: "100% 74%, 10% 0%, 92% 40%, 20% 100%, 50% 50%" },
  ], 95000, "ease-in-out", 29000, slowSecondary)

  let rampFrame: number | null = null
  const setRate = (animation: Animation, rate: number) => {
    if (typeof animation.updatePlaybackRate === "function") animation.updatePlaybackRate(rate)
    else animation.playbackRate = rate
  }

  function setWelcome(welcome: boolean, immediate = false) {
    if (rampFrame !== null) cancelAnimationFrame(rampFrame)
    const targets = layers.map((layer) => (welcome ? layer.welcomeRate : 1))
    if (immediate) {
      layers.forEach((layer, index) => setRate(layer.animation, targets[index]))
      return
    }
    const starts = layers.map((layer) => layer.animation.playbackRate || 1)
    const startedAt = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 760)
      const eased = 1 - Math.pow(1 - progress, 3)
      layers.forEach((layer, index) => setRate(layer.animation, starts[index] + (targets[index] - starts[index]) * eased))
      rampFrame = progress < 1 ? requestAnimationFrame(tick) : null
    }
    rampFrame = requestAnimationFrame(tick)
  }

  setWelcome(true, true)
  return {
    setWelcome: (welcome: boolean) => setWelcome(welcome),
    stop: () => {
      if (rampFrame !== null) cancelAnimationFrame(rampFrame)
      layers.forEach((layer) => layer.animation.cancel())
    },
  }
}

/** One-shot effects drawn into two fixed layers: one behind the card and one in front of it. */
export function createEffects(front: HTMLElement, back: HTMLElement) {
  function spawn(className: string, layer: "front" | "back" = "front"): HTMLDivElement {
    const node = document.createElement("div")
    node.className = className
    ;(layer === "back" ? back : front).appendChild(node)
    return node
  }

  function run(node: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
    const animation = node.animate(frames, options)
    const cleanup = () => node.remove()
    animation.onfinish = cleanup
    animation.oncancel = cleanup
  }

  function place(node: HTMLElement, point: Point, size: number) {
    node.style.left = `${point.x - size / 2}px`
    node.style.top = `${point.y - size / 2}px`
  }

  /** A light streak flown along a quadratic curve, rotated to follow its tangent. */
  function lightTrail(from: Point, to: Point, settings: { duration?: number; bow?: number; departing?: boolean; easing?: string } = {}) {
    const duration = settings.duration ?? SCAN_FLIGHT_MS
    const streak = spawn("fx-streak" + (settings.departing ? " is-departing" : ""))
    const dx = to.x - from.x
    const dy = to.y - from.y
    const bow = settings.bow ?? 0.2
    const control = { x: from.x + dx * 0.45 + dy * bow, y: from.y + dy * 0.45 - dx * bow }
    const halfLength = 66
    const frames: Keyframe[] = []
    for (let i = 0; i <= 16; i += 1) {
      const t = i / 16
      const inv = 1 - t
      const headX = inv * inv * from.x + 2 * inv * t * control.x + t * t * to.x
      const headY = inv * inv * from.y + 2 * inv * t * control.y + t * t * to.y
      const angle = Math.atan2(2 * inv * (control.y - from.y) + 2 * t * (to.y - control.y), 2 * inv * (control.x - from.x) + 2 * t * (to.x - control.x))
      const stretch = t < 0.18 ? 0.45 + t * 3 : t > 0.74 ? Math.max(0.3, 1 - (t - 0.74) * 2.4) : 1
      const centerX = headX - Math.cos(angle) * halfLength * stretch
      const centerY = headY - Math.sin(angle) * halfLength * stretch
      frames.push({
        offset: t,
        opacity: t < 0.06 || t > 0.9 ? 0 : 1,
        transform: `translate(${(centerX - halfLength).toFixed(1)}px, ${(centerY - 5.5).toFixed(1)}px) rotate(${((angle * 180) / Math.PI).toFixed(1)}deg) scaleX(${stretch.toFixed(3)})`,
      })
    }
    run(streak, frames, { duration, easing: settings.easing ?? "cubic-bezier(.32,.02,.2,1)", fill: "forwards" })
    return duration
  }

  /** The scanner fires: a streak flies from the scanner hint to the card, which then ripples. */
  function scanAccepted(scanner: Element | null, target: Element | null): number {
    if (motionReduced()) return 0
    const origin = centerOf(scanner) ?? { x: window.innerWidth - 70, y: window.innerHeight - 70 }
    const destination = centerOf(target) ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const flight = lightTrail(origin, destination, { bow: 0.2 })

    const ring = spawn("fx-wavefront")
    place(ring, origin, 120)
    const arriveScale = Math.max(160, Math.hypot(destination.x - origin.x, destination.y - origin.y)) / 60
    run(ring, [
      { offset: 0, transform: "scale(.16)", opacity: 0 },
      { offset: 0.14, transform: `scale(${(arriveScale * 0.22).toFixed(2)})`, opacity: 1 },
      { offset: Math.min(0.85, flight / 460), transform: `scale(${arriveScale.toFixed(2)})`, opacity: 0.7 },
      { offset: 1, transform: `scale(${(arriveScale * 1.5).toFixed(2)})`, opacity: 0 },
    ], { duration: 460, easing: "cubic-bezier(.22,.72,.28,1)", fill: "forwards" })

    window.setTimeout(() => {
      const ripple = spawn("fx-ripple")
      place(ripple, centerOf(target) ?? destination, 96)
      run(ripple, [{ transform: "scale(.34)", opacity: 0.85 }, { transform: "scale(3.1)", opacity: 0 }], {
        duration: 320,
        easing: "cubic-bezier(.16,.8,.3,1)",
        fill: "forwards",
      })
    }, flight - 20)
    return flight + 130
  }

  /** Soft bloom as a recognised ID turns into the next screen. */
  function bloom(target: Element | null) {
    if (motionReduced()) return
    const point = centerOf(target)
    if (!point) return
    const node = spawn("fx-bloom")
    place(node, point, 130)
    run(node, [{ transform: "scale(.3)", opacity: 0.9 }, { transform: "scale(2.4)", opacity: 0 }], {
      duration: 340,
      easing: "cubic-bezier(.2,.75,.3,1)",
      fill: "forwards",
    })
  }

  /** A wash of the tapped tile's colour that floods the screen behind the card. */
  function choiceWave(button: Element, color: string) {
    if (motionReduced()) return
    const origin = centerOf(button)
    if (!origin) return
    const wave = spawn("fx-choice-wave", "back")
    wave.style.setProperty("--wave", color)
    place(wave, origin, 140)
    const reach = Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y))
    const scale = Math.max(2, (reach * 2.7) / 140)
    run(wave, [
      { offset: 0, transform: "scale(.16)", opacity: 0 },
      { offset: 0.16, transform: `scale(${(scale * 0.34).toFixed(2)})`, opacity: 1 },
      { offset: 0.5, transform: `scale(${scale.toFixed(2)})`, opacity: 1 },
      { offset: 1, transform: `scale(${(scale * 1.05).toFixed(2)})`, opacity: 0 },
    ], { duration: 680, easing: "cubic-bezier(.22,.7,.28,1)", fill: "forwards" })
  }

  /** Confetti-lite: a ring, a background bloom and a dozen marks. Checkouts drift off to the right. */
  function success(target: Element | null, kind: "checkin" | "checkout") {
    if (motionReduced()) return
    const origin = centerOf(target) ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const departing = kind === "checkout"

    const ring = spawn("fx-success-ring" + (departing ? " is-departure" : ""))
    place(ring, origin, 150)
    run(ring, [{ transform: "scale(.55)", opacity: 0.9 }, { transform: "scale(2.2)", opacity: 0 }], {
      duration: departing ? 620 : 560,
      easing: "cubic-bezier(.16,.82,.28,1)",
      fill: "forwards",
    })

    const aurora = spawn("fx-aurora" + (departing ? " is-departure" : ""), "back")
    aurora.style.left = `calc(${Math.round(origin.x)}px - 65vmax)`
    aurora.style.top = `calc(${Math.round(origin.y)}px - 65vmax)`
    run(aurora, [
      { transform: "scale(.62)", opacity: 0 },
      { transform: "scale(.86)", opacity: 1, offset: 0.3 },
      { transform: "scale(1.05)", opacity: 0 },
    ], { duration: 720, easing: "cubic-bezier(.24,.72,.3,1)", fill: "forwards" })

    const count = 14
    for (let i = 0; i < count; i += 1) {
      const piece = spawn("fx-piece " + BURST_SHAPES[i % BURST_SHAPES.length])
      piece.style.color = BURST_COLORS[i % BURST_COLORS.length]
      place(piece, origin, 14)
      const spread = departing ? 1.15 : Math.PI * 2
      const angle = departing
        ? -0.5 + (i / count) * spread - spread / 2 + (Math.random() - 0.5) * 0.22
        : (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.38
      const distance = departing ? 96 + Math.random() * 78 : 70 + Math.random() * 80
      const size = departing ? 0.8 + Math.random() * 0.4 : 0.7 + Math.random() * 0.55
      const endX = Math.cos(angle) * distance
      const endY = Math.sin(angle) * distance - (departing ? 22 : 0)
      run(piece, departing
        ? [
            { transform: `translate(0, 0) scale(${size.toFixed(2)}) rotate(0deg)`, opacity: 0 },
            { transform: `translate(${(endX * 0.28).toFixed(1)}px, ${(endY * 0.28).toFixed(1)}px) scale(${size.toFixed(2)}) rotate(24deg)`, opacity: 0.95, offset: 0.22 },
            { transform: `translate(${endX.toFixed(1)}px, ${endY.toFixed(1)}px) scale(${(size * 0.74).toFixed(2)}) rotate(58deg)`, opacity: 0 },
          ]
        : [
            { transform: "translate(0, 0) scale(.25) rotate(0deg)", opacity: 0 },
            { transform: `translate(${(endX * 0.42).toFixed(1)}px, ${(endY * 0.42).toFixed(1)}px) scale(${size.toFixed(2)}) rotate(32deg)`, opacity: 1, offset: 0.26 },
            { transform: `translate(${endX.toFixed(1)}px, ${endY.toFixed(1)}px) scale(${(size * 0.5).toFixed(2)}) rotate(76deg)`, opacity: 0 },
          ], {
        duration: departing ? 700 + Math.random() * 120 : 520 + Math.random() * 100,
        delay: departing ? i * 16 : i * 9,
        easing: departing ? "cubic-bezier(.2,.62,.3,1)" : "cubic-bezier(.18,.78,.28,1)",
        fill: "forwards",
      })
    }

    if (departing) {
      lightTrail(origin, { x: window.innerWidth + 90, y: origin.y - window.innerHeight * 0.22 }, {
        duration: 520,
        bow: -0.14,
        departing: true,
        easing: "cubic-bezier(.3,.06,.22,1)",
      })
    }
  }

  /** A backgrounded tab can suspend animations before their finish handlers run. */
  function clear() {
    front.replaceChildren()
    back.replaceChildren()
  }

  return { scanAccepted, bloom, choiceWave, success, clear }
}

export type Effects = ReturnType<typeof createEffects>
