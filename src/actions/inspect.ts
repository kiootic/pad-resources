import { readFileSync } from 'fs';
import { BBIN } from '../models/bbin';
import { ISA } from '../models/isa';
import { ISC } from '../models/isc';
import { TEX, TEXEncoding } from '../models/tex';

function inspect(buf: Buffer) {
  if (TEX.match(buf)) {
    const tex = TEX.load(buf);
    for (const entry of tex.entries) {
      console.log(`${entry.name}: ${entry.width}x${entry.height}, encoding: ${TEXEncoding[entry.encoding]}`);
    }
  } else if (BBIN.match(buf)) {
    const bbin = BBIN.load(buf);
    for (const file of bbin.files) {
      inspect(file);
    }
  } else if (ISC.match(buf)) {
    const isc = ISC.load(buf);
    console.log(isc);
  } else if (ISA.match(buf)) {
    const isa = ISA.load(buf);
    console.log(isa);
  }
}

export async function main(args: string[]) {
  if (args.length !== 1) {
    console.log('usage: pad-resources inspect <file>');
    return false;
  }

  const buf = readFileSync(args[0]);
  inspect(buf);
  return true;
}
