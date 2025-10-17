import AWS from 'aws-sdk';

// Initialize SES client
const ses = new AWS.SES({ region: process.env.AWS_REGION || 'us-east-1' });

// Set CORS headers
const getHeaders = () => ({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Amz-Date, Authorization, X-Api-Key, X-Amz-Security-Token',
    'Content-Type': 'application/json'
});

// Validate email parameters
const validateEmailParams = (body) => {
    const { to, subject, message } = body;
    
    if (!to || !subject || !message) {
        throw new Error('Missing required fields: to, subject, and message are required');
    }
    
    return body;
};

// Create SES email parameters
const createEmailParams = (body) => {
    const { to, subject, message, from } = body;
    
    return {
        Destination: {
            ToAddresses: Array.isArray(to) ? to : [to],
        },
        Message: {
            Body: {
                Html: {
                    Charset: 'UTF-8',
                    Data: message,
                },
                Text: {
                    Charset: 'UTF-8',
                    Data: message.replace(/<[^>]*>/g, ''), // Strip HTML tags for text version
                },
            },
            Subject: {
                Charset: 'UTF-8',
                Data: subject,
            },
        },
        Source: from || process.env.DEFAULT_FROM_EMAIL,
    };
};

// Handle preflight OPTIONS request
const handleOptionsRequest = () => ({
    statusCode: 200,
    headers: getHeaders(),
    body: JSON.stringify({ message: 'CORS preflight' })
});

// Handle successful response
const createSuccessResponse = (messageId) => ({
    statusCode: 200,
    headers: getHeaders(),
    body: JSON.stringify({
        message: 'Email sent successfully',
        messageId
    })
});

// Handle error response
const createErrorResponse = (statusCode, error, details = null) => ({
    statusCode,
    headers: getHeaders(),
    body: JSON.stringify({
        error,
        ...(details && { details })
    })
});

// Main Lambda handler
export const handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return handleOptionsRequest();
    }
    
    try {
        // Parse request body
        let body;
        try {
            body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        } catch (parseError) {
            return createErrorResponse(400, 'Invalid JSON in request body', parseError.message);
        }
        
        // Validate required fields
        const validatedParams = validateEmailParams(body);
        
        // Create email parameters
        const emailParams = createEmailParams(validatedParams);
        
        // Send email
        const result = await ses.sendEmail(emailParams).promise();
        
        console.log('Email sent successfully:', result.MessageId);
        
        return createSuccessResponse(result.MessageId);
        
    } catch (error) {
        console.error('Error sending email:', error);
        
        if (error.message.includes('Missing required fields')) {
            return createErrorResponse(400, error.message);
        }
        
        return createErrorResponse(500, 'Failed to send email', error.message);
    }
};