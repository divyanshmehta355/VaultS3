import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, bucketName } from "@/lib/s3Client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json({ error: "Key is required" }, { status: 400 });
    }

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    
    // Generate a URL valid for 7 days
    const url = await getSignedUrl(s3Client, command, { expiresIn: 7 * 24 * 3600 });
    return NextResponse.json({ url });
  } catch (error: any) {
    console.error("Error generating share URL:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
