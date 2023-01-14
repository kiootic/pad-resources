import Axios from 'axios';
import { BaseJsonURL } from '../config';

export interface BaseJson {
  rver: string;
  extlist: string;
}

export async function downloadBaseJson(): Promise<BaseJson> {
  console.log(`downloading root json: ${BaseJsonURL}`);
  const baseJson: BaseJson = await Axios.get(BaseJsonURL).then((resp) => resp.data);
  console.log(`version: ${baseJson.rver}`);
  return baseJson;
}
