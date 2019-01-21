declare module 'wpe-webgl' {
  export interface WebGLOptions {
    width: number;
    height: number;
  }

  export function init(options: WebGLOptions): WebGLRenderingContext;
  export function nextFrame(swap: boolean): void;
}