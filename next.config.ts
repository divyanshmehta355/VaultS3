import type { NextConfig } from "next";
import { withNextVideo } from "next-video/process";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withNextVideo(nextConfig, {
  provider: "amazon-s3",
  providerConfig: {
    "amazon-s3": {
      endpoint: process.env.MINIO_ENDPOINT || "",
      bucket: process.env.MINIO_BUCKET_NAME || "",
      accessKeyId: process.env.MINIO_ACCESS_KEY || "",
      secretAccessKey: process.env.MINIO_SECRET_KEY || "",
    },
  },
});
