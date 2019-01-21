import { main as extract } from './extract';
import { main as inspect } from './inspect';
import { main as play } from './play';
import { main as render } from './render';
import { main as update } from './update';

type Action = (args: string[]) => Promise<boolean>;

export const actions: Record<string, Action> = {
  update,
  extract,
  inspect,
  render,
  play,
};
