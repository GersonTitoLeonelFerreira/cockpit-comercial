// Redimensionador de PNG sem dependências externas (usa apenas node:zlib).
//
// Suporta exclusivamente o formato do arquivo de origem já existente em
// assets/yolen-mark.png: PNG não entrelaçado, 8 bits por canal, RGBA
// (colorType 6). Isso é suficiente para gerar os tamanhos de ícone da
// extensão a partir da identidade visual já aprovada, sem redesenhá-la e
// sem adicionar nenhuma dependência de terceiros ao projeto.

import { inflateSync, deflateSync } from 'node:zlib'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function readChunks(pngBuffer) {
  if (!pngBuffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Arquivo não é um PNG válido (assinatura ausente).')
  }

  const chunks = []
  let offset = 8

  while (offset < pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(offset)
    const type = pngBuffer.toString('ascii', offset + 4, offset + 8)
    const data = pngBuffer.subarray(offset + 8, offset + 8 + length)
    chunks.push({ type, data })
    offset += 8 + length + 4
  }

  return chunks
}

function paethPredictor(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

function unfilter(raw, width, height, bytesPerPixel) {
  const stride = width * bytesPerPixel
  const out = Buffer.alloc(stride * height)
  let rawOffset = 0

  for (let y = 0; y < height; y += 1) {
    const filterType = raw[rawOffset]
    rawOffset += 1
    const rowStart = y * stride
    const prevRowStart = (y - 1) * stride

    for (let x = 0; x < stride; x += 1) {
      const rawByte = raw[rawOffset + x]
      const a = x >= bytesPerPixel ? out[rowStart + x - bytesPerPixel] : 0
      const b = y > 0 ? out[prevRowStart + x] : 0
      const c = y > 0 && x >= bytesPerPixel ? out[prevRowStart + x - bytesPerPixel] : 0

      let value
      switch (filterType) {
        case 0:
          value = rawByte
          break
        case 1:
          value = rawByte + a
          break
        case 2:
          value = rawByte + b
          break
        case 3:
          value = rawByte + Math.floor((a + b) / 2)
          break
        case 4:
          value = rawByte + paethPredictor(a, b, c)
          break
        default:
          throw new Error(`Filtro de scanline PNG não suportado: ${filterType}`)
      }

      out[rowStart + x] = value & 0xff
    }

    rawOffset += stride
  }

  return out
}

export function decodePng(pngBuffer) {
  const chunks = readChunks(pngBuffer)
  const ihdr = chunks.find((chunk) => chunk.type === 'IHDR')
  if (!ihdr) {
    throw new Error('PNG sem chunk IHDR.')
  }

  const width = ihdr.data.readUInt32BE(0)
  const height = ihdr.data.readUInt32BE(4)
  const bitDepth = ihdr.data.readUInt8(8)
  const colorType = ihdr.data.readUInt8(9)
  const interlace = ihdr.data.readUInt8(12)

  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(
      'Somente PNG 8-bit RGBA não entrelaçado é suportado por este redimensionador ' +
        `(recebido: bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}).`,
    )
  }

  const idat = Buffer.concat(
    chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data),
  )
  const raw = inflateSync(idat)
  const pixels = unfilter(raw, width, height, 4)

  return { width, height, pixels }
}

function boxDownscale(source, targetSize) {
  const { width, height, pixels } = source
  const out = Buffer.alloc(targetSize * targetSize * 4)
  const scaleX = width / targetSize
  const scaleY = height / targetSize

  for (let ty = 0; ty < targetSize; ty += 1) {
    const srcYStart = Math.floor(ty * scaleY)
    const srcYEnd = Math.max(srcYStart + 1, Math.floor((ty + 1) * scaleY))

    for (let tx = 0; tx < targetSize; tx += 1) {
      const srcXStart = Math.floor(tx * scaleX)
      const srcXEnd = Math.max(srcXStart + 1, Math.floor((tx + 1) * scaleX))

      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let count = 0

      for (let sy = srcYStart; sy < srcYEnd; sy += 1) {
        for (let sx = srcXStart; sx < srcXEnd; sx += 1) {
          const idx = (sy * width + sx) * 4
          r += pixels[idx]
          g += pixels[idx + 1]
          b += pixels[idx + 2]
          a += pixels[idx + 3]
          count += 1
        }
      }

      const outIdx = (ty * targetSize + tx) * 4
      out[outIdx] = Math.round(r / count)
      out[outIdx + 1] = Math.round(g / count)
      out[outIdx + 2] = Math.round(b / count)
      out[outIdx + 3] = Math.round(a / count)
    }
  }

  return { width: targetSize, height: targetSize, pixels: out }
}

function writeChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)
  return Buffer.concat([length, typeAndData, crc])
}

export function encodePng({ width, height, pixels }) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.writeUInt8(8, 8)
  ihdr.writeUInt8(6, 9)
  ihdr.writeUInt8(0, 10)
  ihdr.writeUInt8(0, 11)
  ihdr.writeUInt8(0, 12)

  const stride = width * 4
  const filtered = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    filtered[y * (stride + 1)] = 0
    pixels.copy(filtered, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }

  const idatData = deflateSync(filtered, { level: 9 })

  return Buffer.concat([
    PNG_SIGNATURE,
    writeChunk('IHDR', ihdr),
    writeChunk('IDAT', idatData),
    writeChunk('IEND', Buffer.alloc(0)),
  ])
}

export function resizePngSquare(pngBuffer, targetSize) {
  const decoded = decodePng(pngBuffer)
  if (decoded.width !== decoded.height) {
    throw new Error('Redimensionamento espera um PNG de origem quadrado.')
  }
  if (targetSize > decoded.width) {
    throw new Error('Este utilitário só faz downscale (reduz), não amplia ícones.')
  }
  const resized = boxDownscale(decoded, targetSize)
  return encodePng(resized)
}
