import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { OpponentsProvider } from '@/components/OpponentsProvider'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Board Games Dashboard',
  description: 'All your active board games in one place',
}

// Sets data-theme before anything paints, straight from localStorage — the
// same cache usePrefs() seeds its first paint from, read synchronously here
// instead of waiting on React/the server round trip. Without this, a saved
// "dark" choice would flash the light page for a moment on every load.
// No saved override (or "system") leaves the attribute unset, so
// globals.css's prefers-color-scheme media query decides as before.
const THEME_SCRIPT = `
try {
  var p = JSON.parse(localStorage.getItem('user-prefs') || 'null')
  if (p && (p.theme === 'light' || p.theme === 'dark')) document.documentElement.setAttribute('data-theme', p.theme)
} catch {}
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <OpponentsProvider>{children}</OpponentsProvider>
      </body>
    </html>
  )
}
