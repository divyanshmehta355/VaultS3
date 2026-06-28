import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, bucketName } from "@/lib/s3Client";

export async function POST(request: Request) {
  try {
    const { path } = await request.json();

    if (!path) {
      return NextResponse.json({ error: "Path is required" }, { status: 400 });
    }

    // Ensure path ends with a slash to act as a folder
    const folderKey = path.endsWith("/") ? path : `${path}/`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: folderKey,
      Body: "", // 0-byte object
    });

    await s3Client.send(command);

    return NextResponse.json({ success: true, folder: folderKey });
  } catch (error: any) {
    console.error("Error creating folder:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
