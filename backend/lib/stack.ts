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
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
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

    // The Aston seat's long-lived Claude Code token (`claude setup-token`). Placeholder until stored:
    //   aws secretsmanager put-secret-value --profile aston-dev --region us-east-2 \
    //     --secret-id interview-rehearsal/claude-token --secret-string '<token>'
    const claudeToken = new secrets.Secret(this, "ClaudeToken", {
      secretName: "interview-rehearsal/claude-token",
      description: "Long-lived Claude Code token for the DORIS evaluator (an Aston seat, via `claude setup-token`)",
      secretStringValue: cdk.SecretValue.unsafePlainText("UNSET"),
    });

    // --- DORIS evaluator: a Fargate task that runs headless Claude Code. Public subnets only, no NAT (free). ---
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2, natGateways: 0,
      subnetConfiguration: [{ name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 }],
    });
    const cluster = new ecs.Cluster(this, "Cluster", { vpc, clusterName: "interview-rehearsal" });
    const taskSg = new ec2.SecurityGroup(this, "EvaluatorSg", { vpc, allowAllOutbound: true, description: "DORIS evaluator task (egress only)" });

    const task = new ecs.FargateTaskDefinition(this, "EvaluatorTask", {
      cpu: 512, memoryLimitMiB: 1024,
      runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.ARM64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX },
    });
    task.addContainer("evaluator", {
      image: ecs.ContainerImage.fromAsset(here + "/..", { file: "evaluator/Dockerfile", platform: cdk.aws_ecr_assets.Platform.LINUX_ARM64, exclude: ["node_modules", "cdk.out", ".git"] }),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "doris", logRetention: logs.RetentionDays.ONE_MONTH }),
      environment: { TABLE: table.tableName, BUCKET: bucket.bucketName, TOKEN_SECRET: claudeToken.secretName, MODEL: "sonnet" },
    });
    table.grantReadWriteData(task.taskRole);
    bucket.grantReadWrite(task.taskRole);
    claudeToken.grantRead(task.taskRole);

    // Hourly sweep: ends idle sessions (closed windows) and grades everything ended but ungraded.
    new events.Rule(this, "Sweep", {
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
      targets: [new targets.EcsTask({
        cluster, taskDefinition: task, launchType: ecs.LaunchType.FARGATE, assignPublicIp: true,
        subnetSelection: { subnetType: ec2.SubnetType.PUBLIC }, securityGroups: [taskSg],
        containerOverrides: [{ containerName: "evaluator", environment: [{ name: "SWEEP", value: "1" }] }],
      })],
    });

    // --- API ---
    const api = new NodejsFunction(this, "Api", {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      bundling: { format: OutputFormat.ESM, target: "node22", minify: false, sourceMap: true },
      entry: path.join(here, "../lambda/api/handler.ts"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        TABLE: table.tableName, BUCKET: bucket.bucketName, NODE_OPTIONS: "--enable-source-maps",
        CLUSTER: cluster.clusterArn, TASK_DEF: task.taskDefinitionArn,
        SUBNETS: vpc.publicSubnets.map(s => s.subnetId).join(","), SECURITY_GROUP: taskSg.securityGroupId,
      },
    });
    table.grantReadWriteData(api);
    bucket.grantReadWrite(api);
    api.addToRolePolicy(new iam.PolicyStatement({ actions: ["ecs:RunTask"], resources: [task.taskDefinitionArn], conditions: { ArnEquals: { "ecs:cluster": cluster.clusterArn } } }));
    api.addToRolePolicy(new iam.PolicyStatement({ actions: ["iam:PassRole"], resources: [task.taskRole.roleArn, task.executionRole!.roleArn] }));

    const httpApi = new apigw.HttpApi(this, "HttpApi", {
      apiName: "interview-rehearsal",
      defaultIntegration: new HttpLambdaIntegration("ApiIntegration", api),
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "TableName", { value: table.tableName });
    new cdk.CfnOutput(this, "BucketName", { value: bucket.bucketName });
    new cdk.CfnOutput(this, "ClusterName", { value: cluster.clusterName });
    new cdk.CfnOutput(this, "EvaluatorTaskDefinition", { value: task.taskDefinitionArn });
  }
}
