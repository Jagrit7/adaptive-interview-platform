"use client"

import { useEffect, useRef } from "react"

/**
 * Custom hook that automatically scrolls a container to the bottom when its content changes
 * Uses MutationObserver to detect DOM changes and scrolls the container accordingly
 *
 * @param ref - React ref to the scrollable container element
 * @param enabled - Whether auto-scroll is enabled (default: true)
 * @returns An object with control methods for the auto-scroll behavior
 *
 * @example
 * const containerRef = useRef<HTMLDivElement>(null)
 * useAutoScroll(containerRef)
 *
 * return <div ref={containerRef}>...</div>
 */
export function useAutoScroll(ref: React.RefObject<HTMLElement | null>, enabled: boolean = true) {
  const observerRef = useRef<MutationObserver | null>(null)

  useEffect(() => {
    if (!enabled || !ref.current) return

    const callback: MutationCallback = (mutationList) => {
      mutationList.forEach((mutation) => {
        if (mutation.type === "childList" && ref.current) {
          // Scroll to bottom when content changes
          ref.current.scrollTop = ref.current.scrollHeight
        }
      })
    }

    // Create and start observing
    observerRef.current = new MutationObserver(callback)
    observerRef.current.observe(ref.current, {
      childList: true,
      subtree: true,
    })

    // Initial scroll to bottom
    ref.current.scrollTop = ref.current.scrollHeight

    // Cleanup on unmount
    return () => {
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, [ref, enabled])

  return {
    scrollToBottom: () => {
      if (ref.current) {
        ref.current.scrollTop = ref.current.scrollHeight
      }
    },
  }
}
