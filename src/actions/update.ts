
import { RegionID } from '../config';
import { downloadBaseJson } from '../downloader/base';
import { mkdir } from '../utils';

export async function main(args: string[]) {
  console.log(`region: ${RegionID}`);
  const outPath = mkdir('data', RegionID);

  await downloadBaseJson(outPath);
  return true;
}
