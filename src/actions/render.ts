import { readFileSync, writeFileSync } from 'fs';
import { BBIN } from '../models/bbin';
import { Extlist } from '../models/extlist';
import { TEX } from '../models/tex';
import { AnimatedRenderer } from '../renderer/animated';
import { Renderer } from '../renderer/renderer';
import { SimpleRenderer } from '../renderer/simple';

export async function main(args: string[]) {
  if (args.length !== 4) {
    console.log('usage: pad-resources render <extlist bin> <id> <bin file> <out file>');
    return false;
  }

  const extlist = Extlist.load(readFileSync(args[0]));
  const entry = extlist.entries.find((e) => !e.isCards && e.id === Number(args[1]));
  if (!entry) {
    console.error('entry not found');
    return false;
  }

  const buf = readFileSync(args[2]);
  let renderer: Renderer;
  if (TEX.match(buf)) {
    renderer = new SimpleRenderer(entry, buf);
    await renderer.draw(0.8);
  } else if (BBIN.match(buf)) {
    renderer = new AnimatedRenderer(buf);
    await renderer.draw(0);
  } else {
    console.error('unsupported format');
    return false;
  }

  const image = await renderer.finalize();
  writeFileSync(args[3], image);
  return true;
}
