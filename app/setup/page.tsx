'use client'
import { useState } from 'react'
import { Platform, PLATFORM_LABELS } from '@/lib/types'

const PLATFORMS: Platform[] = ['bga', 'eighteenxx', 'obg', 'yucata', 'choochoo', 'hansa', 'rally']

const ENV_KEYS: Record<Platform, [string, string]> = {
  bga: ['BGA_USERNAME', 'BGA_PASSWORD'],
  eighteenxx: ['EIGHTEENXX_USERNAME', 'EIGHTEENXX_PASSWORD'],
  obg: ['OBG_USERNAME', 'OBG_PASSWORD'],
  yucata: ['YUCATA_USERNAME', 'YUCATA_PASSWORD'],
  choochoo: ['CHOOCHOO_USERNAME', 'CHOOCHOO_PASSWORD'],
  hansa: ['HANSA_USERNAME', 'HANSA_PASSWORD'],
  rally: ['RALLY_USERNAME', 'RALLY_PASSWORD'],
}

type Status = 'idle' | 'testing' | 'ok' | 'error'

export default function SetupPage() {
  const [statuses, setStatuses] = useState<Record<Platform, Status>>(
    Object.fromEntries(PLATFORMS.map(p => [p, 'idle'])) as Record<Platform, Status>
  )
  const [errors, setErrors] = useState<Record<Platform, string>>({} as Record<Platform, string>)

  const test = async (platform: Platform) => {
    setStatuses(s => ({ ...s, [platform]: 'testing' }))
    const res = await fetch(`/api/test-connection?platform=${platform}`)
    const data = await res.json()
    setStatuses(s => ({ ...s, [platform]: data.ok ? 'ok' : 'error' }))
    if (!data.ok) setErrors(e => ({ ...e, [platform]: data.error }))
  }

  return (
    <div className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Setup</h1>
      <p className="text-slate-400 text-sm mb-8">
        Add your credentials as Vercel environment variables. They are stored securely server-side and never exposed to the browser.
      </p>

      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 mb-8">
        <h2 className="text-sm font-semibold mb-3">How to add env vars</h2>
        <ol className="text-sm text-slate-400 space-y-2 list-decimal list-inside">
          <li>Install Vercel CLI: <code className="bg-slate-800 px-1 rounded">npm i -g vercel</code></li>
          <li>Link project: <code className="bg-slate-800 px-1 rounded">vercel link</code></li>
          <li>Add each var below using the commands shown, then redeploy</li>
        </ol>
      </div>

      <div className="space-y-4">
        {PLATFORMS.map(platform => {
          const [userKey, passKey] = ENV_KEYS[platform]
          const status = statuses[platform]
          return (
            <div key={platform} className="bg-slate-900 rounded-xl border border-slate-800 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">{PLATFORM_LABELS[platform]}</h3>
                <div className="flex items-center gap-2">
                  {status === 'ok' && <span className="text-xs text-green-400">✓ Connected</span>}
                  {status === 'error' && <span className="text-xs text-red-400">✗ {errors[platform]}</span>}
                  <button
                    onClick={() => test(platform)}
                    disabled={status === 'testing'}
                    className="text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 px-3 py-1.5 rounded-md disabled:opacity-50">
                    {status === 'testing' ? 'Testing…' : 'Test connection'}
                  </button>
                </div>
              </div>
              <pre className="text-xs text-slate-400 bg-slate-950 rounded-lg p-3 overflow-x-auto">
{`vercel env add ${userKey}
vercel env add ${passKey}`}
              </pre>
            </div>
          )
        })}
      </div>

      <a
        href="/"
        className="mt-8 inline-block bg-blue-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-blue-600">
        Go to dashboard →
      </a>
    </div>
  )
}
