import { useEffect, useState } from 'react'

/** True when the viewport is at the Tailwind `md` breakpoint (768px) or wider. */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 768px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const on = () => setDesktop(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return desktop
}
