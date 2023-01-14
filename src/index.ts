import { actionFactories } from './actions';

function usage() {
  console.log(`
usage: pad-visual-media update <out directory> [--new-only] [--for-tsubaki]
       pad-visual-media extract <bin file> <output directory> [--animated-only] [--new-only] [--for-tsubaki]
       pad-visual-media render <skeleton JSON> <output directory> [--single] [--new-only] [--for-tsubaki]
       pad-visual-media server
`.trim());
  return false;
}

async function main(args: string[]) {
  const actionFactory = actionFactories[args[0]];
  if (!actionFactory) {
    return usage();
  } else {
    return await (await actionFactory())(args.slice(1));
  }
}

main(process.argv.slice(2)).then((ok) => process.exitCode = ok ? 0 : 1).catch((err) => {
  console.error('\nunexpected error: ', err);
  process.exit(1);
});
