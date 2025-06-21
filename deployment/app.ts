#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';
import { RemovalPolicy } from 'aws-cdk-lib';
import * as path from 'path'; // Import path for correct source asset resolution


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
 * * This stack creates:
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
     * * Creates an S3 bucket to store the React app's static files.
     * The bucket is configured for static website hosting.
     */
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `${appName}-${envName}-${this.account}-${this.region}`,
      // websiteIndexDocument and websiteErrorDocument are not typically used when CloudFront is the primary access method
      // CloudFront will handle the default root object and error responses.
      // websiteIndexDocument: 'index.html', // Removed: CloudFront handles this
      // websiteErrorDocument: 'index.html', // Removed: CloudFront handles this

      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      
      // FIX: Ensure object ownership is enforced to disable ACLs.
      // This is crucial to avoid "The bucket does not allow ACLs" error.
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED, 
      
      // `accessControl: undefined` is redundant if objectOwnership is BUCKET_OWNER_ENFORCED
      // as ACLs are disabled. You can remove it or keep it as a clear intention.
      accessControl: s3.BucketAccessControl.PRIVATE, // Explicitly set to PRIVATE or undefined

      removalPolicy: envName === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: envName !== 'prod',
      versioned: true, // Good for rollbacks
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ['*'], // Be more specific in production if possible
          allowedHeaders: ['*'],
          // maxAge: cdk.Duration.seconds(300), // Optional: Max age for preflight requests
        },
      ],
    });

    // Create an Origin Access Identity (OAI) for CloudFront
    // Note: AWS recommends Origin Access Control (OAC) over OAI for new distributions
    // OAC offers more granular permissions and better security features (e.g., SSE-KMS, dynamic requests).
    // For this fix, we'll keep OAI to minimize changes, but consider OAC for future improvements.
    const oai = new cloudfront.OriginAccessIdentity(this, 'OAI', {
      comment: `OAI for ${appName} ${envName}`,
    });

    // Grant CloudFront OAI read access to the S3 bucket via a Bucket Policy
    // This is the correct way when ACLs are disabled (Bucket owner enforced).
    websiteBucket.grantRead(oai);

    /**
     * CLOUDFRONT DISTRIBUTION CONFIGURATION
     * * Creates a CloudFront distribution for:
     * - Global CDN for faster content delivery
     * - Custom domain support
     * - HTTPS enforcement
     * - Proper handling of React Router routes
     */
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      // Use the S3 bucket as the origin
      defaultBehavior: {
        // FIX: Use S3BucketOrigin instead of deprecated S3Origin
        origin: new origins.S3BucketOrigin(websiteBucket, {
          originAccessIdentity: oai,
        }),
        
        // Allow all HTTP methods for potential future API integration (be cautious if S3 is writeable via CF)
        // For static hosting, GET/HEAD is usually sufficient. ALLOW_ALL can expose write operations if not careful.
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS, // More restrictive, usually sufficient for SPAs
        
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

      // Optional: Add custom domain configuration if domainName is provided in props
      // This would require additional resources like Route53 hosted zone and ACM certificate
      // certificate: props.domainName ? someCertificate : undefined,
      // domainNames: props.domainName ? [props.domainName] : undefined,
    });


    /**
     * DEPLOYMENT CONFIGURATION
     * * Automatically deploys your React app build files to S3 and invalidates CloudFront cache.
     * Make sure your React app builds to a 'build' or 'dist' directory.
     */
    const deployment = new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      // Source: Your React app's build output directory
      // FIX: Use path.join for platform-independent path resolution
      // Make sure '../dist' is the correct relative path from where you run 'cdk deploy'
      // If your 'build' or 'dist' folder is directly inside your CDK project folder, it might be './dist'
      sources: [s3deploy.Source.asset(path.join(__dirname, '../dist'))], 
      
      // Destination: The S3 bucket we created
      destinationBucket: websiteBucket,
      
      // Invalidate CloudFront cache after deployment
      distribution: distribution,
      distributionPaths: ['/*'], // Invalidate all paths after deployment
      
      // Memory allocation for the deployment Lambda
      memoryLimit: 512,
      
      // Prune old versions to save space
      prune: true,
      
      // Cache control headers for different file types
      // The `cacheControl` array is applied to *all* deployed objects unless overridden by a `setMetadata` call
      // or if your build process adds specific headers. For typical SPAs:
      cacheControl: [
        s3deploy.CacheControl.fromString('public, max-age=0, s-maxage=300, must-revalidate'), // HTML/index.html (short cache for CDN, no browser cache)
      ],
      // For assets (JS/CSS with hashes), you'd typically handle them separately or ensure your build outputs them with hashes
      // and let CloudFront's cache policy handle them. If you want a long S3 cache for assets:
      // put this into your build process or define multiple BucketDeployment instances if paths allow.
      // For now, the existing `cacheControl` will apply to everything.
      // If your build tools add unique hashes to JS/CSS files, they're often cached for a long time by CloudFront automatically.
    });

    /**
     * OUTPUTS
     * * These outputs provide important information after deployment
     */
    
    // S3 bucket website URL (direct access)
    // Note: With CloudFront, the S3 bucket is typically not directly publicly accessible.
    // This URL might not work unless you explicitly open the bucket for public access (not recommended).
    new cdk.CfnOutput(this, 'BucketWebsiteURL', {
      value: websiteBucket.bucketWebsiteUrl,
      description: 'S3 bucket website URL (direct access, usually via OAI/OAC)',
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
 * * This creates and deploys the stack
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