import { S3Client } from "@aws-sdk/client-s3";

const endpoint = process.env.MINIO_ENDPOINT || "http://localhost:9000";
const accessKeyId = process.env.MINIO_ACCESS_KEY || "minioadmin";
const secretAccessKey = process.env.MINIO_SECRET_KEY || "minioadmin";
export const bucketName = process.env.MINIO_BUCKET_NAME || "my-bucket";

export const s3Client = new S3Client({
  region: "us-east-1", // Minio typically ignores this but it's required by the SDK
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  forcePathStyle: true, // Necessary for Minio
});
