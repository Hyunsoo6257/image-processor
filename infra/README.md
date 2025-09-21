# Image Processor Infrastructure

This directory contains the AWS CDK infrastructure code for the Image Processor application (Assessment 2).

## Prerequisites

1. **AWS CLI configured** with appropriate credentials
2. **Node.js 18+** installed
3. **AWS CDK** installed globally: `npm install -g aws-cdk`

## Setup

1. **Install dependencies:**

   ```bash
   cd infra
   npm install
   ```

2. **Bootstrap CDK (first time only):**

   ```bash
   cdk bootstrap
   ```

3. **Deploy the infrastructure:**
   ```bash
   cdk deploy
   ```

## Available Commands

- `npm run build` - Compile TypeScript
- `npm run watch` - Watch for changes and compile
- `cdk deploy` - Deploy the stack
- `cdk destroy` - Destroy the stack
- `cdk diff` - Show differences between deployed stack and current code
- `cdk synth` - Synthesize CloudFormation template

## Infrastructure Components

### Core Services

- **VPC** - Virtual Private Cloud with public/private subnets
- **EC2** - Application server instance
- **S3** - Image storage bucket
- **Cognito** - User authentication and management
- **DynamoDB** - Session and cache data storage
- **ElastiCache** - Redis cluster for caching
- **Parameter Store** - Application configuration
- **Secrets Manager** - Secure credential storage
- **Route53** - DNS management

### Security

- **IAM Roles** - Least privilege access
- **Security Groups** - Network access control
- **VPC** - Network isolation
- **Encryption** - Data encryption at rest and in transit

## Outputs

After deployment, the following outputs will be available:

- VPC ID
- S3 Bucket Name and ARN
- Cognito User Pool ID and ARN
- DynamoDB Table Name
- Redis Endpoint
- EC2 Instance Details
- Application URLs

## Configuration

The infrastructure is configured for the `ap-southeast-2` region by default. To change the region, update the `env` property in `bin/image-processor-stack.ts`.

## Tags

All resources are tagged with:

- Project: image-processor
- Student: s302
- Environment: assessment-2
- Owner: s302@connect.qut.edu.au

