
import { RegionID } from '../config';
import { downloadBaseJson } from '../downloader/base';
import { downloadExtlist } from '../downloader/extlist';
import { mkdir } from '../utils';

export async function main(args: string[]) {
  console.log(`region: ${RegionID}`);
  const outPath = mkdir('data', RegionID);

  const baseJson = await downloadBaseJson(outPath);
  await downloadExtlist(outPath, baseJson.extlist);

  return true;
}
