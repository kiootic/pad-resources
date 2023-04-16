// https://github.com/TsubakiBotPad/pad-visual-media/blob/8970be758c8eaf6ef1954c9fe1ee64a04b0c789f/src/downloader/extlist2.ts

import Axios from 'axios';
import { writeFileSync } from 'fs';
import { join } from 'path';

export async function downloadExtlist2(outPath: string, extlist: string): Promise<Buffer> {
  console.log(`downloading extlist2: ${extlist}`);

  const extlistData: Buffer = await Axios.get('extlist2.bin', {
    baseURL: extlist,
    responseType: 'arraybuffer',
  }).then((resp) => resp.data);
  writeFileSync(join(outPath, 'extlist2.bin'), extlistData);

  return extlistData;
}
