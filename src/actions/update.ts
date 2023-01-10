
import { chunk } from 'lodash';
import { RegionID } from '../config';
import { downloadBaseJson } from '../downloader/base';
import { downloadBc } from '../downloader/bc';
import { downloadExtlist } from '../downloader/extlist';
import { Extlist } from '../models/extlist';
import { mkdir } from '../utils';
import minimist from "minimist";

async function update(redownload: boolean) {
  console.log(`region: ${RegionID}`);
  const outPath = mkdir('data', RegionID);

  const baseJson = await downloadBaseJson(outPath);
  const extlist = Extlist.load(await downloadExtlist(outPath, baseJson.extlist));

  const bcPath = mkdir(outPath, 'bc');
  const binPath = mkdir(outPath, 'bin');

  const downloadFns = extlist.entries.map((entry) => async () =>
    await downloadBc(bcPath, binPath, baseJson.extlist, entry, redownload)
  );

  let progress = 0;
  for (const tasks of chunk(downloadFns, 50)) {
    if ((await Promise.all(tasks.map((task) => task()))).some((x) => x)) {
      console.log(`${progress}/${downloadFns.length}`);
    }
    progress += tasks.length;
  }

  console.log('Up to date.');
}

export async function main(args: string[]) {
  const parsedArgs = minimist(args, {
    boolean: ['redownload', 'help'],
  });

  if (parsedArgs._ .length !== 0 || parsedArgs.help) {
    console.log(
      "usage: pad-resources update [--redownload]"
    );
    return parsedArgs.help;
  }
  
  await update(parsedArgs.redownload);

  return true;
}
