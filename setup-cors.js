const { S3Client, PutBucketCorsCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");

const env = fs.readFileSync(".env.local", "utf8");
const envVars = Object.fromEntries(
  env.split("\n").filter(line => line.includes("=")).map(line => {
    const [key, ...rest] = line.split("=");
    return [key.trim(), rest.join("=").trim()];
  })
);

const s3Client = new S3Client({
  region: "us-east-1",
  endpoint: envVars.MINIO_ENDPOINT,
  credentials: {
    accessKeyId: envVars.MINIO_ACCESS_KEY,
    secretAccessKey: envVars.MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
});

async function main() {
  const bucketName = envVars.MINIO_BUCKET_NAME;
  console.log(`Setting CORS for bucket: ${bucketName}...`);
  try {
    const corsCommand = new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
            AllowedOrigins: ["*"],
            ExposeHeaders: ["ETag", "Content-Length", "Content-Type"],
            MaxAgeSeconds: 3000,
          }
        ]
      }
    });
    await s3Client.send(corsCommand);
    console.log("CORS configured successfully!");
  } catch (error) {
    console.error("Error setting CORS:", error);
  }
}

main();
