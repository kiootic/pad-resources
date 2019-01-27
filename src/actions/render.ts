import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import gl from 'gl';
import minimist from 'minimist';
import { BBIN } from '../models/bbin';
import { TEX } from '../models/tex';
import { AnimatedRenderer } from '../renderer/animated';
import { Renderer } from '../renderer/renderer';
import { SimpleRenderer } from '../renderer/simple';
import { join } from 'path';

function usage() {
  // tslint:disable-next-line:max-line-length
  console.log('usage: pad-resources render --bin <bin file> --out <out file> [--time <time>] [--video] [--nobg]');
}

interface Args {
  bin: any;
  out: any;
  time?: number;
  video?: boolean;
  nobg?: boolean;
}

export async function main(args: string[]) {
  const parsedArgs = minimist(args) as any as Args;
  if (
    typeof parsedArgs.bin !== 'string' ||
    typeof parsedArgs.out !== 'string'
  ) {
    usage();
    return false;
  }

  const time = typeof parsedArgs.time === 'number' ? parsedArgs.time : 0;
  const video = !!parsedArgs.video;
  const nobg = !!parsedArgs.nobg;

  const buf = readFileSync(parsedArgs.bin);
  let renderer: Renderer;
  const context = gl(Renderer.ImageSize, Renderer.ImageSize, {
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  if (TEX.match(buf)) {
    renderer = new SimpleRenderer(context, buf);
  } else if (BBIN.match(buf)) {
    renderer = new AnimatedRenderer(context, buf);
  } else {
    console.error('unsupported format');
    return false;
  }

  renderer.background = !nobg;

  let outBuf: Buffer;
  if (video) {
    const lastFrame = Math.ceil(renderer.timeLength / (1 / 30));
    const ffmpegArgs = readFileSync(join(__dirname, 'ffmpeg.txt'))
      .toString()
      .split(/ |\n/g)
      .filter((arg) => arg.length > 0)
      .map((arg) => arg.replace('%TIME', renderer.timeLength.toFixed(3)));
    const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'inherit'] });

    const buffers: Buffer[] = [];
    ffmpeg.stdout.on('data', (data) => {
      buffers.push(data as Buffer);
    });

    const renderProcess = new Promise((resolve) => {
      let i = 0;
      const renderFrame = async () => {
        const frameTime = Math.min(i / 30, renderer.timeLength);
        await renderer.draw(frameTime);
        const frame = await renderer.finalize('png-fast');
        i++;
        ffmpeg.stdin.write(frame, async () => {
          if (i < lastFrame) {
            await renderFrame();
          } else {
            ffmpeg.stdin.end();
            ffmpeg.once('close', () => resolve());
          }
        });
      };
      renderFrame();
    });

    await renderProcess;
    outBuf = Buffer.concat(buffers);
  } else {
    await renderer.draw(time);
    outBuf = await renderer.finalize();
  }

  writeFileSync(parsedArgs.out, outBuf);
  return true;
}
