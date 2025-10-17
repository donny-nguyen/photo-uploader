import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

const ses = new AWS.SES({ region: process.env.AWS_REGION || 'us-east-1' });

// Email template configurations
const EMAIL_TEMPLATES = {
    WELCOME: {
        subject: 'Welcome to Our Service!',
        html: (data) => `
            <h1>Welcome, ${data.name}!</h1>
            <p>Thank you for joining our service.</p>
            <p>We're excited to have you on board.</p>
        `,
        text: (data) => `Welcome, ${data.name}! Thank you for joining our service.`
    },
    NOTIFICATION: {
        subject: 'Notification from Our Service',
        html: (data) => `
            <h2>Notification</h2>
            <p>${data.message}</p>
        `,
        text: (data) => `Notification: ${data.message}`
    }
};

const getHeaders = () => ({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Amz-Date, Authorization, X-Api-Key, X-Amz-Security-Token',
    'Content-Type': 'application/json'
});

const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const validateEmailParams = (body) => {
    const { to, subject, message, template, templateData } = body;
    
    // If using template, validate template exists
    if (template && !EMAIL_TEMPLATES[template]) {
        throw new Error(`Invalid template: ${template}. Available templates: ${Object.keys(EMAIL_TEMPLATES).join(', ')}`);
    }
    
    // If not using template, validate required fields
    if (!template && (!to || !subject || !message)) {
        throw new Error('Missing required fields: to, subject, and message are required when not using templates');
    }
    
    // Validate email format
    if (to && !validateEmail(Array.isArray(to) ? to[0] : to)) {
        throw new Error('Invalid email address format');
    }
    
    return body;
};

const createEmailParams = (body) => {
    const { to, subject, message, from, template, templateData, replyTo } = body;
    
    let finalSubject = subject;
    let finalMessage = message;
    
    // Use template if specified
    if (template && EMAIL_TEMPLATES[template]) {
        const templateConfig = EMAIL_TEMPLATES[template];
        finalSubject = templateConfig.subject;
        finalMessage = templateConfig.html(templateData || {});
    }
    
    const params = {
        Destination: {
            ToAddresses: Array.isArray(to) ? to : [to],
        },
        Message: {
            Body: {
                Html: {
                    Charset: 'UTF-8',
                    Data: finalMessage,
                },
                Text: {
                    Charset: 'UTF-8',
                    Data: finalMessage.replace(/<[^>]*>/g, ''),
                },
            },
            Subject: {
                Charset: 'UTF-8',
                Data: finalSubject,
            },
        },
        Source: from || process.env.DEFAULT_FROM_EMAIL,
    };
    
    // Add reply-to address if provided
    if (replyTo) {
        params.ReplyToAddresses = Array.isArray(replyTo) ? replyTo : [replyTo];
    }
    
    return params;
};

const handleOptionsRequest = () => ({
    statusCode: 200,
    headers: getHeaders(),
    body: JSON.stringify({ message: 'CORS preflight' })
});

const createSuccessResponse = (messageId) => ({
    statusCode: 200,
    headers: getHeaders(),
    body: JSON.stringify({
        success: true,
        message: 'Email sent successfully',
        messageId,
        timestamp: new Date().toISOString()
    })
});

const createErrorResponse = (statusCode, error, details = null) => ({
    statusCode,
    headers: getHeaders(),
    body: JSON.stringify({
        success: false,
        error,
        ...(details && { details }),
        timestamp: new Date().toISOString()
    })
});

export const handler = async (event) => {
    const requestId = uuidv4();
    console.log(`[${requestId}] Received event:`, JSON.stringify(event, null, 2));
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return handleOptionsRequest();
    }
    
    if (event.httpMethod !== 'POST') {
        return createErrorResponse(405, 'Method not allowed');
    }
    
    try {
        let body;
        try {
            body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        } catch (parseError) {
            return createErrorResponse(400, 'Invalid JSON in request body', parseError.message);
        }
        
        const validatedParams = validateEmailParams(body);
        const emailParams = createEmailParams(validatedParams);
        
        const result = await ses.sendEmail(emailParams).promise();
        
        console.log(`[${requestId}] Email sent successfully:`, result.MessageId);
        
        return createSuccessResponse(result.MessageId);
        
    } catch (error) {
        console.error(`[${requestId}] Error sending email:`, error);
        
        if (error.message.includes('Missing required fields') || 
            error.message.includes('Invalid email address') ||
            error.message.includes('Invalid template')) {
            return createErrorResponse(400, error.message);
        }
        
        return createErrorResponse(500, 'Failed to send email', error.message);
    }
};