export interface BBIN {
  files: Buffer[];
}

export const BBIN = {
  match(buf: Buffer): boolean {
    return buf.length >= 4 && buf.readUInt32LE(0) === 0x4e494242;
  },
  load(buf: Buffer): BBIN {
    const numFiles = buf.readUInt32LE(4);
    const files: Buffer[] = [];
    for (let i = 0; i < numFiles; i++) {
      const offset = buf.readUInt32LE(16 + i * 8 + 0);
      const size = buf.readUInt32LE(16 + i * 8 + 4);
      files.push(buf.slice(offset, offset + size));
    }
    return { files };
  },
};
