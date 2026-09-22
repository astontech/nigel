import * as cdk from "aws-cdk-lib";
import { InterviewRehearsalStack } from "../lib/stack.js";

const app = new cdk.App();
new InterviewRehearsalStack(app, "InterviewRehearsal", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-2" },
  description: "Interview rehearsal: artifact store, evaluator, readiness dashboard",
});
