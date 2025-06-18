# React App AWS Deployment with CDK

This guide will help you deploy a client-side React application with TypeScript and React Router to AWS using the AWS CDK.

## Prerequisites

Before you begin, ensure you have the following installed:

1. **Node.js** (version 18 or later)
2. **AWS CLI** configured with appropriate credentials
3. **AWS CDK CLI** installed globally
4. **TypeScript** (for the CDK script)

## Initial Setup

### 1. Install Required Dependencies

First, create a new directory for your CDK deployment configuration (separate from your React app):

```bash
mkdir react-app-deployment
cd react-app-deployment
npm init -y
```

Install the necessary CDK dependencies:

```bash
# Install CDK core libraries
npm install aws-cdk-lib constructs

# Install CDK CLI globally (if not already installed)
npm install -g aws-cdk

# Install TypeScript and related dependencies
npm install -D typescript @types/node ts-node
```

### 2. Configure TypeScript

Create a `tsconfig.json` file in your deployment directory:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "declaration": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": false,
    "inlineSourceMap": true,
    "inlineSources": true,
    "experimentalDecorators": true,
    "strictPropertyInitialization": false,
    "typeRoots": ["./node_modules/@types"]
  },
  "exclude": ["cdk.out"]
}
```

### 3. Create CDK Configuration

Create a `cdk.json` file:

```json
{
  "app": "npx ts-node app.ts",
  "watch": {
    "include": ["**"],
    "exclude": [
      "README.md",
      "cdk*.json",
      "**/*.d.ts",
      "**/*.js",
      "tsconfig.json",
      "package*.json",
      "yarn.lock",
      "node_modules",
      "test"
    ]
  },
  "context": {
    "@aws-cdk/aws-lambda:recognizeLayerVersion": true,
    "@aws-cdk/core:checkSecretUsage": true,
    "@aws-cdk/core:target": "aws-cdk-lib",
    "@aws-cdk/aws-apigateway:usagePlanKeyOrderInsensitiveId": true,
    "@aws-cdk/stackUpdateConstraint": true,
    "@aws-cdk/aws-rds:lowercaseDbIdentifier": true,
    "@aws-cdk/aws-lambda:recognizeVersionProps": true,
    "@aws-cdk/aws-cloudfront:defaultSecurityPolicyTLSv1.2_2021": true
  }
}
```

## React App Configuration

### Important: Build Directory

The CDK script assumes your React app builds to a `build` directory. If you're using:
- **Create React App**: Uses `build` directory (default configuration works)
- **Vite**: Usually uses `dist` directory - change line in CDK script from `'./build'` to `'./dist'`

### React Router Configuration

For React Router to work properly with this deployment, ensure your React app is configured correctly:

1. **Use BrowserRouter** (not HashRouter) in your React app:
```jsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        {/* Other routes */}
      </Routes>
    </Router>
  );
}
```

2. **Build your React app** before deployment:
```bash
# In your React app directory
npm run build
```

## Deployment Steps

### 1. Configure AWS Credentials

Ensure your AWS CLI is configured:

```bash
aws configure
```

Or use environment variables:
```bash
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_DEFAULT_REGION=us-east-1
```

### 2. Bootstrap CDK (First Time Only)

If this is your first time using CDK in your AWS account/region:

```bash
cdk bootstrap
```

### 3. Copy the CDK Script

Save the provided CDK script as `app.ts` in your deployment directory.

### 4. Update Build Path (If Necessary)

In the CDK script, update the build path if your React app doesn't use the `build` directory:

```typescript
// For Vite projects, change this line:
sources: [s3deploy.Source.asset('./build')],
// To:
sources: [s3deploy.Source.asset('./dist')],
```

### 5. Deploy the Stack

Deploy your infrastructure:

```bash
# Synthesize the CloudFormation template (optional, for review)
cdk synth

# Deploy the stack
cdk deploy
```

You'll be prompted to confirm the deployment. Type 'y' to proceed.

## Post-Deployment

After successful deployment, you'll see outputs including:

- **DistributionURL**: Your app's CloudFront URL (use this for production)
- **BucketWebsiteURL**: Direct S3 website URL
- **DistributionId**: CloudFront distribution ID
- **BucketName**: S3 bucket name

## Updating Your App

To update your deployed app:

1. Build your React app: `npm run build`
2. Run: `cdk deploy`

The deployment will automatically upload new files and invalidate the CloudFront cache.

## Environment Management

### Multiple Environments

To deploy to different environments (dev, staging, prod):

```bash
# Deploy to development
ENVIRONMENT=dev cdk deploy

# Deploy to staging
ENVIRONMENT=staging cdk deploy

# Deploy to production
ENVIRONMENT=prod cdk deploy
```

### Environment Variables

You can set environment-specific configuration:

```bash
export ENVIRONMENT=prod
export CDK_DEFAULT_REGION=us-west-2
cdk deploy
```

## Troubleshooting

### Common Issues

1. **404 Errors on Refresh**: The CDK script includes error response configuration to handle React Router properly. If you still get 404s, check that the error responses are correctly configured.

2. **Build Directory Not Found**: Ensure your React app is built and the build directory path in the CDK script matches your build output.

3. **Permission Denied**: Check your AWS credentials and ensure you have the necessary permissions to create S3 buckets and CloudFront distributions.

4. **Cache Issues**: After deployment, it may take a few minutes for CloudFront to update. You can manually invalidate the cache:
   ```bash
   aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"
   ```

### Useful Commands

```bash
# List all stacks
cdk list

# Show differences between deployed stack and current code
cdk diff

# Destroy the stack (careful with production!)
cdk destroy

# Watch for changes and auto-deploy (development)
cdk deploy --hotswap
```

## Security Considerations

1. **Production Settings**: For production deployments, consider:
   - Setting `removalPolicy` to `RETAIN`
   - Enabling access logging
   - Adding custom domain with SSL certificate
   - Implementing proper IAM policies

2. **Cost Optimization**: The current configuration uses `PRICE_CLASS_100` for CloudFront. Adjust based on your global audience needs.

## Custom Domain (Optional)

To add a custom domain, you'll need:
1. A registered domain
2. An SSL certificate in AWS Certificate Manager
3. Additional configuration in the CDK script

This setup provides a robust, scalable deployment for your React application with proper routing support and global CDN distribution.

# Troubleshooting Tips

If at any point you get stuck, particularly when running `cdk deploy`, take the output and paste it into an LLM like like Gemini. It is very good at troubleshooting these errors.