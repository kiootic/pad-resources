import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import minimist from 'minimist';
import { tmpdir } from 'os';
import { join } from 'path';
import { sync as rimraf } from 'rimraf';
import { BBIN } from '../models/bbin';
import { Extlist } from '../models/extlist';
import { TEX } from '../models/tex';
import { AnimatedRenderer } from '../renderer/animated';
import { Renderer } from '../renderer/renderer';
import { SimpleRenderer } from '../renderer/simple';

function usage() {
  console.log('usage: pad-resources render --extlist <extlist bin> --id <id> --bin <bin file> --out <out file>');
}

interface Args {
  extlist: any;
  id: any;
  bin: any;
  out: any;
  time?: number;
  video?: boolean;
}

export async function main(args: string[]) {
  const parsedArgs = minimist(args) as any as Args;
  if (
    typeof parsedArgs.extlist !== 'string' ||
    typeof parsedArgs.id !== 'number' ||
    typeof parsedArgs.bin !== 'string' ||
    typeof parsedArgs.out !== 'string'
  ) {
    usage();
    return false;
  }

  let time = typeof parsedArgs.time === 'number' ? parsedArgs.time : 0;
  const video = !!parsedArgs.video;

  const extlist = Extlist.load(readFileSync(parsedArgs.extlist));
  const entry = extlist.entries.find((e) => !e.isCards && e.id === Number(parsedArgs.id));
  if (!entry) {
    console.error('entry not found');
    return false;
  }

  const buf = readFileSync(parsedArgs.bin);
  let renderer: Renderer;
  if (TEX.match(buf)) {
    renderer = new SimpleRenderer(entry, buf);
  } else if (BBIN.match(buf)) {
    renderer = new AnimatedRenderer(buf);
  } else {
    console.error('unsupported format');
    return false;
  }

  let outBuf: Buffer;
  if (video) {
    const animationLength = renderer.timeLength;
    const framesDir = mkdtempSync(join(tmpdir(), 'pad-'));
    let i;
    for (i = 0, time = 0; time < animationLength; time += (1 / 30), i++) {
      console.log(`${Math.round(time * 100) / 100}/${Math.round(animationLength * 100) / 100}`);
      await renderer.draw(time);
      const frame = await renderer.finalize();
      writeFileSync(join(framesDir, `${i}.png`), frame);
    }
    outBuf = spawnSync('ffmpeg', [
      '-framerate', '30',
      '-i', join(framesDir, '%d.png'),
      '-c:v', 'libvpx-vp9',
      '-lossless', '1',
      '-f', 'webm',
      '-',
    ], { encoding: 'buffer', stdio: ['inherit', 'pipe', 'inherit'] }).stdout;
    rimraf(framesDir);
  } else {
    await renderer.draw(time);
    outBuf = await renderer.finalize();
  }

  writeFileSync(parsedArgs.out, outBuf);
  return true;
}
