"use client"

import { useEffect } from "react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Application error:", error)
  }, [error])

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a0f] text-white">
      <div className="text-center max-w-md px-6">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-white/40 mt-2">An unexpected error occurred.</p>
        <button
          onClick={reset}
          className="mt-4 text-sm font-medium text-white/60 hover:text-white transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
