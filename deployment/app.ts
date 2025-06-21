#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
// import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { RemovalPolicy } from 'aws-cdk-lib';

/**
 * Props for the ReactAppStack
 */
interface ReactAppStackProps extends cdk.StackProps {
  // Domain name for the app (optional)
  domainName?: string;
  // Environment name (dev, staging, prod)
  environment?: string;
}

/**
 * CDK Stack for deploying a client-side React application with TypeScript and React Router
 * 
 * This stack creates:
 * - S3 bucket for hosting static files
 * - CloudFront distribution for CDN and custom domain support
 * - Proper error handling for React Router (SPA routing)
 * - Automatic deployment of build artifacts
 */
export class ReactAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ReactAppStackProps = {}) {
    super(scope, id, props);

    // Extract environment name for resource naming
    const envName = props.environment || 'dev';
    const appName = 'react-app';

    /**
     * S3 BUCKET CONFIGURATION
     * 
     * Creates an S3 bucket to store the React app's static files.
     * The bucket is configured for static website hosting.
     */
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `${appName}-${envName}-${this.account}-${this.region}`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      // Remove public access
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      accessControl: undefined, // Let bucket policy control access
      removalPolicy: envName === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: envName !== 'prod',
      versioned: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
    });

    // Create an Origin Access Identity (OAI) for CloudFront
    const oai = new cloudfront.OriginAccessIdentity(this, 'OAI', {
      comment: `OAI for ${appName} ${envName}`,
    });

    /**
     * CLOUDFRONT DISTRIBUTION CONFIGURATION
     * 
     * Creates a CloudFront distribution for:
     * - Global CDN for faster content delivery
     * - Custom domain support
     * - HTTPS enforcement
     * - Proper handling of React Router routes
     */
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      // Use the S3 bucket as the origin
      defaultBehavior: {
        origin: new origins.S3Origin(websiteBucket, {
          originAccessIdentity: oai,
        }),
        
        // Allow all HTTP methods for potential future API integration
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        
        // Cache policy optimized for SPAs
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        
        // Redirect HTTP to HTTPS
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        
        // Compress files for faster delivery
        compress: true,
      },

      // Default root object
      defaultRootObject: 'index.html',
      
      // CRITICAL: Custom error responses for React Router
      // This ensures that all routes (like /about, /contact) serve the index.html file
      // instead of returning 404 errors from S3
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(30),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(30),
        },
      ],

      // Price class - adjust based on your global audience needs
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // US, Canada, Europe
      
      // Enable HTTP/2
      httpVersion: cloudfront.HttpVersion.HTTP2,
      
      // Comment for identification
      comment: `${appName}-${envName} React App Distribution`,
    });

    // Grant CloudFront OAI access to the S3 bucket
    websiteBucket.grantRead(oai);

    /**
     * DEPLOYMENT CONFIGURATION
     * 
     * Automatically deploys your React app build files to S3 and invalidates CloudFront cache.
     * Make sure your React app builds to a 'build' or 'dist' directory.
     */
    const deployment = new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      // Source: Your React app's build output directory
      // Update this path to match your build output directory
      sources: [s3deploy.Source.asset('../dist')], // Change to './dist' if using Vite
      
      // Destination: The S3 bucket we created
      destinationBucket: websiteBucket,
      
      // Invalidate CloudFront cache after deployment
      distribution: distribution,
      distributionPaths: ['/*'],
      
      // Memory allocation for the deployment Lambda
      memoryLimit: 512,
      
      // Prune old versions to save space
      prune: true,
      
      // Cache control headers for different file types
      cacheControl: [
        // Cache static assets for 1 year (they have hashed names)
        s3deploy.CacheControl.setPublic(),
        s3deploy.CacheControl.maxAge(cdk.Duration.days(365)),
        
        // Don't cache HTML files (for immediate updates)
        s3deploy.CacheControl.fromString('public, max-age=0, must-revalidate'),
      ],
    });

    /**
     * OUTPUTS
     * 
     * These outputs provide important information after deployment
     */
    
    // S3 bucket website URL (direct access)
    new cdk.CfnOutput(this, 'BucketWebsiteURL', {
      value: websiteBucket.bucketWebsiteUrl,
      description: 'S3 bucket website URL (direct access)',
    });

    // CloudFront distribution URL (recommended for production)
    new cdk.CfnOutput(this, 'DistributionURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL (recommended)',
    });

    // CloudFront distribution ID (useful for manual cache invalidation)
    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID',
    });

    // S3 bucket name (useful for CI/CD pipelines)
    new cdk.CfnOutput(this, 'BucketName', {
      value: websiteBucket.bucketName,
      description: 'S3 bucket name',
    });
  }
}

/**
 * CDK APP INSTANTIATION
 * 
 * This creates and deploys the stack
 */
const app = new cdk.App();

// Create the stack with environment-specific configuration
new ReactAppStack(app, 'ReactAppStack', {
  // Specify environment - change as needed
  environment: process.env.ENVIRONMENT || 'dev',
  
  // AWS environment configuration
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  
  // Stack description
  description: 'Static website hosting for React SPA with TypeScript and React Router',
  
  // Tags for resource management
  tags: {
    Project: 'ReactApp',
    Environment: process.env.ENVIRONMENT || 'dev',
    ManagedBy: 'CDK',
  },
});

// Synthesize the CloudFormation template
app.synth();