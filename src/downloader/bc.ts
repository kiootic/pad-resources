import Axios from 'axios';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { padStart } from 'lodash';
import { join } from 'path';
import { ExtlistEntry } from '../models/extlist';

function extractETag(etag: string) {
  return /^(?:W\/)?"([^"]+)"$/.exec(etag)![1];
}

export async function downloadBc(
  bcPath: string, cachePath: string, extlist: string, entry: ExtlistEntry,
): Promise<void> {
  const filename = `${entry.isCards ? 'cards' : 'mons'}_${padStart(entry.id.toString(), 3, '0')}.bc`;

  const respHead = await Axios.head(filename, { baseURL: extlist });
  let etag = extractETag(respHead.headers.etag);

  let data: Buffer;
  if (existsSync(join(cachePath, etag))) {
    data = await readFileSync(join(cachePath, etag));
  } else {
    const resp = await Axios.get(filename, {
      baseURL: extlist,
      responseType: 'arraybuffer',
    });
    etag = extractETag(resp.headers.etag);
    data = resp.data;
    await writeFileSync(join(cachePath, etag), data);
  }

  await writeFileSync(join(bcPath, filename), data);
}
