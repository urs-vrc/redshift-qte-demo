import { useEffect, useState } from 'react'

/**
 * Returns true when the device's primary pointer is coarse (touch) — i.e. a phone or tablet.
 * Used to show the on-screen D-pad only where a physical keyboard isn't available.
 */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const update = () => setIsTouch(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return isTouch
}
