
import { chunk } from 'lodash';
import { downloadBaseJson } from '../downloader/base';
import { downloadBc } from '../downloader/bc';
import { downloadExtlist } from '../downloader/extlist';
import { Extlist } from '../models/extlist';
import minimist from "minimist";
const cliProgress = require('cli-progress');

async function update(outDir: string, newOnly: boolean, useProgressBar: boolean) {
  const baseJson = await downloadBaseJson();
  const extlist = Extlist.load(await downloadExtlist(baseJson.extlist));

  let pbar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

  const downloadFns = extlist.entries.map((entry) => async () => { 
    let isNew = await downloadBc(outDir, baseJson.extlist, entry, newOnly);
    if (useProgressBar) {pbar.increment();}
    return isNew;
  });

  if (useProgressBar) {pbar.start(downloadFns.length, 0);}
  for (const tasks of chunk(downloadFns, 50)) {
    // TODO: Make this a queue
    await Promise.all(tasks.map((task) => task()));
  }
  if (useProgressBar) {pbar.stop();}

  console.log('Up to date.');
}

export async function main(args: string[]) {
  const parsedArgs = minimist(args, {
    boolean: ['new-only', 'for-tsubaki', 'help'],
  });

  if (parsedArgs._ .length !== 1 || parsedArgs.help) {
    console.log("usage: pad-visual-media update <out directory> [--new-only] [--for-tsubaki]");
    return parsedArgs.help;
  }
  
  await update(parsedArgs._[0], !parsedArgs['new-only'], !parsedArgs['for-tsubaki']);

  return true;
}
