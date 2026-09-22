/** Compat entry: `retention:simulate` → dry-run counts with opaque IDs only. */
import { main } from './retention-execute.js';

export {
  executeRetention,
  main,
  simulateRetention,
} from './retention-execute.js';

const executedAsCli = process.argv[1]?.includes('retention-simulate') === true;

if (executedAsCli) {
  main([...process.argv.slice(2), '--compat-simulate']).catch(
    (error: unknown) => {
      console.error('Retention simulation failed');
      if (error instanceof Error) {
        console.error(error.message);
      }
      process.exitCode = 1;
    },
  );
}
