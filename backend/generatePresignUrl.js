import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "crypto";

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const BUCKET_NAME = process.env.BUCKET_NAME;
const TABLE_NAME = process.env.TABLE_NAME;
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN;
const FUNCTION_VERSION = "1.1.0";
const AUTH_PASSWORD = process.env.AUTH_PASSWORD;
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, "base64"); // 32 bytes

function decryptPassword(encrypted) {
  const buffer = Buffer.from(encrypted, "base64");
  const iv = buffer.subarray(0, 16); // first 16 bytes
  const encryptedText = buffer.subarray(16);

  const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString("utf8");
}

export const handler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const operation = body.operation || "get_object";
    const key = body.key;
    const description = body.description;
    const encryptedPassword = body.password;

    if (operation === "get_version") {
      return response(200, { version: FUNCTION_VERSION });
    }

    if (!encryptedPassword) {
      return response(401, { error: "Unauthorized: Missing password" });
    }

    let decryptedPassword;
    try {
      decryptedPassword = decryptPassword(encryptedPassword);
    } catch (err) {
      return response(401, { error: "Unauthorized: Failed to decrypt password" });
    }

    if (decryptedPassword !== AUTH_PASSWORD) {
      return response(401, { error: "Unauthorized: Invalid password" });
    }

    if (!key) {
      return response(400, { error: "Missing 'key' parameter" });
    }

    let url;
    if (operation === "get_object") {
      url = CLOUDFRONT_DOMAIN
        ? `https://${CLOUDFRONT_DOMAIN}/${key}`
        : `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    } else if (operation === "put_object") {
      const command = new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key });
      url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

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
