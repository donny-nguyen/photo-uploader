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
    const { subject, message } = body;
    
    // Get from and to from environment variables
    const fromEmail = process.env.FROM_EMAIL;
    const toEmail = process.env.TO_EMAIL;
    
    if (!fromEmail || !toEmail) {
        throw new Error('FROM_EMAIL and TO_EMAIL environment variables must be configured');
    }
    
    if (!subject || !message) {
        throw new Error('Missing required fields: subject and message are required');
    }
    
    return {
        ...body,
        from: fromEmail,
        to: toEmail
    };
};

// Create SES email parameters
const createEmailParams = (body, fromEmail, toEmail) => {
    const { subject, message } = body;
    
    return {
        Destination: {
            ToAddresses: Array.isArray(toEmail) ? toEmail : [toEmail],
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
        Source: fromEmail,
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
        
        // Validate required fields and get from/to from environment
        const validatedParams = validateEmailParams(body);
        
        // Create email parameters using environment variables
        const emailParams = createEmailParams(
            validatedParams, 
            process.env.FROM_EMAIL, 
            process.env.TO_EMAIL
        );
        
        // Send email
        const result = await ses.sendEmail(emailParams).promise();
        
        console.log('Email sent successfully:', result.MessageId);
        console.log('From:', process.env.FROM_EMAIL);
        console.log('To:', process.env.TO_EMAIL);
        
        return createSuccessResponse(result.MessageId);
        
    } catch (error) {
        console.error('Error sending email:', error);
        
        if (error.message.includes('Missing required fields') || 
            error.message.includes('environment variables must be configured')) {
            return createErrorResponse(400, error.message);
        }
        
        return createErrorResponse(500, 'Failed to send email', error.message);
    }
};