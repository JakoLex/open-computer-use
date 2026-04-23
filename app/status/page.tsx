"use client"

import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import type { ServiceCheck, StatusResponse } from "@/lib/status"

const STATUS_CONFIG: Record<string, { color: string }> = {
  operational:  { color: "text-emerald-400" },
  degraded:     { color: "text-amber-400" },
  outage:       { color: "text-rose-400" },
}

export default function StatusPage() {
  const [data, setData] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status")
      if (!res.ok) { setData(null); setLoading(false); return }
      const json = await res.json()
      setData(json)
    } catch { setData(null) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold">coasty status</h1>
        </div>

        {loading ? (
          <div className="h-14 rounded-xl bg-white/5 animate-pulse" />
        ) : data ? (
          <>
            <div className={cn(
              "rounded-xl border p-4 flex items-center gap-3",
              data.overall === "operational" ? "border-emerald-500/20 bg-emerald-500/5" :
              data.overall === "degraded" ? "border-amber-500/20 bg-amber-500/5" :
              "border-rose-500/20 bg-rose-500/5"
            )}>
              <div className={cn("w-3 h-3 rounded-full",
                data.overall === "operational" ? "bg-emerald-400" :
                data.overall === "degraded" ? "bg-amber-400" : "bg-rose-400"
              )} />
              <span className={cn("font-medium", STATUS_CONFIG[data.overall]?.color)}>
                {data.overall === "operational"
                  ? "All systems operational"
                  : data.overall}
              </span>
            </div>
            {data.services.map((s) => (
              <div key={s.name} className="rounded-xl border border-white/5 p-3 flex items-center justify-between">
                <span className="text-sm text-white/70">{s.name}</span>
                <span className={cn("text-xs font-medium", STATUS_CONFIG[s.status]?.color)}>
                  {s.status}
                </span>
              </div>
            ))}
          </>
        ) : (
          <div className="text-rose-400 text-sm">Unable to load status</div>
        )}
      </div>
    </main>
  )
}
