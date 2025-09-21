import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export class ImageProcessorStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly s3Bucket: s3.Bucket;
  public readonly userPool: cognito.UserPool;
  public readonly ec2Instance: ec2.Instance;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Use the account's default VPC (simpler than creating a new one)
    this.vpc = ec2.Vpc.fromLookup(this, "DefaultVPC", {
      isDefault: true,
    }) as ec2.Vpc;

    // Create S3 bucket for image storage
    this.s3Bucket = this.createS3Bucket();

    // Create Cognito User Pool for authentication (disabled for now)
    // this.userPool = this.createCognitoUserPool();

    // Create Parameter Store parameters
    this.createParameterStoreParameters();

    // Create Secrets Manager secrets
    this.createSecretsManagerSecrets();

    // Create EC2 instance for the application
    this.ec2Instance = this.createEC2Instance();

    // Create Route53 hosted zone and records
    this.createRoute53Records();

    // Output important values
    this.createOutputs();
  }

  // (Removed) Custom VPC creation; rely on default VPC

  private createS3Bucket(): s3.Bucket {
    const bucket = new s3.Bucket(this, "ImageProcessorBucket", {
      bucketName: "a2-n11837845-image-processor",
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Add CORS configuration for web uploads
    bucket.addCorsRule({
      allowedMethods: [
        s3.HttpMethods.GET,
        s3.HttpMethods.PUT,
        s3.HttpMethods.POST,
      ],
      allowedOrigins: ["*"],
      allowedHeaders: ["*"],
      maxAge: 3000,
    });

    return bucket;
  }

  private createCognitoUserPool(): cognito.UserPool {
    const userPool = new cognito.UserPool(this, "ImageProcessorUserPool", {
      userPoolName: "image-processor-users",
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
        username: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: true,
        otp: true,
      },
    });

    // Create user groups
    new cognito.CfnUserPoolGroup(this, "AdminGroup", {
      userPoolId: userPool.userPoolId,
      groupName: "admin",
      description: "Administrator group with full access",
    });

    new cognito.CfnUserPoolGroup(this, "UserGroup", {
      userPoolId: userPool.userPoolId,
      groupName: "user",
      description: "Regular user group with limited access",
    });

    // Create user pool client
    const userPoolClient = new cognito.UserPoolClient(
      this,
      "ImageProcessorUserPoolClient",
      {
        userPool,
        userPoolClientName: "image-processor-client",
        generateSecret: false,
        authFlows: {
          userPassword: true,
          userSrp: true,
        },
        oAuth: {
          flows: {
            implicitCodeGrant: true,
          },
          scopes: [
            cognito.OAuthScope.EMAIL,
            cognito.OAuthScope.OPENID,
            cognito.OAuthScope.PROFILE,
          ],
          callbackUrls: ["http://localhost:3000", "https://s302.cab432.com"],
        },
      }
    );

    return userPool;
  }

  private createParameterStoreParameters(): void {
    // Application configuration parameters
    new ssm.StringParameter(this, "AppConfigParameter", {
      parameterName: "/image-processor/config/app-name",
      stringValue: "Image Processor Assessment 2",
      description: "Application name configuration",
    });

    new ssm.StringParameter(this, "S3BucketParameter", {
      parameterName: "/image-processor/config/s3-bucket-name",
      stringValue: this.s3Bucket.bucketName,
      description: "S3 bucket name for image storage",
    });

    // Cognito parameters (disabled for now)
    // new ssm.StringParameter(this, "CognitoUserPoolIdParameter", {
    //   parameterName: "/image-processor/config/cognito-user-pool-id",
    //   stringValue: this.userPool.userPoolId,
    //   description: "Cognito User Pool ID",
    // });

    // new ssm.StringParameter(this, "CognitoUserPoolClientIdParameter", {
    //   parameterName: "/image-processor/config/cognito-user-pool-client-id",
    //   stringValue: this.userPool.userPoolClients[0].userPoolClientId,
    //   description: "Cognito User Pool Client ID",
    // });

    new ssm.StringParameter(this, "AWSRegionParameter", {
      parameterName: "/image-processor/config/aws-region",
      stringValue: this.region,
      description: "AWS region for the application",
    });

    new ssm.StringParameter(this, "ApplicationURLParameter", {
      parameterName: "/image-processor/config/application-url",
      stringValue: `http://${this.ec2Instance.instancePublicDnsName}:3000`,
      description: "Application URL",
    });

    new ssm.StringParameter(this, "ApplicationDomainParameter", {
      parameterName: "/image-processor/config/application-domain",
      stringValue: "https://n11837845-image-processor.cab432.com",
      description: "Application domain name",
    });

    // Feature flags
    new ssm.StringParameter(this, "FeatureFlagsParameter", {
      parameterName: "/image-processor/config/feature-flags",
      stringValue: JSON.stringify({
        s3Enabled: true,
        presignedUrlsEnabled: true,
        cognitoEnabled: false,
        rdsEnabled: true,
        statelessMode: true,
      }),
      description: "Feature flags for the application",
    });
  }

  private createSecretsManagerSecrets(): void {
    // Database credentials (using shared RDS)
    new secretsmanager.Secret(this, "DatabaseCredentialsSecret", {
      secretName: "image-processor/database-credentials",
      description: "Database credentials for shared RDS instance",
      secretStringValue: cdk.SecretValue.unsafePlainText(
        JSON.stringify({
          host: "database-1-instance-1.ce2haupt2cta.ap-southeast-2.rds.amazonaws.com",
          port: "5432",
          database: "cohort_2025",
          username: "s302",
          password: "FOseoXExzp8Q",
          ssl: "require",
          sslRejectUnauthorized: "false",
        })
      ),
    });

    // JWT secret for application
    new secretsmanager.Secret(this, "JWTSecret", {
      secretName: "image-processor/jwt-secret",
      description: "JWT secret for token signing",
      secretStringValue: cdk.SecretValue.unsafePlainText(
        "secret-key-n11837845"
      ),
    });

    // S3 configuration
    new secretsmanager.Secret(this, "S3ConfigSecret", {
      secretName: "image-processor/s3-config",
      description: "S3 configuration for the application",
      secretStringValue: cdk.SecretValue.unsafePlainText(
        JSON.stringify({
          bucketName: this.s3Bucket.bucketName,
          region: this.region,
          presignedUrlExpiration: 3600, // 1 hour
        })
      ),
    });

    // Application secrets
    new secretsmanager.Secret(this, "ApplicationSecrets", {
      secretName: "image-processor/application-secrets",
      description: "Application-specific secrets",
      secretStringValue: cdk.SecretValue.unsafePlainText(
        JSON.stringify({
          nodeEnv: "production",
          port: "3000",
          corsOrigin: "*",
          maxFileSize: "10485760", // 10MB
          allowedMimeTypes: "image/jpeg,image/png,image/gif,image/webp",
        })
      ),
    });
  }

  private createEC2Instance(): ec2.Instance {
    // Create security group for EC2
    const ec2SecurityGroup = new ec2.SecurityGroup(
      this,
      "ImageProcessorEC2SecurityGroup",
      {
        vpc: this.vpc,
        description: "Security group for Image Processor EC2 instance",
        allowAllOutbound: true,
      }
    );

    // Allow HTTP and HTTPS traffic
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow HTTP traffic"
    );
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "Allow HTTPS traffic"
    );
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(3000),
      "Allow application traffic"
    );
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow SSH traffic"
    );

    // Create IAM role for EC2 instance
    const ec2Role = new iam.Role(this, "ImageProcessorEC2Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
      ],
    });

    // Add policies for AWS services access
    ec2Role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
        ],
        resources: [this.s3Bucket.bucketArn, `${this.s3Bucket.bucketArn}/*`],
      })
    );

    // Cognito permissions (disabled for now)
    // ec2Role.addToPolicy(
    //   new iam.PolicyStatement({
    //     effect: iam.Effect.ALLOW,
    //     actions: [
    //       "cognito-idp:AdminGetUser",
    //       "cognito-idp:AdminCreateUser",
    //       "cognito-idp:AdminSetUserPassword",
    //       "cognito-idp:AdminInitiateAuth",
    //       "cognito-idp:AdminRespondToAuthChallenge",
    //     ],
    //     resources: [this.userPool.userPoolArn],
    //   })
    // );

    // (Removed) DynamoDB access policy

    ec2Role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath",
        ],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/image-processor/*`,
        ],
      })
    );

    ec2Role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:image-processor/*`,
        ],
      })
    );

    // Create EC2 instance
    const instance = new ec2.Instance(this, "ImageProcessorEC2Instance", {
      vpc: this.vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.SMALL
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: ec2SecurityGroup,
      role: ec2Role,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      userData: ec2.UserData.forLinux(),
    });

    // Add user data script
    instance.addUserData(
      "yum update -y",
      "yum install -y docker",
      "systemctl start docker",
      "systemctl enable docker",
      "usermod -a -G docker ec2-user",
      "yum install -y git",
      "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash",
      'export NVM_DIR="$HOME/.nvm"',
      '[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"',
      "nvm install 22",
      "nvm use 22",
      "npm install -g aws-cdk",
      "cd /home/ec2-user",
      "git clone https://github.com/Hyunsoo6257/image-processor.git",
      "cd image-processor",
      "npm install",
      "npm run build",
      "cd infra",
      "npm install",
      "cdk bootstrap",
      "cdk deploy --require-approval never"
    );

    return instance;
  }

  private createRoute53Records(): void {
    // Get the hosted zone for cab432.com (assuming it exists)
    const hostedZone = route53.HostedZone.fromLookup(this, "CAB432HostedZone", {
      domainName: "cab432.com",
    });

    // Create CNAME record for the application
    new route53.CnameRecord(this, "ImageProcessorCnameRecord", {
      zone: hostedZone,
      recordName: "n11837845-image-processor",
      domainName: this.ec2Instance.instancePublicDnsName,
      ttl: cdk.Duration.minutes(5),
      comment: "Image Processor Application - Assessment 2",
    });

    // Create A record as backup (if needed)
    new route53.ARecord(this, "ImageProcessorARecord", {
      zone: hostedZone,
      recordName: "s302-backup",
      target: route53.RecordTarget.fromIpAddresses(
        this.ec2Instance.instancePublicIp
      ),
      ttl: cdk.Duration.minutes(5),
      comment: "Image Processor Application - Backup A Record",
    });
  }

  private createOutputs(): void {
    // VPC outputs
    new cdk.CfnOutput(this, "VPCId", {
      value: this.vpc.vpcId,
      description: "VPC ID for the Image Processor application",
    });

    // S3 bucket outputs
    new cdk.CfnOutput(this, "S3BucketName", {
      value: this.s3Bucket.bucketName,
      description: "S3 bucket name for image storage",
    });

    new cdk.CfnOutput(this, "S3BucketArn", {
      value: this.s3Bucket.bucketArn,
      description: "S3 bucket ARN for image storage",
    });

    // Cognito outputs
    new cdk.CfnOutput(this, "CognitoUserPoolId", {
      value: this.userPool.userPoolId,
      description: "Cognito User Pool ID",
    });

    new cdk.CfnOutput(this, "CognitoUserPoolArn", {
      value: this.userPool.userPoolArn,
      description: "Cognito User Pool ARN",
    });

    // (Removed) DynamoDB outputs

    // (Removed) Redis outputs

    // EC2 outputs
    new cdk.CfnOutput(this, "EC2InstanceId", {
      value: this.ec2Instance.instanceId,
      description: "EC2 instance ID",
    });

    new cdk.CfnOutput(this, "EC2PublicIP", {
      value: this.ec2Instance.instancePublicIp,
      description: "EC2 instance public IP address",
    });

    new cdk.CfnOutput(this, "EC2PublicDNS", {
      value: this.ec2Instance.instancePublicDnsName,
      description: "EC2 instance public DNS name",
    });

    // Application URL
    new cdk.CfnOutput(this, "ApplicationURL", {
      value: `http://${this.ec2Instance.instancePublicDnsName}:3000`,
      description: "Application URL",
    });

    new cdk.CfnOutput(this, "ApplicationDomain", {
      value: "https://n11837845-image-processor.cab432.com",
      description: "Application domain name",
    });
  }
}
