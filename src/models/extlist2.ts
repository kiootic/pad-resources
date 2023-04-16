// https://github.com/TsubakiBotPad/pad-visual-media/blob/8970be758c8eaf6ef1954c9fe1ee64a04b0c789f/src/models/extlist2.ts

export interface Extlist2 {
  numMons: number;
  numCards: number;
  checksum: number;
  entries: Extlist2Entry[];
}

export interface Extlist2Entry {
  isCards: boolean;
  id: number;
  width: number;
  height: number;
  numFrames: number;
  frameRate: number;
  checksum: number;
  size: number;
  lastUpdate: number;
  compressedSize: number;
  compressedChecksum: number;
}

export const Extlist2 = {
  load(buf: Buffer): Extlist2 {
    const numMons = buf.readUInt32LE(0);
    const numCards = buf.readUInt32LE(4);
    const sig = buf.readUInt32LE(8);
    const checksum = buf.readUInt32LE(12);
    if (sig !== 0x32545845) {  // EXT2
      throw new Error('invalid extlist2.bin signature');
    }

    const entries: Extlist2Entry[] = [];
    const numEntries = numMons + numCards;
    const compressedInfoOffset = 0x10 + numEntries * 24;
    for (let i = 0; i < numEntries; i++) {
      const flags = buf.readUInt16LE(0x10 + i * 24 + 0);
      const isCards = flags > 50000;
      const id = flags % 50000;
      if (id === 0) continue;

      entries.push({
        isCards,
        id,
        width: buf.readUInt16LE(0x10 + i * 24 + 6),
        height: buf.readUInt16LE(0x10 + i * 24 + 8),
        numFrames: buf.readUInt16LE(0x10 + i * 24 + 10),
        frameRate: buf.readUInt16LE(0x10 + i * 24 + 12),
        checksum: buf.readUInt16LE(0x10 + i * 24 + 14),
        size: buf.readUInt32LE(0x10 + i * 24 + 16),
        lastUpdate: buf.readUInt32LE(0x10 + i * 24 + 20),
        compressedSize: buf.readUInt32LE(compressedInfoOffset + i * 8 + 0),
        compressedChecksum: buf.readUInt32LE(compressedInfoOffset + i * 8 + 4),
      });
    }

    return {
      numMons,
      numCards,
      checksum,
      entries,
    };
  },
};
