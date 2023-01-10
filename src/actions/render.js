const fs = require('fs');
const path = require('path');
const minimist = require('minimist');
const webgl = require('gl');
const sharp = require('sharp');
import { padStart } from 'lodash';
const { spine } = require('../spine-webgl');

function toTsubakiName(oldName) {
  const mid = oldName.split('_')[1];
  return padStart(mid.toString(), 5, '0') + '.png';
}

async function render(jsonPath, outDir, renderSingle, forTsubaki) {
  const dataDir = path.dirname(jsonPath);
  const animName = path.basename(jsonPath, path.extname(jsonPath));
  const skeletonJson = fs.readFileSync(jsonPath).toString();
  const atlasText = fs.readFileSync(jsonPath.replace(/\.json$/, '.atlas')).toString();
  const FRAME_RATE = 30;

  const canvas = {
    width: 640, height: 366,
    clientWidth: 640, clientHeight: 366,
  };
  const gl = webgl(canvas.width, canvas.height);
  if (!gl) {
    throw new Error("cannot create GL context");
  }
  gl.canvas = canvas;

  global.HTMLCanvasElement = class { };
  global.EventTarget = class { };
  global.WebGLRenderingContext = gl.constructor;
  spine.PolygonBatcher = class extends spine.PolygonBatcher {
    begin(shader) {
      super.begin(shader);
      this.__setAdditive();
    }
    setBlendMode(srcBlend, dstBlend) {
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
  spine.Shader.newColoredTextured = (context) => {
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
    get: (name) => new spine.GLTexture(gl, images.get(name))
  });

  const skeletonData = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(skeletonJson);
  const animationStateData = new spine.AnimationStateData(skeletonData);

  const skeleton = new spine.Skeleton(skeletonData);
  const animationState = new spine.AnimationState(animationStateData);
  animationState.setAnimation(0, 'animation' in JSON.parse(skeletonJson).animations ? 'animation' : 'animation_01', true);

  const renderer = new spine.SceneRenderer(canvas, gl, false);

  renderer.camera.position.x = 0;
  renderer.camera.position.y = 150;

  async function renderImg(outFile) {
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
    await img.png().flip().toFile(outFile);
    console.log(outFile);
  }

  if (renderSingle) {
    if (forTsubaki) {
      await renderImg(path.join(outDir, toTsubakiName(animName)));
    } else {
      await renderImg(path.join(outDir, `${animName}.png`));
    }
  } else {
    const duration = animationState.getCurrent(0).animation.duration;
    let time = 0;
    const delta = 1 / FRAME_RATE;
    let i = 0;
    while (time < duration) {
      console.log(`${time.toFixed(2)}/${duration.toFixed(2)}`);
      await renderImg(path.join(outDir, `${animName}-${i}.png`));
      time += delta;
      i++;
      animationState.update(delta);
    }
  }
}


export async function main(args) {
  const parsedArgs = minimist(args, {
    boolean: ['single', 'help', 'for-tsubaki'],
    string: ['out']
  });
  if (parsedArgs._.length !== 1 || parsedArgs.help) {
    console.log("usage: renderer.js [skeleton JSON] [--single] [--for-tsubaki] [--out=<output directory>]");
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
    files.push(parsedArgs._[0]);
  }

  for (const file of files) {
    await render(file, parsedArgs.out ?? '.', parsedArgs.single, parsedArgs['for-tsubaki'])
  }

  return true;
}