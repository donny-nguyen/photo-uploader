import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const BUCKET_NAME = process.env.BUCKET_NAME;
const TABLE_NAME = process.env.TABLE_NAME;
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN;

// Define the function version
const FUNCTION_VERSION = "1.0.0"; // Update this manually or inject via environment variables

export const handler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const operation = body.operation || "get_object";
    const key = body.key;
    const description = body.description;

    // Handle version check
    if (operation === "get_version") {
      return response(200, { version: FUNCTION_VERSION });
    }

    if (!key && operation !== "get_version") {
      return response(400, { error: "Missing 'key' parameter" });
    }

    let command;
    if (operation === "get_object") {
      command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
    } else if (operation === "put_object") {
      command = new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key });
    } else {
      return response(400, { error: "Invalid operation. Must be 'get_object', 'put_object', or 'get_version'." });
    }

    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    if (operation === "put_object" && description !== undefined) {
      const timestamp = new Date().toISOString();
      const imageUrl = CLOUDFRONT_DOMAIN
        ? `https://${CLOUDFRONT_DOMAIN}/${key}`
        : `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          imageKey: key,
          description: description || "",
          uploadedAt: timestamp,
          imageUrl: imageUrl
        }
      }));
    }

    return response(200, { url });
  } catch (err) {
    console.error("Error:", err);
    return response(500, { error: err.message || "Internal Server Error" });
  }
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}