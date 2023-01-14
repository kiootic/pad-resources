const fs = require('fs');
const path = require('path');
const minimist = require('minimist');
const webgl = require('gl');
const sharp = require('sharp');
import { padStart } from 'lodash';
import { glob } from "glob";
const { spine } = require('../spine-webgl');

import { spawnSync, spawn } from 'child_process';
const cliProgress = require('cli-progress');

async function render(jsonPath: string, outDir: string, renderSingle: boolean, forTsubaki: boolean) {
  const dataDir = path.dirname(jsonPath);
  const skeletonJson = fs.readFileSync(jsonPath).toString();
  const atlasText = fs.readFileSync(jsonPath.replace(/\.json$/, '.atlas')).toString();
  const FRAME_RATE = 30;

  const canvas = {
    width: 640, height: 388,
    clientWidth: 640, clientHeight: 388,
  };
  const gl = webgl(canvas.width, canvas.height);
  if (!gl) {
    throw new Error("cannot create GL context");
  }
  gl.canvas = canvas;

  global.WebGLRenderingContext = gl.constructor;
  spine.PolygonBatcher = class extends spine.PolygonBatcher {
    begin(shader: any) {
      console.log('shader');
      console.log(typeof shader);
      super.begin(shader);
      this.__setAdditive();
    }
    setBlendMode(srcBlend: any, dstBlend: any) {
      super.setBlendMode(srcBlend, dstBlend);
      this.__setAdditive();
    }
    __setAdditive() {
      if (!this.shader.context.gl.getUniformLocation(this.shader.program, "u_additive")) {
        return;
      }
      const isAdditive = this.dstBlend === gl.ONE;
      this.shader.setUniformi("u_additive", isAdditive ? 1 : 0);
      if (isAdditive) {
        gl.blendFunc(gl.ONE, gl.ONE);
      }
    }
  };
  spine.Shader.newColoredTextured = (context: any) => {
    const vs = `
        attribute vec4 ${spine.Shader.POSITION};
        attribute vec4 ${spine.Shader.COLOR};
        attribute vec2 ${spine.Shader.TEXCOORDS};
        uniform mat4 ${spine.Shader.MVP_MATRIX};
        varying vec4 v_color;
        varying vec2 v_texCoords;
        void main () {
          v_color = ${spine.Shader.COLOR};
          v_texCoords = ${spine.Shader.TEXCOORDS};
          gl_Position = ${spine.Shader.MVP_MATRIX} * ${spine.Shader.POSITION};
        }
    `;

    const fs = `
      precision mediump float;
      varying vec4 v_color;
      varying vec2 v_texCoords;
      uniform sampler2D u_texture;
      uniform bool u_additive;

      void main () {
        vec4 tex = v_color * texture2D(u_texture, v_texCoords);
        if (u_additive) {
           tex.rgb *= tex.a;
           float m = max(max(tex.r, tex.g), tex.b);
           tex.a = m;
        }
        gl_FragColor = tex;
      }
    `;

    return new spine.Shader(context, vs, fs);
  };

  const atlas = new spine.TextureAtlas(atlasText);
  const images = new Map();
  for (const page of atlas.pages) {
    const image = sharp(path.join(dataDir, page.name));
    const { width, height } = await image.metadata();
    const data = await image.raw().toBuffer();
    images.set(page.name, { width, height, data });
  }
  atlas.setTextures({
    get: (name: any) => new spine.GLTexture(gl, images.get(name))
  });

  const skeletonData = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(skeletonJson);
  const animationStateData = new spine.AnimationStateData(skeletonData);

  const skeleton = new spine.Skeleton(skeletonData);
  const animationState = new spine.AnimationState(animationStateData);
  animationState.setAnimation(0, 'animation' in JSON.parse(skeletonJson).animations ? 'animation' : 'animation_01', true);

  const renderer = new spine.SceneRenderer(canvas, gl, false);

  renderer.camera.position.x = 0;
  renderer.camera.position.y = 150;

  function renderImg(outFile: string | undefined) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    animationState.apply(skeleton);
    skeleton.updateWorldTransform();
    renderer.begin();
    renderer.drawSkeleton(skeleton, false);
    renderer.end();

    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const img = sharp(pixels, { raw: { width: canvas.width, height: canvas.height, channels: 4 } });
    if (outFile !== undefined) {
      return img.png().flip().toFile(outFile);
    } else {
      return img.flip().toBuffer();
    }
  }


  let animName = path.basename(jsonPath, path.extname(jsonPath));
  if (forTsubaki) {
    animName = padStart(animName.split('_')[1].toString(), 5, '0');
  }

  if (renderSingle) {
    await renderImg(path.join(outDir, `${animName}.png`));
  } else {
    const duration = animationState.getCurrent(0).animation.duration;
    const padding = Math.ceil(duration * FRAME_RATE).toString().length;
    let time = 0;
    let pbar;
    const delta = 1 / FRAME_RATE;
    let i = 0;
    let files = [];
    let promises = [];

    const cacheDir = path.join(outDir, 'cache');
    try {fs.mkdirSync(cacheDir);} catch (e) {}
    
    console.log(`Generating frames for ${animName} (${duration.toFixed(2)}s at ${FRAME_RATE} FPS).`);
    if (!forTsubaki) {
      pbar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
      pbar.start(Number(duration.toFixed(2)), 0);
    }
    while (time < duration) {
      if (!forTsubaki) {pbar.update(Number(time.toFixed(2)))};
      let fp = path.join(cacheDir, `${animName}-${padStart(i.toString(), padding, '0')}.png`);
      files.push(fp);
      promises.push(renderImg(fp));
      time += delta;
      i++;
      animationState.update(delta);
    }
    await Promise.all(promises);
    if (!forTsubaki) {pbar.update(Number(duration.toFixed(2))); pbar.stop();}
    
    console.log("Generating Files...");
    let mp4FFmpegArgs = ['-r', `${FRAME_RATE}`, 
                        '-i', path.join(cacheDir, `${animName}-%0${padding}d.png`), 
                        '-c:v', 'libx264', '-r', `${FRAME_RATE}`, '-pix_fmt', 'yuv420p',
                        '-loglevel', 'error', '-hide_banner', '-y',
                        path.join(outDir, `${animName}.mp4`)];
    spawnSync('ffmpeg', mp4FFmpegArgs)
    console.log(`${animName}.mp4`);
    let hqGifFFmpegArgs = ['-i', `${path.join(outDir, `${animName}.mp4`)}`, '-r', '30',
                           '-loglevel', 'error', '-hide_banner', '-y',
                        path.join(outDir, `${animName}_hq.gif`)];    
    let gifFFmpegArgs = ['-i', `${path.join(outDir, `${animName}.mp4`)}`, '-r', '10', '-s', '426x258',
                        '-loglevel', 'error', '-hide_banner', '-y',
                        path.join(outDir, `${animName}.gif`)];
    
    await Promise.all([
      new Promise<void>((res, rej) => spawn('ffmpeg', hqGifFFmpegArgs).on('exit', (err) => {console.log(`${animName}_hq.gif`); res();})),
      new Promise<void>((res, rej) => spawn('ffmpeg', gifFFmpegArgs).on('exit', (err) => {console.log(`${animName}.gif`); res();})),
      new Promise<void>((res, rej) => fs.rm(cacheDir, { recursive: true, force: true }, () => res()))
    ]);    
  }
}


