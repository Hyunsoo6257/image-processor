Assignment 2 - Cloud Services Exercises - Response to Criteria

## Overview

- **Name:** Hyunsoo Park
- **Student number:** n11837845
- **Partner name (if applicable):** N/A
- **Application name:** Image Processor
- **Two line description:** A image processing application that provides image transformations
- **EC2 instance name or ID:** ImageProcessorEC2Instance

---

### Core - First data persistence service

- **AWS service name:** S3
- **What data is being stored?:** Image files
- **Why is this service suited to this data?:** S3 provides unlimited storage for large binary files with high durability and cost-effective pricing.
- **Why are the other services used not suitable for this data?:** RDS has limited storage for binary files. DynamoDB has 400KB item size limit.
- **Bucket/instance/table name:** a2-n11837845-image-processor
- **Video timestamp:** 00:00 - 00: 40
- **Relevant files:**
  - src/services/s3Service.ts
  - src/routes/files.ts

### Core - Second data persistence service

- **AWS service name:** PostgreSQL RDS
- **What data is being stored?:** User metadata, file info, job history, credit transactions
- **Why is this service suited to this data?:** Provides ACID compliance for financial transactions and complex queries for user management.
- **Why are the other services used not suitable for this data?:** S3 cannot handle complex queries. DynamoDB lacks advanced querying capabilities.
- **Bucket/instance/table name:** database-1-instance-1.ce2haupt2cta.ap-southeast-2.rds.amazonaws.com
- **Video timestamp:** 00: 40 - 01:50
- **Relevant files:**
  - src/models/database.ts
  - src/models/credits.ts

### S3 Pre-signed URLs

- **S3 Bucket names:** a2-n11837845-image-processor
- **Video timestamp:** 01:50 - 02:16
- **Relevant files:**
  - src/services/s3Service.ts
  - public/modules/files.js

### Core - Statelessness

- **What data is stored within your application that is not stored in cloud data services?:** In-memory job storage, temporary processing buffers, and credit system fallback data
- **Why is this data not considered persistent state?:** Can be reconstructed from database on restart. Temporary buffers are regenerated from S3 files. Credit data falls back to in-memory storage when database is unavailable.
- **How does your application ensure data consistency if the app suddenly stops?:** Uses database transactions with ACID properties. Processing history recorded atomically with job updates. Credit transactions are handled through database transactions to ensure financial consistency.
- **Relevant files:**
  - src/models/jobs.ts
  - src/models/credits.ts

### Core - Authentication with Cognito

- **User pool name:** n11837845-image-processor-pool
- **How are authentication tokens handled by the client?:** JWT tokens stored in localStorage and sent as Bearer tokens in Authorization headers.
- **Video timestamp:** 02:26 - 03:30
- **Relevant files:**
  - src/services/cognitoService.ts
  - src/middleware/auth.ts

### Cognito groups

- **How are groups used to set permissions?:** Admin users have unlimited credits and admin access. Regular users have limited credits and standard access.
- **Video timestamp:**
- **Relevant files:**
  - src/services/cognitoService.ts

### Core - DNS with Route53

- **Subdomain:** n11837845-image-processor.cab432.com
- **Video timestamp:** 03:35 - 04:12

### Parameter store

- **Parameter names:** n11837845
- **Video timestamp:** 04:13 - 04:36
- **Relevant files:**
  - src/services/configService.ts

### Secrets manager

- **Secrets names:** n11837845/database-credentials, n11837845/email-credentials, n11837845/unsplash-keys, n11837845/cognito-config, n11837845/google-oauth-config
- **Video timestamp:** 04:37 - 05:26
- **Relevant files:**
  - src/services/configService.ts

### Infrastructure as code

- **Technology used:** AWS CloudFormation
- **Services deployed:** Cognito, EC2, IAM, S3, RDS, VPC
- **Video timestamp:**
- **Relevant files:**
  - template.yml
