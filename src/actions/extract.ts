import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import minimist from 'minimist';
import { join } from 'path';
import { BBIN } from '../models/bbin';
import { ISA } from '../models/isa';
import { ISC } from '../models/isc';
import { TEX } from '../models/tex';

function writeFile(out: string | undefined, name: string, data: Buffer) {
  let path = name;
  if (out) {
    path = join(out, path);
  }
  writeFileSync(path, data);
}

async function extract(buf: Buffer, out: string | undefined) {
  if (TEX.match(buf)) {
    const tex = TEX.load(buf);
    for (const entry of tex.entries) {
      console.log(entry.name);
      const image = await TEX.decode(entry);
      writeFile(out, entry.name, image);
    }
  } else if (BBIN.match(buf)) {
    const bbin = BBIN.load(buf);
    for (const file of bbin.files) {
      await extract(file, out);
    }
  } else if (ISC.match(buf)) {
    const isc = ISC.load(buf);
    const fileName = isc.name.substring(isc.name.lastIndexOf('/') + 1);
    console.log(fileName);
    writeFile(out, fileName, buf);
  } else if (ISA.match(buf)) {
    const isa = ISA.load(buf);
    const fileName = isa.name.substring(isa.name.lastIndexOf('/') + 1);
    console.log(fileName);
    writeFile(out, fileName, buf);
  }
}

interface Args {
  out: string;
  _: string[];
}

export async function main(args: string[]) {
  const parsedArgs = minimist(args) as Args;
  if (parsedArgs._.length === 0) {
    console.log('usage: pad-resources extract [--out <output directory>] <bin files>...');
    return false;
  }

  const files: string[] = [];
  for (const pattern of parsedArgs._) {
    files.push(...glob.sync(pattern));
  }
  for (const file of files) {
    const buf = readFileSync(file);
    await extract(buf, parsedArgs.out);
  }
  return true;
}
