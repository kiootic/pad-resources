import { actions } from './actions';

function usage() {
  console.log(`
usage: pad-resources update
       pad-resources extract <bin files>...
       pad-resources inspect <file>
`.trim());
  return false;
}

async function main(args: string[]) {
  const action = actions[args[0]];
  if (!action) {
    return usage();
  } else {
    return await action(args.slice(1));
  }
}

main(process.argv.slice(2)).then((ok) => process.exit(ok ? 0 : 1)).catch((err) => {
  console.error('\nunexpected error: ', err);
  process.exit(1);
});
