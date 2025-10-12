import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const BUCKET_NAME = process.env.BUCKET_NAME;

export const handler = async (event) => {
  try {
    console.log('generatePresignUrl.handler() event:', event);
    const key = event.key;
    console.log('generatePresignUrl.handler() key:', key);
    const operation = event.operation || "get_object"; // default to GET
    console.log('generatePresignUrl.handler() operation:', operation);

    if (!key) {
      return response(400, { error: "Missing 'key' parameter" });
    }

    let command;
    if (operation === "get_object") {
      command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
    } else if (operation === "put_object") {
      command = new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key });
    } else {
      return response(400, { error: "Invalid operation. Must be 'get_object' or 'put_object'." });
    }

    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour

    return response(200, { url });
  } catch (err) {
    console.error("Error generating pre-signed URL:", err);
    return response(500, { error: err.message || "Internal Server Error" });
  }
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*", // CORS for frontend
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}
