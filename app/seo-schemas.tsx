export function FAQSchema() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is Coasty Command?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Coasty Command is a standalone computer-use daemon that exposes 50+ commands via MCP stdio and WebSocket, allowing AI agents to control your desktop, browse the web, manage files, and execute terminal commands.",
        },
      },
      {
        "@type": "Question",
        "name": "How do I connect a daemon to an AI agent?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Run the daemon with `coasty-command stdio` for MCP stdio mode (Claude Desktop, Cursor, etc.) or `coasty-command ws 8765` for WebSocket mode. Connect your AI agent to the daemon endpoint.",
        },
      },
      {
        "@type": "Question",
        "name": "What platforms are supported?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Windows (PowerShell), macOS (osascript/CoreGraphics), and Linux (xdotool/wmctrl). Automatic browser detection for Chrome, Edge, Brave.",
        },
      },
    ],
  }

  return (
    <script
      id="faq-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
    />
  )
}
