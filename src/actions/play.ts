import { readFileSync } from 'fs';
import { mat4 } from 'gl-matrix';
import minimist from 'minimist';
import { emitKeypressEvents, Key } from 'readline';
import gl from 'wpe-webgl';
import { BBIN } from '../models/bbin';
import { Extlist } from '../models/extlist';
import { TEX } from '../models/tex';
import { AnimatedRenderer } from '../renderer/animated';
import { Renderer } from '../renderer/renderer';
import { SimpleRenderer } from '../renderer/simple';

function usage() {
  console.log('usage: pad-resources play --extlist <extlist bin> --id <id> --bin <bin file>');
}

interface Args {
  extlist: any;
  id: any;
  bin: any;
  out: any;
}

export async function main(args: string[]) {
  const parsedArgs = minimist(args) as any as Args;
  if (
    typeof parsedArgs.extlist !== 'string' ||
    typeof parsedArgs.id !== 'number' ||
    typeof parsedArgs.bin !== 'string'
  ) {
    usage();
    return false;
  }

  const extlist = Extlist.load(readFileSync(parsedArgs.extlist));
  const entry = extlist.entries.find((e) => !e.isCards && e.id === Number(parsedArgs.id));
  if (!entry) {
    console.error('entry not found');
    return false;
  }

  const buf = readFileSync(parsedArgs.bin);
  let renderer: Renderer;
  const context = gl.init({ width: Renderer.ImageSize, height: Renderer.ImageSize });
  if (TEX.match(buf)) {
    renderer = new SimpleRenderer(context, entry, buf);
  } else if (BBIN.match(buf)) {
    renderer = new AnimatedRenderer(context, buf);
  } else {
    console.error('unsupported format');
    return false;
  }

  mat4.scale(renderer.context.projection, renderer.context.projection, [1, -1, 1]);
  mat4.translate(renderer.context.projection, renderer.context.projection, [0, -Renderer.ImageSize, 0]);

  function now() {
    const [seconds, nanoseconds] = process.hrtime();
    return seconds + nanoseconds * 1e-9;
  }

  let begin = now();
  let time = begin;
  let paused = false;

  async function render() {
    if (!paused) {
      time = (now() - begin) % renderer.timeLength;
    }
    process.stdout.write(`\r${time.toFixed(3)}/${renderer.timeLength.toFixed(3)}`);
    await renderer.draw(time);
    gl.nextFrame(true);
    setTimeout(render, 10);
  }
  render();

  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode!(true);
  process.stdin.on('keypress', (_, key: Key) => {
    if (key.sequence === '\u0003') {
      process.exit();
    } else if (key.name === 'space') {
      paused = !paused;
      if (!paused) {
        begin = now() - time;
      }
    } else if (key.name === 'left') {
      time = (time - 1 / 30 + renderer.timeLength) % renderer.timeLength;
    } else if (key.name === 'right') {
      time = (time + 1 / 30 + renderer.timeLength) % renderer.timeLength;
    } else if (key.name === 'b') {
      renderer.background = !renderer.background;
    }
  });

  return true;
}
