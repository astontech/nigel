// Revoke an engineer's access: npm run revoke -- --engineer "Jane Doe"   (name or id)
// Deletes the TOKEN# row(s) only. The engineer, sessions, and stored files stay.
import { flagValue, resolveEngineer, revokeTokens, UsageError } from "./engineer-data.js";
import { connect } from "./stores.js";

const nameOrId = flagValue(process.argv.slice(2), "--engineer");
if (!nameOrId) { console.error('usage: npm run revoke -- --engineer "Full Name or id"'); process.exit(2); }

try {
  const stores = connect();
  const engineer = await resolveEngineer(stores, nameOrId);
  const count = await revokeTokens(stores, engineer);
  console.log(`revoked ${count} token(s) for ${engineer.name} (${engineer.engineerId})`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(error instanceof UsageError ? 2 : 1);
}
