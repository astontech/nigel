// Real clients for the operator scripts: the aston-dev table and bucket, like token.ts.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { execFileSync } from "node:child_process";
import type { Stores } from "./engineer-data.js";

const REGION = "us-east-2";

const stackOutput = (key: string): string =>
  execFileSync("aws", ["cloudformation", "describe-stacks", "--stack-name", "InterviewRehearsal", "--region", REGION,
    "--query", `Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue`, "--output", "text"], { encoding: "utf8" }).trim();

export const connect = (): Stores => ({
  ddb: DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION })),
  s3: new S3Client({ region: REGION }),
  table: process.env.TABLE ?? "interview-rehearsal",
  bucket: process.env.BUCKET ?? stackOutput("BucketName"),
});
