import { NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { s3Client, bucketName } from "@/lib/s3Client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const prefix = searchParams.get("prefix") || "";

    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      Delimiter: "/",
    });
    
    const response = await s3Client.send(command);
    
    const files = (response.Contents || [])
      .filter((file) => file.Key !== prefix && !file.Key?.endsWith("/")) // Filter out the current folder object itself and any other 0-byte folder markers
      .map((file) => ({
        key: file.Key,
        lastModified: file.LastModified,
        size: file.Size,
      }));

    const folders = (response.CommonPrefixes || []).map((prefixObj) => ({
      name: prefixObj.Prefix,
    }));

    return NextResponse.json({ files, folders });
  } catch (error: any) {
    console.error("Error listing files:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
