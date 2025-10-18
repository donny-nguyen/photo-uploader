import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({ region: process.env.AWS_REGION || "us-east-1" });

// Set CORS headers
const getHeaders = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, X-Amz-Date, Authorization, X-Api-Key, X-Amz-Security-Token",
  "Content-Type": "application/json",
});

const validateEmailParams = (body) => {
  const { subject, message } = body;

  const fromEmail = process.env.FROM_EMAIL;
  const toEmail = process.env.TO_EMAIL;

  if (!fromEmail || !toEmail) {
    throw new Error("FROM_EMAIL and TO_EMAIL environment variables must be configured");
  }

  if (!subject || !message) {
    throw new Error("Missing required fields: subject and message are required");
  }

  return {
    ...body,
    from: fromEmail,
    to: toEmail,
  };
};

const createEmailParams = (body, fromEmail, toEmail) => {
  const { subject, message } = body;

  return {
    Destination: {
      ToAddresses: Array.isArray(toEmail) ? toEmail : [toEmail],
    },
    Message: {
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: message,
        },
        Text: {
          Charset: "UTF-8",
          Data: message.replace(/<[^>]*>/g, ""),
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: subject,
      },
    },
    Source: fromEmail,
  };
};

const handleOptionsRequest = () => ({
  statusCode: 200,
  headers: getHeaders(),
  body: JSON.stringify({ message: "CORS preflight" }),
});

const createSuccessResponse = (messageId) => ({
  statusCode: 200,
  headers: getHeaders(),
  body: JSON.stringify({
    message: "Email sent successfully",
    messageId,
  }),
});

const createErrorResponse = (statusCode, error, details = null) => ({
  statusCode,
  headers: getHeaders(),
  body: JSON.stringify({
    error,
    ...(details && { details }),
  }),
});

export const handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  if (event.httpMethod === "OPTIONS") {
    return handleOptionsRequest();
  }

  try {
    let body;
    try {
      body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch (parseError) {
      return createErrorResponse(400, "Invalid JSON in request body", parseError.message);
    }

    const validatedParams = validateEmailParams(body);
    const emailParams = createEmailParams(
      validatedParams,
      process.env.FROM_EMAIL,
      process.env.TO_EMAIL
    );

    const command = new SendEmailCommand(emailParams);
    const result = await sesClient.send(command);

    console.log("Email sent successfully:", result.MessageId);

    return createSuccessResponse(result.MessageId);
  } catch (error) {
    console.error("Error sending email:", error);
    return createErrorResponse(500, "Failed to send email", error.message);
  }
};
