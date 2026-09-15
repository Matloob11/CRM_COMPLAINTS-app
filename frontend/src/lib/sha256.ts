/**
 * Incremental SHA-256.
 *
 * `crypto.subtle.digest` is one-shot: it needs the entire file in memory, which
 * is not viable when a multi-gigabyte video is an expected upload. This is a
 * streaming implementation so the file can be hashed slice by slice while it
 * uploads, with a bounded memory footprint.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

export class Sha256Stream {
  private h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  private buffer = new Uint8Array(64)
  private bufferLength = 0
  private totalLength = 0
  private readonly w = new Uint32Array(64)

  update(data: Uint8Array): void {
    this.totalLength += data.length
    let offset = 0

    if (this.bufferLength > 0) {
      const need = 64 - this.bufferLength
      const take = Math.min(need, data.length)
      this.buffer.set(data.subarray(0, take), this.bufferLength)
      this.bufferLength += take
      offset = take
      if (this.bufferLength === 64) {
        this.block(this.buffer, 0)
        this.bufferLength = 0
      }
    }

    while (offset + 64 <= data.length) {
      this.block(data, offset)
      offset += 64
    }

    if (offset < data.length) {
      this.buffer.set(data.subarray(offset), 0)
      this.bufferLength = data.length - offset
    }
  }

  digestHex(): string {
    const bitLength = this.totalLength * 8
    const padLength = this.bufferLength < 56 ? 56 - this.bufferLength : 120 - this.bufferLength
    const tail = new Uint8Array(padLength + 8)
    tail[0] = 0x80
    const view = new DataView(tail.buffer)
    // JS bitwise ops are 32-bit; split the 64-bit length manually.
    view.setUint32(padLength, Math.floor(bitLength / 0x100000000))
    view.setUint32(padLength + 4, bitLength >>> 0)
    this.update(tail)

    let out = ''
    for (let i = 0; i < 8; i += 1) {
      out += (this.h[i] as number).toString(16).padStart(8, '0')
    }
    return out
  }

  private block(data: Uint8Array, offset: number): void {
    const w = this.w
    for (let i = 0; i < 16; i += 1) {
      const j = offset + i * 4
      w[i] =
        ((data[j] as number) << 24) |
        ((data[j + 1] as number) << 16) |
        ((data[j + 2] as number) << 8) |
        (data[j + 3] as number)
    }
    for (let i = 16; i < 64; i += 1) {
      const x = w[i - 15] as number
      const y = w[i - 2] as number
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)
      w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) | 0
    }

    let a = this.h[0] as number
    let b = this.h[1] as number
    let c = this.h[2] as number
    let d = this.h[3] as number
    let e = this.h[4] as number
    let f = this.h[5] as number
    let g = this.h[6] as number
    let h = this.h[7] as number

    for (let i = 0; i < 64; i += 1) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + (K[i] as number) + (w[i] as number)) | 0
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) | 0

      h = g
      g = f
      f = e
      e = (d + temp1) | 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) | 0
    }

    this.h[0] = ((this.h[0] as number) + a) | 0
    this.h[1] = ((this.h[1] as number) + b) | 0
    this.h[2] = ((this.h[2] as number) + c) | 0
    this.h[3] = ((this.h[3] as number) + d) | 0
    this.h[4] = ((this.h[4] as number) + e) | 0
    this.h[5] = ((this.h[5] as number) + f) | 0
    this.h[6] = ((this.h[6] as number) + g) | 0
    this.h[7] = ((this.h[7] as number) + h) | 0
  }
}

/** Convenience helper used by tests. */
export function sha256Hex(bytes: Uint8Array): string {
  const s = new Sha256Stream()
  s.update(bytes)
  return s.digestHex()
}
