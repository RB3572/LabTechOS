// ---------------------------------------------------------------------------
// Web Serial link — talks G-code to a 3D printer over USB.
// Requires a Chromium browser (Chrome/Edge) served over https or localhost.
// ---------------------------------------------------------------------------

type LineListener = (line: string) => void

interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
}

class SerialLink {
  private port: SerialPortLike | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private listeners = new Set<LineListener>()
  private active = false
  private encoder = new TextEncoder()

  /** Whether this browser exposes the Web Serial API. */
  get supported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator
  }

  get connected(): boolean {
    return this.port !== null
  }

  /** Subscribe to incoming lines (firmware responses). Returns an unsubscribe. */
  onLine(fn: LineListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  async connect(baudRate = 115200): Promise<void> {
    if (!this.supported) {
      throw new Error('Web Serial is not available — use Chrome or Edge.')
    }
    // Prompts the user to pick a port (must be triggered by a click).
    const nav = navigator as unknown as {
      serial: { requestPort(): Promise<SerialPortLike> }
    }
    this.port = await nav.serial.requestPort()
    await this.port.open({ baudRate })
    this.writer = this.port.writable!.getWriter()
    this.reader = this.port.readable!.getReader()
    this.active = true
    void this.readLoop()
  }

  private async readLoop(): Promise<void> {
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (this.active && this.reader) {
        const { value, done } = await this.reader.read()
        if (done) break
        if (value) {
          buffer += decoder.decode(value, { stream: true })
          let nl: number
          while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).trim()
            buffer = buffer.slice(nl + 1)
            if (line) this.listeners.forEach((l) => l(line))
          }
        }
      }
    } catch {
      /* reader cancelled on disconnect */
    }
  }

  /** Send one G-code line. */
  async send(gcode: string): Promise<void> {
    if (!this.writer) return
    const line = gcode.endsWith('\n') ? gcode : `${gcode}\n`
    await this.writer.write(this.encoder.encode(line))
  }

  async disconnect(): Promise<void> {
    this.active = false
    try {
      await this.reader?.cancel()
    } catch {
      /* noop */
    }
    try {
      this.reader?.releaseLock()
    } catch {
      /* noop */
    }
    try {
      await this.writer?.close()
    } catch {
      /* noop */
    }
    try {
      this.writer?.releaseLock()
    } catch {
      /* noop */
    }
    try {
      await this.port?.close()
    } catch {
      /* noop */
    }
    this.reader = null
    this.writer = null
    this.port = null
  }
}

export const serial = new SerialLink()

/** Parse a Marlin `M114` position report, e.g. "X:10.00 Y:5.00 Z:3.00 …". */
export function parseM114(line: string): { x: number; y: number; z: number } | null {
  const m = line.match(/X:\s*(-?\d+\.?\d*)\s+Y:\s*(-?\d+\.?\d*)\s+Z:\s*(-?\d+\.?\d*)/)
  if (!m) return null
  return { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) }
}

/** Build a relative jog: G91 → move → G90. */
export function jogGcode(dx: number, dy: number, dz: number, feed: number): string[] {
  const parts: string[] = []
  if (dx) parts.push(`X${dx}`)
  if (dy) parts.push(`Y${dy}`)
  if (dz) parts.push(`Z${dz}`)
  if (!parts.length) return []
  return ['G91', `G0 ${parts.join(' ')} F${feed}`, 'G90', 'M114']
}
