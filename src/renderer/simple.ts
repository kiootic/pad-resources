import { TEX, TEXCardInfo, TEXEntry } from '../models/tex';
import { GLContext } from './gl-context';
import { Renderer } from './renderer';

export class SimpleRenderer extends Renderer {
  private readonly glTex: WebGLTexture;
  private readonly cardInfo: TEXCardInfo;
  private readonly texEntry: TEXEntry;

  public get timeLength(): number {
    const timePerFrame = (this.cardInfo.frameRate || 1) / 30;
    const numFrames = this.cardInfo.numFrames || 1;
    return numFrames * timePerFrame;
  }

  constructor(gl: WebGLRenderingContext, buf: Buffer) {
    super(gl);
    const tex = TEX.load(buf);
    if (!tex.info || tex.entries.length === 0)
      throw new Error('missing required data');
    this.cardInfo = tex.info;
    this.texEntry = tex.entries[0];

    const imageBuf = TEX.decodeRaw(this.texEntry);
    this.glTex = this.context.loadTex(this.texEntry.width, this.texEntry.height, imageBuf);
  }

  public async doDraw(time: number) {
    const timePerFrame = (this.cardInfo.frameRate / 30) || 1;
    const numFrames = this.cardInfo.numFrames || 1;
    const frame = Math.floor(time / timePerFrame) % numFrames;
    const width = this.cardInfo.cardWidth / this.texEntry.width;
    const height = this.cardInfo.cardHeight / this.texEntry.height;

    this.context.drawTex(
      this.glTex,
      GLContext.makeQuad(
        -this.cardInfo.cardWidth / 2, -this.cardInfo.cardHeight,
        this.cardInfo.cardWidth, this.cardInfo.cardHeight,
      ),
      GLContext.makeQuad(0, height * frame, width, height),
    );
  }
}
