import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export class InterviewRehearsalStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, "Table", {
      tableName: "interview-rehearsal",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });
    // Lists by item type: gsi = ENGINEER | SESSION; sk keeps the natural order.
    table.addGlobalSecondaryIndex({ indexName: "byType", partitionKey: { name: "gsi", type: dynamodb.AttributeType.STRING }, sortKey: { name: "sk", type: dynamodb.AttributeType.STRING } });

    const bucket = new s3.Bucket(this, "Artifacts", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Placeholder; the operator stores the real key with:
    //   aws secretsmanager put-secret-value --profile aston-dev --region us-east-2 \
    //     --secret-id interview-rehearsal/anthropic-api-key --secret-string 'sk-ant-...'
    const apiKey = new secrets.Secret(this, "AnthropicApiKey", {
      secretName: "interview-rehearsal/anthropic-api-key",
      description: "Anthropic API key used by the interview-rehearsal evaluator",
      secretStringValue: cdk.SecretValue.unsafePlainText("UNSET"),
    });

    const common = {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      bundling: { format: OutputFormat.ESM, target: "node22", minify: false, sourceMap: true },
      environment: {
        TABLE: table.tableName,
        BUCKET: bucket.bucketName,
        NODE_OPTIONS: "--enable-source-maps",
      },
    };

    const evaluator = new NodejsFunction(this, "Evaluator", {
      ...common,
      entry: path.join(here, "../lambda/evaluator/handler.ts"),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: { ...common.environment, API_KEY_SECRET: apiKey.secretName, MODEL: "claude-sonnet-5" },
    });
    table.grantReadWriteData(evaluator);
    bucket.grantReadWrite(evaluator);
    apiKey.grantRead(evaluator);

    const api = new NodejsFunction(this, "Api", {
      ...common,
      entry: path.join(here, "../lambda/api/handler.ts"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: { ...common.environment, EVALUATOR: evaluator.functionName },
    });
    table.grantReadWriteData(api);
    bucket.grantReadWrite(api);
    evaluator.grantInvoke(api);

    const httpApi = new apigw.HttpApi(this, "HttpApi", {
      apiName: "interview-rehearsal",
      defaultIntegration: new HttpLambdaIntegration("ApiIntegration", api),
    });

    // Hourly sweep: evaluate drill sessions left open (closed window, no /end).
    new events.Rule(this, "Sweep", {
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
      targets: [new targets.LambdaFunction(evaluator, { event: events.RuleTargetInput.fromObject({ sweep: true }) })],
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "TableName", { value: table.tableName });
    new cdk.CfnOutput(this, "BucketName", { value: bucket.bucketName });
  }
}
