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
  L8 = 8,
  RAW = 13,
}

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

      let length = 0;
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
        case TEXEncoding.L8:
          length = width * height * 1;
          break;
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
};
