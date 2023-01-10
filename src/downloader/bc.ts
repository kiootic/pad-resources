import Axios from 'axios';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { padStart } from 'lodash';
import { join } from 'path';
import { BC } from '../models/bc';
import { ExtlistEntry } from '../models/extlist';
import { TEX } from '../models/tex';

export async function downloadBc(
  bcPath: string, binPath: string,
  extlist: string, entry: ExtlistEntry, redownload: boolean
): Promise<boolean> {
  const key = `${entry.isCards ? 'cards' : 'mons'}_${padStart(entry.id.toString(), 4, '0')}`;

  if (!redownload && existsSync(join(binPath, `${key}.bin`))) {return false;}

  let data: Buffer;
  if (redownload || !existsSync(join(binPath, `${key}.bc`))) {
    data = (await Axios.get(`${entry.isCards ? 'cards' : 'mons'}_${padStart(entry.id.toString(), 3, '0')}.bc`, {
      baseURL: extlist,
      responseType: 'arraybuffer',
    })).data;
    await writeFileSync(join(bcPath, `${key}.bc`), data);
  } else {
    data = await readFileSync(join(bcPath, `${key}.bc`));
  }

  const bc = BC.load(data);
  let binData = bc.data;
  if (TEX.match(binData)) {
    // upgrade TEX1 to TEX2 for simpler rendering
    const tex = TEX.load(binData);
    if (!tex.info) {
      tex.info = {
        cardWidth: entry.width,
        cardHeight: entry.height,
        numFrames: entry.numFrames,
        frameRate: entry.frameRate,
      };
    }
    binData = TEX.save(tex);
  }

  await writeFileSync(join(binPath, `${key}.bin`), binData);

  return true;
}
