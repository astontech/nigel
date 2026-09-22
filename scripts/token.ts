// Issue a bearer token for an engineer (or a manager): npm run token -- --name "Jane Doe" [--manager]
// Prints the token once. Store nothing else; only its hash is kept.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { createHash, randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const name = args[args.indexOf("--name") + 1];
const role = args.includes("--manager") ? "manager" : "engineer";
if (!name || args.indexOf("--name") < 0) { console.error('usage: npm run token -- --name "Full Name" [--manager]'); process.exit(2); }

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-2" }));
const TABLE = process.env.TABLE ?? "interview-rehearsal";
const engineerId = randomBytes(6).toString("hex");
const token = randomBytes(32).toString("base64url");
const createdAt = new Date().toISOString();

await ddb.send(new PutCommand({ TableName: TABLE, Item: { pk: `ENGINEER#${engineerId}`, sk: "META", gsi: "ENGINEER", engineerId, name, role, createdAt } }));
await ddb.send(new PutCommand({ TableName: TABLE, Item: { pk: `TOKEN#${createHash("sha256").update(token).digest("hex")}`, sk: "META", engineerId, createdAt } }));
console.log(`${role} ${name} (${engineerId})\ntoken: ${token}\n\nGive them: interview-shell config → INTERVIEW_TOKEN=${token}`);
