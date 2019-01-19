import { readFileSync } from 'fs';
import gl from 'gl';
import { mat4 } from 'gl-matrix';
import { join } from 'path';
import Sharp from 'sharp';

const BackgroundImagePath = join(__dirname, 'card-bg.png');
let BackgroundImage: Buffer | undefined;
function loadBackgroundImage(): Promise<Buffer> {
  return Sharp(BackgroundImagePath).raw().toBuffer();
}

export function makeQuad(x: number, y: number, width: number, height: number) {
  return new Float32Array([
    x, y,
    x, y + height,
    x + width, y,
    x + width, y,
    x, y + height,
    x + width, y + height,
  ]);
}

export class Renderer {
  public static readonly ImageWidth = 640;
  public static readonly ImageHeight = 512;
  private readonly gl: WebGLRenderingContext;
  private readonly programs = new Map<string, WebGLProgram>();
  private readonly shaders = new Map<string, WebGLShader>();

  private readonly posBuf: WebGLBuffer;
  private readonly texCoordsBuf: WebGLBuffer;

  constructor() {
    this.gl = gl(Renderer.ImageWidth, Renderer.ImageHeight, {
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });

    const posBuf = this.gl.createBuffer();
    if (!posBuf) {
      throw new Error('gl.createBuffer');
    }
    this.posBuf = posBuf;

    const texCoordsBuf = this.gl.createBuffer();
    if (!texCoordsBuf) {
      throw new Error('gl.createBuffer');
    }
    this.texCoordsBuf = texCoordsBuf;
  }

  public loadTex(width: number, height: number, pixels: Buffer): WebGLTexture {
    const tex = this.gl.createTexture();
    if (!tex) {
      throw new Error('gl.createTexture');
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D, 0, this.gl.RGBA,
      width, height, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE,
      pixels,
    );
    return tex;
  }

  public drawTex(tex: WebGLTexture, positions: Float32Array, texCoords: Float32Array) {
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);

    const program = this.loadProgram('mesh.vert', 'mesh.frag');
    this.gl.useProgram(program);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.posBuf);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);
    const posLocation = this.gl.getAttribLocation(program, 'a_position');
    this.gl.enableVertexAttribArray(posLocation);
    this.gl.vertexAttribPointer(posLocation, 2, this.gl.FLOAT, false, 0, 0);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordsBuf);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(texCoords), this.gl.STATIC_DRAW);
    const texCoordsLocation = this.gl.getAttribLocation(program, 'a_tex_coords');
    this.gl.enableVertexAttribArray(texCoordsLocation);
    this.gl.vertexAttribPointer(texCoordsLocation, 2, this.gl.FLOAT, false, 0, 0);

    const transform = mat4.ortho(mat4.create(),
      0, Renderer.ImageWidth,
      0, Renderer.ImageHeight,
      0, 1,
    );
    const transformLocation = this.gl.getUniformLocation(program, 'u_transform');
    this.gl.uniformMatrix4fv(transformLocation, false, transform);

    const textureLocation = this.gl.getUniformLocation(program, 'u_texture');
    this.gl.uniform1i(textureLocation, 0);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  public async drawBackground() {
    if (!BackgroundImage) {
      BackgroundImage = await loadBackgroundImage();
    }

    const tex = await this.loadTex(512, 512, BackgroundImage);
    this.drawTex(
      tex,
      makeQuad(0, 0, Renderer.ImageWidth, Renderer.ImageHeight),
      makeQuad(0, 0, 1, 1),
    );
  }

  public async finalize(): Promise<Buffer> {
    const pixels = new Buffer(Renderer.ImageWidth * Renderer.ImageHeight * 4);
    this.gl.readPixels(
      0, 0,
      Renderer.ImageWidth, Renderer.ImageHeight,
      this.gl.RGBA, this.gl.UNSIGNED_BYTE,
      pixels,
    );

    const img = await Sharp(pixels, {
      raw: {
        width: Renderer.ImageWidth,
        height: Renderer.ImageHeight,
        channels: 4,
      },
    }).png().toBuffer();

    this.gl.getExtension('STACKGL_destroy_context').destroy();
    return img;
  }

  private loadShader(fileName: string) {
    if (this.shaders.get(fileName)) {
      return this.shaders.get(fileName)!;
    }

    const shader = this.gl.createShader(
      fileName.endsWith('.frag') ? this.gl.FRAGMENT_SHADER : this.gl.VERTEX_SHADER,
    );
    if (!shader) {
      throw new Error('gl.createShader');
    }

    this.gl.shaderSource(shader, readFileSync(join(__dirname, 'shaders', fileName)).toString());
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw new Error(this.gl.getShaderInfoLog(shader) || 'unknown error');
    }

    this.shaders.set(fileName, shader);
    return shader;
  }

  private loadProgram(...shaderFileNames: string[]) {
    const key = shaderFileNames.join(':');
    if (this.programs.get(key)) {
      return this.programs.get(key)!;
    }

    const program = this.gl.createProgram();
    if (!program) {
      throw new Error('gl.createProgram');
    }

    for (const shaderFileName of shaderFileNames) {
      this.gl.attachShader(program, this.loadShader(shaderFileName));
    }
    this.gl.linkProgram(program);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      throw new Error(this.gl.getProgramInfoLog(program) || 'unknown error');
    }

    this.programs.set(key, program);
    return program;
  }
}
