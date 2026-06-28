# How to Fix Upload CORS Errors

The file uploads are currently configured to go **directly from your browser to your S3 Bucket/MinIO server** using Pre-Signed URLs. This is the absolute best-practice architecture because it saves your backend server from crashing or timing out when uploading massive files (like large 4K videos).

However, because your browser is uploading directly to the storage bucket, the storage bucket **must** be configured to explicitly allow your frontend application to talk to it. This is called a CORS (Cross-Origin Resource Sharing) policy.

If you are getting a `TypeError: Failed to fetch` or similar errors in the console when uploading, you need to apply the following CORS policy to your bucket:

## The Required CORS Policy
Your bucket needs this JSON CORS policy (or equivalent settings):
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

---

## How to Apply It

### 1. If you are using Cloudflare R2
1. Go to the Cloudflare Dashboard -> R2 -> Click on your bucket (`testing`).
2. Click the **Settings** tab.
3. Scroll down to **CORS Policy** and click **Add CORS Policy**.
4. Paste the JSON from above into the editor and click Save.

### 2. If you are using MinIO (Local or Hosted)
You can use the MinIO Client (`mc`) to set the CORS policy.
1. Save the JSON above to a file called `cors.json` on your machine.
2. Run this command to set the policy:
   ```bash
   mc admin config set myminio api cors_allow_origin="*"
   ```
   *Alternatively*, if using the newer MinIO CLI for buckets:
   ```bash
   mc anonymous set download myminio/testing
   # and set CORS in the MinIO Web Console under Bucket -> Access Rules
   ```
   **Easiest way:** Log into your MinIO Web Console (usually `http://localhost:9001`), go to your bucket settings, and look for CORS/Access rules.

### 3. If you are using AWS S3
1. Go to the AWS Console -> S3 -> Click your bucket.
2. Go to the **Permissions** tab.
3. Scroll down to **Cross-origin resource sharing (CORS)** and click **Edit**.
4. Paste the JSON from above and save.
