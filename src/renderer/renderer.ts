import { mat4 } from 'gl-matrix';
import { join } from 'path';
import Sharp from 'sharp';
import { GLContext } from './gl-context';

const BackgroundImagePath = join(__dirname, 'card-bg.png');
let BackgroundImage: Buffer | undefined;
function loadBackgroundImage(): Promise<Buffer> {
  return Sharp(BackgroundImagePath).raw().toBuffer();
}

export abstract class Renderer {
  public static readonly ImageSize = 640;

  protected readonly context: GLContext;

  constructor() {
    this.context = new GLContext(Renderer.ImageSize, Renderer.ImageSize);
  }

  public async drawBackground() {
    if (!BackgroundImage) {
      BackgroundImage = await loadBackgroundImage();
    }

    const tex = await this.context.loadTex(512, 512, BackgroundImage);
    this.context.drawTex(
      tex,
      GLContext.makeQuad(
        0, 0,
        Renderer.ImageSize, Renderer.ImageSize,
      ),
      GLContext.makeQuad(0, 0, 1, 1),
    );
  }

  public finalize() {
    return this.context.finalize();
  }

  public async draw(time: number): Promise<void> {
    await this.drawBackground();

    mat4.translate(this.context.transform, this.context.transform, [
      Math.floor(Renderer.ImageSize / 2), Math.floor(Renderer.ImageSize * 2 / 3), 0,
    ]);
    await this.doDraw(time);
  }
  protected abstract doDraw(time: number): Promise<void>;
}
