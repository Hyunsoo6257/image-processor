#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ImageProcessorStack } from "../lib/image-processor-stack";

const app = new cdk.App();

// Create the main stack
new ImageProcessorStack(app, "ImageProcessorStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "ap-southeast-2",
  },
  description: "Image Processor Application Infrastructure for Assessment 2",
  tags: {
    Project: "image-processor",
    Student: "s302",
    Environment: "assessment-2",
    Owner: "s302@connect.qut.edu.au",
  },
});

// Add additional stacks if needed
// new DynamoDBStack(app, 'DynamoDBStack', { ... });
// new ElastiCacheStack(app, 'ElastiCacheStack', { ... });

