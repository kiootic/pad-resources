import { readASCII } from '../utils';

// tslint:disable-next-line:interface-name
export interface ISC {
  version: string;
  name: string;
}

export const ISC = {
  match(buf: Buffer): boolean {
    return buf.length >= 4 && buf.readUInt32LE(0) === 0x32435349;
  },
  load(buf: Buffer): ISC {
    const version = buf.slice(4, 8).toString();
    const name = readASCII(buf, buf.readUInt32LE(16));
    return { version, name };
  },
};
