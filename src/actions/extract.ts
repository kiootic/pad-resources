import fs from "fs";
import { glob } from "glob";
import minimist from "minimist";
import { basename, extname, join } from "path";
import sharp from "sharp";
import { BBIN } from "../models/bbin";
import { ISA } from "../models/isa";
import { ISC } from "../models/isc";
import { loadISA, loadISC } from "../models/spine";
import { SpineAtlas } from "../models/spine-atlas";
import { SpineSkeleton } from "../models/spine-skeleton";
import { TEX } from "../models/tex";

function writeFile(out: string, name: string, data: Buffer) {
  fs.writeFileSync(join(out, name), data);
}

async function extract(name: string, buf: Buffer, out: string, animatedOnly: boolean) {
  if (TEX.match(buf) && !animatedOnly) {
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
      await convertSpineModel(name, isc, isas, images, out);
    }
  }
}

async function convertSpineModel(
  name: string,
  isc: ISC,
  isas: ISA[],
  images: Map<string, Buffer>,
  out: string
) {
  switch (isc.type) {
    case 1:
      const atlas: SpineAtlas = { images: [] };
      for (const [name, data] of images.entries()) {
        const meta = await sharp(data).metadata();
        atlas.images.push({
          name,
          data,
          width: meta.width ?? 0,
          height: meta.height ?? 0,
          regions: [
            {
              name,
              x: 0,
              y: 0,
              width: meta.width ?? 0,
              height: meta.height ?? 0,
            },
          ],
        });
      }

      const skeleton: SpineSkeleton = {
        skeleton: {},
        bones: [],
        slots: [],
        skins: [],
        ik: [],
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
      writeFile(
        out,
        `${name}.json`,
        Buffer.from(JSON.stringify(skeleton, null, 2))
      );
      console.log(`${name}.atlas`);
      writeFile(out, `${name}.atlas`, SpineAtlas.export(atlas));
      break;

    case 2:
      for (const [imageName, data] of images) {
        const fileName = imageName.toLowerCase();
        console.log(fileName);
        writeFile(out, fileName, data);
      }

      console.log(`${name}.json`);
      writeFile(
        out,
        `${name}.json`,
        Buffer.from(JSON.stringify(isc.json, null, 2))
      );
      console.log(`${name}.atlas`);
      writeFile(out, `${name}.atlas`, Buffer.from(isc.atlas));
      break;
  }
}

export async function main(args: string[]) {
  const parsedArgs = minimist(args, {
    string: ['out'],
    boolean: ['help', 'animatedOnly']
  });
  if (parsedArgs._.length === 0 || parsedArgs.help) {
    console.log(
      "usage: pad-resources extract [--animated-only] [--out <output directory>] <bin files>...\n" + 
      "usage: pad-resources extract [--animated-only] [--out <output directory>] <input directory>"
    );
    return parsedArgs.help;
  }

  const files: string[] = [];
  for (const pattern of parsedArgs._) {
    if (fs.existsSync(pattern) && fs.lstatSync(pattern).isDirectory()) {
      files.push(...fs.readdirSync(pattern).map((fp) => join(pattern, fp)));
    } else {
      files.push(...glob.sync(pattern));
    }
  }
  for (const file of files) {
    const buf = fs.readFileSync(file);
    await extract(basename(file, extname(file)), buf, parsedArgs.out ?? ".", parsedArgs['animated-only']);
  }
  return true;
}
