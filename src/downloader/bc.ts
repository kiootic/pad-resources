import Axios from 'axios';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { padStart } from 'lodash';
import { join } from 'path';
import { BC } from '../models/bc';
import { ExtlistEntry } from '../models/extlist';
import { TEX } from '../models/tex';

function extractETag(etag: string) {
  return /^(?:W\/)?"([^"]+)"$/.exec(etag)![1];
}

export async function downloadBc(
  bcPath: string, binPath: string, cachePath: string,
  extlist: string, entry: ExtlistEntry,
): Promise<void> {
  const key = `${entry.isCards ? 'cards' : 'mons'}_${padStart(entry.id.toString(), 3, '0')}`;

  const respHead = await Axios.head(`${key}.bc`, { baseURL: extlist });
  let etag = extractETag(respHead.headers.etag);

  let data: Buffer;
  if (existsSync(join(cachePath, etag))) {
    data = await readFileSync(join(cachePath, etag));
  } else {
    const resp = await Axios.get(`${key}.bc`, {
      baseURL: extlist,
      responseType: 'arraybuffer',
    });
    etag = extractETag(resp.headers.etag);
    data = resp.data;
    await writeFileSync(join(cachePath, etag), data);
  }

  await writeFileSync(join(bcPath, `${key}.bc`), data);

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
}
