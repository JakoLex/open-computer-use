"use client"

import { ThemeProvider } from "next-themes"

export function LayoutClient() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      {null}
    </ThemeProvider>
  )
}
