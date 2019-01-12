import Axios from 'axios';
import { writeFileSync } from 'fs';
import { join } from 'path';

export async function downloadExtlist(outPath: string, extlist: string): Promise<Buffer> {
  console.log(`downloading extlist: ${extlist}`);

  const extlistData: Buffer = await Axios.get('extlist.bin', {
    baseURL: extlist,
    responseType: 'arraybuffer',
  }).then((resp) => resp.data);
  writeFileSync(join(outPath, 'extlist.bin'), extlistData);

  return extlistData;
}
