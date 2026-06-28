import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'
import { webcrypto } from 'crypto'
Object.assign(global, { TextEncoder, TextDecoder })
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true })
