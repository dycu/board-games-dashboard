import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import crypto from 'crypto'

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    // Compare anyway to avoid leaking length via timing
    crypto.timingSafeEqual(Buffer.alloc(bufA.length), Buffer.alloc(bufA.length))
    return false
  }
  return crypto.timingSafeEqual(bufA, bufB)
}

export function proxy(request: NextRequest) {
  const authHeader = request.headers.get('authorization')

  if (authHeader?.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8')
      const colonIdx = decoded.indexOf(':')
      if (colonIdx !== -1) {
        const username = decoded.slice(0, colonIdx)
        const password = decoded.slice(colonIdx + 1)
        const expectedUsername = process.env.AUTH_USERNAME ?? ''
        const expectedPassword = process.env.AUTH_PASSWORD ?? ''
        if (timingSafeEqual(username, expectedUsername) && timingSafeEqual(password, expectedPassword)) {
          return NextResponse.next()
        }
      }
    } catch {
      // invalid base64 — fall through to 401
    }
  }

  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Board Games Dashboard", charset="UTF-8"',
    },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
