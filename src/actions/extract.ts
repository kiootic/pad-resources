import { readFileSync, writeFileSync } from 'fs';
import { BBIN } from '../models/bbin';
import { ISA } from '../models/isa';
import { ISC } from '../models/isc';
import { TEX } from '../models/tex';

async function extract(buf: Buffer) {
  if (TEX.match(buf)) {
    const tex = TEX.load(buf);
    for (const entry of tex.entries) {
      console.log(entry.name);
      const image = await TEX.decode(entry);
      writeFileSync(entry.name, image);
    }
  } else if (BBIN.match(buf)) {
    const bbin = BBIN.load(buf);
    for (const file of bbin.files) {
      await extract(file);
    }
  } else if (ISC.match(buf)) {
    const isc = ISC.load(buf);
    const fileName = isc.name.substring(isc.name.lastIndexOf('/') + 1);
    console.log(fileName);
    writeFileSync(fileName, buf);
  } else if (ISA.match(buf)) {
    const isa = ISA.load(buf);
    const fileName = isa.name.substring(isa.name.lastIndexOf('/') + 1);
    console.log(fileName);
    writeFileSync(fileName, buf);
  }
}

export async function main(args: string[]) {
  if (args.length === 0) {
    console.log('usage: pad-resources extract <bin files>...');
    return false;
  }

  for (const file of args) {
    const buf = readFileSync(file);
    await extract(buf);
  }
  return true;
}
