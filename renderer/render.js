const fs = require('fs');
const path = require('path');
const minimist = require('minimist');
const webgl = require('gl');
const sharp = require('sharp');
const { spine } = require('./spine-webgl');

async function main(args) {
  const parsedArgs = minimist(args);
  if (parsedArgs._.length !== 1) {
    console.log("usage: renderer.js [skeleton JSON] [--no-bg] [--single] [--out-dir=<output directory>]");
    return false;
  }
  const dataDir = path.dirname(parsedArgs._[0]);
  const animName = path.basename(parsedArgs._[0], path.extname(parsedArgs._[0]));
  const skeletonJson = fs.readFileSync(parsedArgs._[0]).toString();
  const atlasText = fs.readFileSync(parsedArgs._[0].replace(/\.json$/, '.atlas')).toString();
  const renderBg = parsedArgs["bg"] == null ? true : !!parsedArgs["bg"];
  const renderSingle = !!parsedArgs["single"];
  const outDir = parsedArgs["out-dir"] == null ? path.resolve('.') : String(parsedArgs["out-dir"]);

  const canvas = {
    width: 640, height: 640,
    clientWidth: 640, clientHeight: 640,
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
      if (background) {
        return;
      }
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

  let background;
  if (renderBg) {
    const bgImage = sharp(path.join(__dirname, "background.png"));
    const { width, height } = await bgImage.metadata();
    const data = await bgImage.raw().toBuffer();
    background = new spine.GLTexture(gl, { width, height, data });
  }

  const skeletonData = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(skeletonJson);
  const animationStateData = new spine.AnimationStateData(skeletonData);

  const skeleton = new spine.Skeleton(skeletonData);
  const animationState = new spine.AnimationState(animationStateData);
  animationState.setAnimation(0, 'animation', true);

  const renderer = new spine.SceneRenderer(canvas, gl, false);

  renderer.camera.position.x = 0;
  renderer.camera.position.y = 640 / 6;

  async function render(outFile) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    animationState.apply(skeleton);
    skeleton.updateWorldTransform();
    renderer.begin();
    if (renderBg) {
      renderer.drawTexture(background, -320, -(640 * 1 / 3), 640, 640);
    }
    renderer.drawSkeleton(skeleton, false);
    renderer.end();

    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const img = sharp(pixels, { raw: { width: canvas.width, height: canvas.height, channels: 4 } });
    await img.png().flip().toFile(outFile);
    console.log(outFile);
  }

  if (renderSingle) {
    await render(path.join(outDir, `${animName}.png`));
  } else {
    const duration = animationState.getCurrent(0).animation.duration;
    let time = 0;
    const delta = 1 / 30;
    let i = 0;
    while (time < duration) {
      console.log(`${time.toFixed(2)}/${duration.toFixed(2)}`);
      await render(path.join(outDir, `${animName}-${i}.png`));
      time += delta;
      i++;
      animationState.update(delta);
    }
  }

  return true;
}

main(process.argv.slice(2)).then((ok) => process.exitCode = ok ? 0 : 1).catch((err) => {
  console.error('\nunexpected error: ', err);
  process.exit(1);
});
