import { NextResponse } from "next/server";
import { ListObjectsV2Command, ListObjectsV2CommandOutput } from "@aws-sdk/client-s3";
import { s3Client, bucketName } from "@/lib/s3Client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const prefix = searchParams.get("prefix");

    if (!prefix) {
      return NextResponse.json({ error: "Missing prefix parameter" }, { status: 400 });
    }

    let totalSize = 0;
    let totalFiles = 0;
    let isTruncated = true;
    let continuationToken: string | undefined = undefined;

    while (isTruncated) {
      const response: ListObjectsV2CommandOutput = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (!obj.Key) continue;
          if (obj.Key.endsWith("/")) continue; // Ignore 0-byte folder markers

          totalSize += obj.Size || 0;
          totalFiles++;
        }
      }

      isTruncated = response.IsTruncated ?? false;
      continuationToken = response.NextContinuationToken;
    }

    return NextResponse.json({ size: totalSize, count: totalFiles });
  } catch (error: any) {
    console.error("Folder size API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
