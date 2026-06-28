import { NextResponse } from "next/server";
import { ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { s3Client, bucketName } from "@/lib/s3Client";

export async function POST(request: Request) {
  try {
    const { prefix } = await request.json();

    if (!prefix) {
      return NextResponse.json({ error: "Prefix is required" }, { status: 400 });
    }

    const folderPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;

    // 1. List all objects within this folder (recursively)
    let isTruncated = true;
    let continuationToken: string | undefined = undefined;

    while (isTruncated) {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: folderPrefix,
        ContinuationToken: continuationToken,
      });

      const listResponse = await s3Client.send(listCommand);

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        // 2. Delete all objects found
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: listResponse.Contents.map((item) => ({ Key: item.Key })),
            Quiet: false,
          },
        });

        await s3Client.send(deleteCommand);
      }

      isTruncated = listResponse.IsTruncated || false;
      continuationToken = listResponse.NextContinuationToken;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting folder:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
