export default function ApiDocsPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">API Documentation</h1>
        <p className="text-white/40">
          The Coasty Command daemon exposes 57 computer-use commands via{" "}
          <strong>MCP stdio</strong> or <strong>WebSocket</strong>.
        </p>

        <div className="mt-8 space-y-6 text-sm text-white/60 leading-relaxed">
          <div>
            <h2 className="text-white/80 font-semibold mb-2">MCP (Model Context Protocol)</h2>
            <p>Run the daemon with <code className="bg-white/10 px-1.5 py-0.5 rounded">stdio</code> to connect any MCP-compatible agent:</p>
            <pre className="bg-white/5 p-3 rounded-lg mt-2 overflow-x-auto">coasty-command stdio</pre>
          </div>
          <div>
            <h2 className="text-white/80 font-semibold mb-2">WebSocket</h2>
            <p>Start a server and connect clients:</p>
            <pre className="bg-white/5 p-3 rounded-lg mt-2 overflow-x-auto">coasty-command ws 8765</pre>
          </div>
          <div>
            <h2 className="text-white/80 font-semibold mb-2">Status</h2>
            <p>Check daemon health at <code className="bg-white/10 px-1.5 py-0.5 rounded">GET /api/status</code>.</p>
          </div>
        </div>
      </div>
    </main>
  )
}
