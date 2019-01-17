import { main as extract } from './extract';
import { main as inspect } from './inspect';
import { main as update } from './update';

type Action = (args: string[]) => Promise<boolean>;

export const actions: Record<string, Action> = {
  update,
  extract,
  inspect,
};
