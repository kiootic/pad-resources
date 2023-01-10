import { actionFactories } from './actions';

function usage() {
  console.log(`
usage: pad-resources update
       pad-resources extract --out <out dir> <bin files>...
       pad-resources render --bin <bin file> --out <out dir> [--single]
       pad-resources server
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
