import { inflateRawSync } from 'zlib';

export interface BC {
  checksum: number;
  data: Buffer;
}

export const BC = {
  load(buf: Buffer): BC {
    const envSig = buf.slice(0, 5).toString();
    if (envSig !== 'IOSCh') {
      throw new Error(`invalid bc signature: ${envSig}`);
    }

    const key = buf[5];
    const compressedData = buf.slice(12);
    for (let i = 0; i < compressedData.length; i++)
      compressedData[i] ^= key;
    const data = inflateRawSync(compressedData);

    return { data, checksum: buf.readUInt16LE(6) };
  },
};
