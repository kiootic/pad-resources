import { main as update } from './update';

type Action = (args: string[]) => Promise<boolean>;

export const actions: Record<string, Action> = {
  update,
};
