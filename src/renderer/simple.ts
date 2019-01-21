import { ExtlistEntry } from '../models/extlist';
import { TEX, TEXEntry } from '../models/tex';
import { GLContext } from './gl-context';
import { Renderer } from './renderer';

export class SimpleRenderer extends Renderer {
  private readonly tex: WebGLTexture;
  private readonly texInfo: TEXEntry;

  public get timeLength(): number {
    const timePerFrame = (this.entry.frameRate || 1) / 30;
    const numFrames = this.entry.numFrames || 1;
    return numFrames * timePerFrame;
  }

  constructor(gl: WebGLRenderingContext, private readonly entry: ExtlistEntry, buf: Buffer) {
    super(gl);
    const texInfo = TEX.load(buf).entries[0];
    const imageBuf = TEX.decodeRaw(texInfo);
    this.tex = this.context.loadTex(texInfo.width, texInfo.height, imageBuf);
    this.texInfo = texInfo;
  }

  public async doDraw(time: number) {
    const timePerFrame = (this.entry.frameRate / 30) || 1;
    const numFrames = this.entry.numFrames || 1;
    const frame = Math.floor(time / timePerFrame) % numFrames;
    const width = this.entry.width / this.texInfo.width;
    const height = this.entry.height / this.texInfo.height;

    this.context.setBlendMode('normal');
    this.context.drawTex(
      this.tex,
      GLContext.makeQuad(
        -this.entry.width / 2, -this.entry.height,
        this.entry.width, this.entry.height,
      ),
      GLContext.makeQuad(0, height * frame, width, height),
    );
  }
}
