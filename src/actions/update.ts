
import { chunk } from 'lodash';
import { RegionID } from '../config';
import { downloadBaseJson } from '../downloader/base';
import { downloadBc } from '../downloader/bc';
import { downloadExtlist } from '../downloader/extlist';
import { Extlist } from '../models/extlist';
import { mkdir } from '../utils';

export async function main(args: string[]) {
  console.log(`region: ${RegionID}`);
  const outPath = mkdir('data', RegionID);

  const baseJson = await downloadBaseJson(outPath);
  const extlist = Extlist.load(await downloadExtlist(outPath, baseJson.extlist));

  const bcPath = mkdir(outPath, 'bc');
  const binPath = mkdir(outPath, 'bin');
  const cachePath = mkdir(outPath, 'cache');

  const downloadFns = extlist.entries.map((entry) => async () => {
    await downloadBc(bcPath, binPath, cachePath, baseJson.extlist, entry);
  });

  let progress = 0;
  for (const tasks of chunk(downloadFns, 50)) {
    console.log(`${progress}/${downloadFns.length}`);
    await Promise.all(tasks.map((task) => task()));
    progress += tasks.length;
  }

  console.log('up to date.');

  return true;
}
