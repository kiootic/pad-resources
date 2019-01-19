import { readFileSync, writeFileSync } from 'fs';
import { BBIN } from '../models/bbin';
import { TEX } from '../models/tex';
import { Renderer } from '../renderer/renderer';

export async function main(args: string[]) {
  if (args.length !== 2) {
    console.log('usage: pad-resources render <bin file> <out file>');
    return false;
  }

  const buf = readFileSync(args[0]);
  const renderer = new Renderer();
  if (TEX.match(buf)) {
    await renderer.drawBackground();
  } else if (BBIN.match(buf)) {
    await renderer.drawBackground();
  } else {
    console.error('unsupported format');
    return false;
  }

  const image = await renderer.finalize();
  writeFileSync(args[1], image);
  return true;
}