export async function main(args: string[]) {
  const parsedArgs = minimist(args, {
    boolean: ['single', 'help', 'for-tsubaki']
  });
  
  if (parsedArgs._.length !== 2 || parsedArgs.help) {
    console.log("usage: pad-visual-media render <skeleton JSON> <output directory> [--single] [--new-only] [--for-tsubaki]");
    return parsedArgs.help;
  }

  const files = [];
  if (fs.existsSync(parsedArgs._[0]) && fs.lstatSync(parsedArgs._[0]).isDirectory()) {
    for (const file of fs.readdirSync(parsedArgs._[0])) {
      if (file.endsWith('.json')) {
        files.push(path.join(parsedArgs._[0], file));
      }
    }
  } else {
    files.push(...glob.sync(parsedArgs._[0]));
  }

  // TODO: Add progress bar for files
  for (const file of files) {
    if (parsedArgs['new-only']) {
      let base = path.basename(file, path.extname(file));
      if (parsedArgs['for-tsubaki']
       && fs.existsSync(path.join(parsedArgs._[1], `${padStart(base.split('_')[1].toString(), 5, '0')}_hq.gif`))) {continue;}
      else if (!parsedArgs['for-tsubaki']
       && fs.existsSync(path.join(parsedArgs._[1], `${base}_hq.gif`))) {continue;}
    }
    await render(file, parsedArgs._[1], parsedArgs.single, parsedArgs['for-tsubaki'])
  }

  return true;
}