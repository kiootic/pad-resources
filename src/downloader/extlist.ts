import Axios from 'axios';

export async function downloadExtlist(extlist: string): Promise<Buffer> {
  console.log(`downloading extlist: ${extlist}`);

  const extlistData: Buffer = await Axios.get('extlist.bin', {
    baseURL: extlist,
    responseType: 'arraybuffer',
  }).then((resp) => resp.data);

  return extlistData;
}
