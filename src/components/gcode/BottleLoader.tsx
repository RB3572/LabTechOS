// A media bottle filling with pink liquid — shown while G-code is generated.

const BUBBLES = [
  { left: 22, delay: 0, dur: 1.3, size: 6 },
  { left: 44, delay: 0.5, dur: 1.1, size: 4 },
  { left: 58, delay: 0.9, dur: 1.5, size: 5 },
  { left: 34, delay: 1.3, dur: 1.2, size: 3 },
]

export function BottleLoader({ label = 'Generating G-Code' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-5">
      <div
        className="relative"
        style={{ width: 92, height: 156, animation: 'cs-slosh 2.4s ease-in-out infinite' }}
      >
        {/* cap */}
        <div className="absolute left-1/2 top-0 h-3.5 w-10 -translate-x-1/2 rounded-md bg-slate-500" />
        {/* neck */}
        <div className="absolute left-1/2 top-3 h-5 w-7 -translate-x-1/2 rounded-sm bg-slate-200 ring-1 ring-inset ring-slate-300" />

        {/* body */}
        <div
          className="absolute bottom-0 left-1/2 w-[78px] -translate-x-1/2 overflow-hidden rounded-2xl rounded-t-[18px] border-2 border-slate-300 bg-white/60 shadow-inner backdrop-blur-sm"
          style={{ height: 124 }}
        >
          {/* graduation ticks */}
          {[0.25, 0.45, 0.65, 0.85].map((t) => (
            <div
              key={t}
              className="absolute right-1.5 h-px w-2.5 bg-slate-300"
              style={{ bottom: `${t * 100}%` }}
            />
          ))}

          {/* rising liquid */}
          <div
            className="absolute inset-x-0 bottom-0"
            style={{
              height: '4%',
              background: 'linear-gradient(180deg, #f9a8d4 0%, #ec4899 70%, #db2777 100%)',
              animation: 'cs-fill 1.9s ease-out forwards',
            }}
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-pink-200/80" />
          </div>

          {/* bubbles */}
          {BUBBLES.map((b, i) => (
            <span
              key={i}
              className="absolute rounded-full bg-white/70"
              style={{
                left: b.left,
                bottom: 8,
                width: b.size,
                height: b.size,
                animation: `cs-bubble ${b.dur}s ease-in ${b.delay}s infinite`,
              }}
            />
          ))}

          {/* glass highlight */}
          <div className="pointer-events-none absolute inset-y-2 left-2 w-2 rounded-full bg-white/40" />
        </div>
      </div>

      <div
        className="text-sm font-semibold text-foreground"
        style={{ animation: 'cs-pulse-soft 1.4s ease-in-out infinite' }}
      >
        {label}…
      </div>
    </div>
  )
}
