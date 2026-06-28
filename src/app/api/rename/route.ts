import { NextResponse } from "next/server";
import { CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, bucketName } from "@/lib/s3Client";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: Request) {
  try {
    const { oldKey, newName } = await request.json();

    if (!oldKey || !newName) {
      return NextResponse.json({ error: "Missing oldKey or newName" }, { status: 400 });
    }

    const lastDotIndex = newName.lastIndexOf(".");
    let newKey;
    if (lastDotIndex !== -1 && lastDotIndex !== 0) {
      const namePart = newName.substring(0, lastDotIndex);
      const extPart = newName.substring(lastDotIndex);
      newKey = `${namePart}-${uuidv4()}${extPart}`;
    } else {
      newKey = `${newName}-${uuidv4()}`;
    }

    // 1. Copy to new key
    const copyCommand = new CopyObjectCommand({
      Bucket: bucketName,
      CopySource: `${bucketName}/${encodeURIComponent(oldKey)}`,
      Key: newKey,
    });
    
    await s3Client.send(copyCommand);

    // 2. Delete old key
    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: oldKey,
    });

    await s3Client.send(deleteCommand);

    return NextResponse.json({ success: true, newKey });
  } catch (error: any) {
    console.error("Error renaming file:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
