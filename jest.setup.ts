import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'
import { webcrypto } from 'crypto'
import { ReadableStream, WritableStream, TransformStream } from 'stream/web'
Object.assign(global, { TextEncoder, TextDecoder, ReadableStream, WritableStream, TransformStream })
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true })
