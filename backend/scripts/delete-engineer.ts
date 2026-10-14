// Delete an engineer's data: npm run delete-engineer -- --engineer "Jane Doe"                    (prints what would go)
//                            npm run delete-engineer -- --engineer "Jane Doe" --confirm <engineerId>   (does it)
// Removes the ENGINEER# and TOKEN# rows, every SESSION# item, and every object version and delete marker under sessions/<engineerId>/.
import { deleteEngineer, describePlan, flagValue, planDeletion, resolveEngineer, UsageError } from "./engineer-data.js";
import { connect } from "./stores.js";

const args = process.argv.slice(2);
const nameOrId = flagValue(args, "--engineer");
if (!nameOrId) { console.error('usage: npm run delete-engineer -- --engineer "Full Name or id" [--confirm <engineerId>]'); process.exit(2); }

try {
  const stores = connect();
  const engineer = await resolveEngineer(stores, nameOrId);
  console.log(describePlan(await planDeletion(stores, engineer)));
  const plan = await deleteEngineer(stores, engineer, flagValue(args, "--confirm"));
  console.log(`\ndeleted. verified: nothing remains under sessions/${plan.engineer.engineerId}/`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(error instanceof UsageError ? 2 : 1);
}
