import Axios from 'axios';
import { existsSync, writeFileSync } from 'fs';
import { padStart } from 'lodash';
import { join } from 'path';
import { BC } from '../models/bc';
import { ExtlistEntry } from '../models/extlist';
import { TEX } from '../models/tex';

export async function downloadBc(binPath: string, extlist: string, entry: ExtlistEntry, 
                                 newOnly: boolean): Promise<boolean> {
  const key = `${entry.isCards ? 'cards' : 'mons'}_${padStart(entry.id.toString(), 3, '0')}`;

  if (newOnly && existsSync(join(binPath, `${key}.bin`))) {return false;}

  const data = (await Axios.get(`${key}.bc`, {
    baseURL: extlist,
    responseType: 'arraybuffer',
  })).data;
  let binData = BC.load(data).data;
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
