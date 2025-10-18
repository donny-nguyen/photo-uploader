import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const BUCKET_NAME = process.env.BUCKET_NAME;
const TABLE_NAME = process.env.TABLE_NAME;
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN;
const FUNCTION_VERSION = "1.1.0";

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

    let url;
    if (operation === "get_object") {
      // Generate CloudFront URL directly without presigning
      if (CLOUDFRONT_DOMAIN) {
        url = `https://${CLOUDFRONT_DOMAIN}/${key}`;
      } else {
        // Fallback to S3 URL if CloudFront domain is not configured
        url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
      }
    } else if (operation === "put_object") {
      const command = new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key });
      url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

      // Store metadata in DynamoDB
      if (description !== undefined) {
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
    } else {
      return response(400, { error: "Invalid operation. Must be 'get_object', 'put_object', or 'get_version'." });
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