import { mat4 } from 'gl-matrix';
import { join } from 'path';
import Sharp from 'sharp';
import { GLContext } from './gl-context';

const BackgroundImagePath = join(__dirname, 'card-bg.png');
function loadBackgroundImage(): Promise<Buffer> {
  return Sharp(BackgroundImagePath).raw().toBuffer();
}

export abstract class Renderer {
  public static readonly ImageSize = 640;

  public abstract timeLength: number;

  public readonly context: GLContext;

  public background = true;

  public readonly directives = new Set<string>();

  private backgroundTexture: WebGLTexture | undefined;

  constructor(gl: WebGLRenderingContext) {
    this.context = new GLContext(gl, Renderer.ImageSize, Renderer.ImageSize);
  }

  public async drawBackground() {
    if (!this.background) {
      return;
    }

    if (!this.backgroundTexture) {
      this.backgroundTexture = await this.context.loadTex(512, 512, await loadBackgroundImage());
    }

    this.context.drawTex(
      this.backgroundTexture,
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
    this.context.reset();
    await this.drawBackground();

    mat4.translate(this.context.transform, this.context.transform, [
      Math.floor(Renderer.ImageSize / 2), Math.floor(Renderer.ImageSize * 2 / 3), 0,
    ]);
    await this.doDraw(time);
  }
  protected abstract doDraw(time: number): Promise<void>;
}
