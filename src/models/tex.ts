import { range } from 'lodash';
import Sharp from 'sharp';

export interface TEX {
  entries: TEXEntry[];
}

export interface TEXEntry {
  encoding: TEXEncoding;
  width: number;
  height: number;
  name: string;
  data: Buffer;
}

export enum TEXEncoding {
  R8G8B8A8 = 0,
  R5G6B5 = 2,
  R4G4B4A4 = 3,
  R5G5B5A1 = 4,
  RAW = 13,
}

function createDecodeTable(a: number, b: number, g: number, r: number) {
  function decodeChannel(data: number, bits: number) {
    const mask = (1 << bits) - 1;
    return ((data & mask) / mask * 255) >>> 0;
  }
  function decodePixel(data: number) {
    let pix = 0;
    pix += decodeChannel(data, a); data >>>= a; pix *= 256;
    pix += decodeChannel(data, b); data >>>= b; pix *= 256;
    pix += decodeChannel(data, g); data >>>= g; pix *= 256;
    pix += decodeChannel(data, r); data >>>= r;
    if (a === 0) pix += 0xff000000;
    return pix;
  }

  const lookup = Buffer.alloc(0x10000 * 4);
  for (const pix of range(0x10000))
    lookup.writeUInt32LE(decodePixel(pix), pix * 4);
  return lookup;
}

const decodeTables = {
  [TEXEncoding.R5G6B5]: createDecodeTable(0, 5, 6, 5),
  [TEXEncoding.R4G4B4A4]: createDecodeTable(4, 4, 4, 4),
  [TEXEncoding.R5G5B5A1]: createDecodeTable(1, 5, 5, 5),
};

export const TEX = {
  match(buf: Buffer): boolean {
    return buf.length >= 4 && (
      buf.readUInt32LE(0) === 0x31584554 ||
      buf.readUInt32LE(0) === 0x32584554
    );
  },
  load(buf: Buffer): TEX {
    const numTexs = buf.readUInt32LE(4);
    const entries: TEXEntry[] = [];

    for (let index = 0; index < numTexs; index++) {
      const position = 16 + index * 32;
      const offset = buf.readInt32LE(position + 0);
      const flags = buf.readUInt32LE(position + 4);
      const name = buf.slice(position + 8, position + 28).toString().replace(/\0*$/g, '');

      const encoding: TEXEncoding = (flags >> 12) & 0xf;
      const width = (flags & 0x00000fff) >> 0;
      const height = (flags & 0x0fff0000) >> 16;

      let length;
      switch (encoding) {
        case TEXEncoding.RAW:
          length = buf.readUInt32LE(16 + index * 32 + 28);
          break;
        case TEXEncoding.R8G8B8A8:
          length = width * height * 4;
          break;
        case TEXEncoding.R5G6B5:
        case TEXEncoding.R4G4B4A4:
        case TEXEncoding.R5G5B5A1:
          length = width * height * 2;
          break;
        default:
          throw new Error(`unsupported encoding: ${encoding}`);
      }
      const data = buf.slice(offset, offset + length);

      entries.push({
        encoding,
        width, height,
        name,
        data,
      });
    }
    return { entries };
  },
  decodeRaw(entry: TEXEntry): Buffer {
    const pixBuf = Buffer.alloc(entry.width * entry.height * 4);
    if (entry.encoding === TEXEncoding.R8G8B8A8) {
      entry.data.copy(pixBuf);
    } else {
      const decodeTable = decodeTables[entry.encoding];
      const numPix = entry.width * entry.height;
      for (let i = 0; i < numPix; i++)
        pixBuf.writeUInt32LE(decodeTable.readUInt32LE(entry.data.readUInt16LE(i * 2) * 4), i * 4);
    }
    return pixBuf;
  },
  async decode(entry: TEXEntry): Promise<Buffer> {
    if (entry.encoding === TEXEncoding.RAW) {
      return entry.data;
    } else {
      const pixBuf = Buffer.alloc(entry.width * entry.height * 4);
      if (entry.encoding === TEXEncoding.R8G8B8A8) {
        entry.data.copy(pixBuf);
      } else {
        const decodeTable = decodeTables[entry.encoding];
        const numPix = entry.width * entry.height;
        for (let i = 0; i < numPix; i++)
          pixBuf.writeUInt32LE(decodeTable.readUInt32LE(entry.data.readUInt16LE(i * 2) * 4), i * 4);
      }

      const img = await Sharp(pixBuf, {
        raw: {
          width: entry.width,
          height: entry.height,
          channels: 4,
        },
      }).png().toBuffer();

      return img;
    }
  },
};
