import Axios from 'axios';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { BaseJsonURL } from '../config';
import { formatJson } from '../utils';

export interface BaseJson {
  rver: string;
  extlist: string;
}

export async function downloadBaseJson(outPath: string): Promise<BaseJson> {
  console.log(`downloading root json: ${BaseJsonURL}`);

  const baseJson: BaseJson = await Axios.get(BaseJsonURL).then((resp) => resp.data);
  writeFileSync(join(outPath, 'base.json'), formatJson(baseJson));

  console.log(`version: ${baseJson.rver}`);
  return baseJson;
}
