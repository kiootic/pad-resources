import { existsSync } from 'fs';
import { sync as mkdirp } from 'mkdirp';
import { join } from 'path';

export function formatJson(value: any): string {
  return JSON.stringify(value, undefined, 4);
}

export function mkdir(...parts: string[]) {
  const dir = join(...parts);
  if (!existsSync(dir))
    mkdirp(dir);
  return dir;
}

export function readASCII(buf: Buffer, offset: number) {
  let str = '';
  while (buf[offset] !== 0)
    str += String.fromCharCode(buf[offset++]);
  return str;
}
