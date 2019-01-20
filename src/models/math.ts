export interface Vec2 {
  x: number;
  y: number;
}

export interface Transform {
  angle: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

export const Transform = {
  identity(): Transform {
    return {
      angle: 0,
      sx: 1, sy: 1,
      tx: 0, ty: 0,
    };
  },
};
