"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

function getStatusIcon(healthy: boolean) {
  return (
    <div
      className={cn(
        "w-3 h-3 rounded-full mr-2 inline-block shrink-0",
        healthy ? "bg-emerald-400 animate-pulse" : "bg-red-400"
      )}
    />
  )
}

function HealthCard({ name, detail, healthy }: { name: string; detail: string; healthy?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white/5 border border-white/10 rounded-lg">
      <div className="flex items-center">
        {getStatusIcon(healthy ?? true)}
        <span className="text-white/60 text-sm">{name}</span>
        <span className="text-white/30 mx-2">â†’</span>
        <span className="text-white/90 text-sm">{detail}</span>
      </div>
    </div>
  )
}

function StatusPanel({ title, cards }: { title: string; cards: { name: string; detail: string; healthy?: boolean }[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-white/40 text-xs uppercase tracking-widest font-medium">{title}</h3>
      <div className="space-y-1.5 [&>div]:transition-all [&>div]:duration-200">
        {cards.map((card) => (
          <HealthCard key={card.name} name={card.name} detail={card.detail} healthy={card.healthy} />
        ))}
      </div>
    </div>
  )
}

export function HomeClient() {
  const [daemonUrl] = useState(
    process.env.NEXT_PUBLIC_DAEMON_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      "http://localhost:8765"
  )
  const [daemonStatus, setDaemonStatus] = useState<"loading" | "online" | "offline">("loading")
  const [daemonInfo, setDaemonInfo] = useState<Record<string, any>>({})

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch(`${daemonUrl}/status`)
        .then((r) => r.json())
        .then((data: any) => {
          setDaemonStatus(data.status === "running" ? "online" : "offline")
          setDaemonInfo(data)
        })
        .catch(() => setDaemonStatus("offline"))
    }, 800)
    return () => clearTimeout(timer)
  }, [daemonUrl])

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      {/* Top bar */}
      <div className="border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center mr-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.36 2.278a4.484 4.484 0 0 1 1.763-.368c2.483 0 4.5 2.017 4.5 4.5a4.484 4.484 0 0 1-.368 1.763l4.175 4.176a1 1 0 0 1-1.415 1.414l-4.175-4.175A4.484 4.484 0 0 1 14.89 9.378c-2.483 0-4.5-2.018-4.5-4.5c0-.633.124-1.244.368-1.764l-4.175-4.175a1 1 0 0 1 1.415-1.414l4.175 4.175ZM20.5 13.5l-4.5-4.5a2.5 2.5 0 1 0-3.5 3.5l4.5 4.5a2.5 2.5 0 1 0 3.5-3.5ZM9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8-8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
            </svg>
          </div>
          <span className="font-semibold text-sm text-white/80">coasty</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/jakolex/open-computer-use"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/40 hover:text-white/70 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          </a>
        </div>
      </div>

      {/* Grid layout */}
      <div className="flex-1 p-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 max-w-3xl mx-auto w-full pt-16">
          {/* Left side: daemon status */}
          <StatusPanel
            title="daemon"
            cards={[
              {
                name: "coasty-command",
                detail: daemonStatus === "online" ? "online" : "offline",
                healthy: daemonStatus === "online",
              },
              { name: "mcp stdio", detail: "available" },
              { name: "ws bridge", detail: "available" },
              { name: "commands", detail: "57" },
              { name: "uptime", detail: daemonStatus === "online" ? `${Math.round(daemonInfo.uptime || 0)}s` : "--" },
              { name: "token auth", detail: "enabled" },
              {
                name: "connection",
                detail:
                  daemonStatus === "online"
                    ? `${daemonInfo.connections || 0} active`
                    : "disconnected",
                healthy: false,
              },
            ]}
          />

          {/* Right side: system info */}
          <StatusPanel
            title="system"
            cards={[
              { name: "platform", detail: `${navigator.platform}` },
              { name: "display", detail: `${screen.width}x${screen.height}` },
              { name: "browser", detail: navigator.userAgent.split(" ")[0] },
              { name: "arch", detail: `${navigator.hardwareConcurrency || "?"} cores` },
              { name: "memory", detail: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ? `${(navigator as Navigator & { deviceMemory?: number }).deviceMemory} GB` : "?" },
              { name: "transport", detail: "browser" },
            ]}
          />
        </div>

        {/* Bottom: quick actions */}
        <div className="mt-auto pt-12 max-w-3xl mx-auto w-full">
          <div className="flex flex-col gap-2 text-white/30 text-xs">
            <div>
              <span className="text-white/50">daemon url:</span> {daemonUrl}
            </div>
            <div>
              <span className="text-white/50">daemon package:</span>{" "}
              <a
                href={`${daemonUrl}/`}
                className="hover:text-white transition-colors"
              >
                status endpoint
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
