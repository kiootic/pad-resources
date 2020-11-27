import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import minimist from 'minimist';
import { basename, extname, join } from 'path';
import sharp from 'sharp';
import { BBIN } from '../models/bbin';
import { ISA } from '../models/isa';
import { ISC } from '../models/isc';
import { loadISA, loadISC } from '../models/spine';
import { SpineAtlas } from '../models/spine-atlas';
import { SpineSkeleton } from '../models/spine-skeleton';
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
    const images = new Map<string, Buffer>();
    let isc: ISC | null = null;
    const isas: ISA[] = [];
    for (const file of bbin.files) {
      if (TEX.match(file)) {
        const tex = TEX.load(file);
        for (const entry of tex.entries) {
          const image = await TEX.decode(entry);
          images.set(entry.name, image);
        }
      } else if (ISC.match(file)) {
        isc = ISC.load(file);
      } else if (ISA.match(file)) {
        isas.push(ISA.load(file));
      }
    }
    if (isc) {
      await convertSpineModel(isc, isas, images, out);
    }
  }
}

async function convertSpineModel(isc: ISC, isas: ISA[], images: Map<string, Buffer>, out: string | undefined) {
  const name = basename(isc.name, extname(isc.name));

  const atlas: SpineAtlas = { images: [] };
  for (const [name, data] of images.entries()) {
    const meta = await sharp(data).metadata();
    atlas.images.push({
      name, data,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      regions: [{
        name,
        x: 0,
        y: 0,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
      }]
    });
  }

  const skeleton: SpineSkeleton = {
    skeleton: {},
    bones: [],
    slots: [],
    skins: [],
    animations: {},
    __attachments: {},
  };
  loadISC(isc, skeleton, atlas);
  for (const isa of isas) {
    let isaName = basename(isa.name, extname(isa.name));
    if (isa === isas[0]) {
      isaName = "animation";
    } else if (isaName.startsWith(name + "_")) {
      isaName = isaName.substring(name.length + 1);
    }
    loadISA(isaName, isc, isa, skeleton);
  }

  for (const [name, data] of images) {
    console.log(name);
    writeFile(out, name, data);
  }
  console.log(`${name}.json`);
  writeFile(out, `${name}.json`, Buffer.from(JSON.stringify(skeleton, null, 2)));
  console.log(`${name}.atlas`);
  writeFile(out, `${name}.atlas`, SpineAtlas.export(atlas));
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
