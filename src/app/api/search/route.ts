import { NextResponse } from "next/server";
import { ListObjectsV2Command, ListObjectsV2CommandOutput } from "@aws-sdk/client-s3";
import { s3Client, bucketName } from "@/lib/s3Client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.toLowerCase();

    if (!q) {
      return NextResponse.json({ files: [], folders: [] });
    }

    const files: any[] = [];
    const folderSet = new Set<string>();

    let isTruncated = true;
    let continuationToken: string | undefined = undefined;
    let limit = 0;

    while (isTruncated && limit < 10) {
      const response: ListObjectsV2CommandOutput = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          ContinuationToken: continuationToken,
        })
      );

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (!obj.Key) continue;

          const isFolder = obj.Key.endsWith("/");
          const filename = obj.Key.split("/").filter(Boolean).pop() || "";

          // Match filename against query (case-insensitive)
          if (filename.toLowerCase().includes(q)) {
            if (isFolder) {
              folderSet.add(obj.Key);
            } else {
              files.push({
                key: obj.Key,
                lastModified: obj.LastModified?.toISOString() || new Date().toISOString(),
                size: obj.Size || 0,
              });
            }
          }
        }
      }

      isTruncated = response.IsTruncated ?? false;
      continuationToken = response.NextContinuationToken;
      limit++;
    }

    const folders = Array.from(folderSet).map(f => ({ name: f }));

    return NextResponse.json({ files, folders });
  } catch (error: any) {
    console.error("Search API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
