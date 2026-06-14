import { useEffect, useRef } from 'react'

/**
 * Responsive background dot grid. Dots near the cursor contract and brighten
 * toward a vivid blue, easing back when the pointer moves away. Purely
 * decorative — sits behind the transparent 3D canvas / 2D view.
 */
export function DotGrid({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const SPACING = 30
    const RADIUS = 140 // px influence radius
    let cols = 0
    let rows = 0
    let w = 0
    let h = 0
    let factors = new Float32Array(0)
    let raf = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = rect.width
      h = rect.height
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(w / SPACING) + 1
      rows = Math.ceil(h / SPACING) + 1
      factors = new Float32Array(cols * rows)
    }

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      mouse.current =
        x < -RADIUS || y < -RADIUS || x > rect.width + RADIUS || y > rect.height + RADIUS
          ? null
          : { x, y }
    }

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      const m = mouse.current
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const px = c * SPACING
          const py = r * SPACING
          let target = 0
          if (m) {
            const dist = Math.hypot(px - m.x, py - m.y)
            if (dist < RADIUS) target = 1 - dist / RADIUS
          }
          const i = r * cols + c
          const cur = factors[i] + (target - factors[i]) * 0.14
          factors[i] = cur
          const f = cur * cur * (3 - 2 * cur) // smoothstep

          const radius = 1.9 - 1.15 * f // contract toward cursor
          const opacity = 0.13 + 0.82 * f // brighten toward cursor
          // slate-300 -> vivid blue-500
          const cr = Math.round(0xcb + (0x3b - 0xcb) * f)
          const cg = Math.round(0xd5 + (0x82 - 0xd5) * f)
          const cb = Math.round(0xe1 + (0xf6 - 0xe1) * f)

          ctx.beginPath()
          ctx.arc(px, py, Math.max(0.2, radius), 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${opacity})`
          ctx.fill()
        }
      }
      raf = requestAnimationFrame(draw)
    }

    resize()
    draw()

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    window.addEventListener('pointermove', onMove)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  return <canvas ref={canvasRef} className={className} aria-hidden />
}
