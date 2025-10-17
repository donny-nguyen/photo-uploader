const AWS = require('aws-sdk');

// Initialize SES client
const ses = new AWS.SES({ region: process.env.AWS_REGION || 'us-east-1' });

exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    // Set CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Amz-Date, Authorization, X-Api-Key, X-Amz-Security-Token',
        'Content-Type': 'application/json'
    };
    
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({ message: 'CORS preflight' })
        };
    }
    
    try {
        // Parse request body
        let body;
        try {
            body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        } catch (parseError) {
            return {
                statusCode: 400,
                headers: headers,
                body: JSON.stringify({ 
                    error: 'Invalid JSON in request body',
                    details: parseError.message 
                })
            };
        }
        
        // Validate required fields
        const { to, subject, message, from } = body;
        
        if (!to || !subject || !message) {
            return {
                statusCode: 400,
                headers: headers,
                body: JSON.stringify({ 
                    error: 'Missing required fields: to, subject, and message are required' 
                })
            };
        }
        
        // Email parameters
        const params = {
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
        
        // Send email
        const result = await ses.sendEmail(params).promise();
        
        console.log('Email sent successfully:', result.MessageId);
        
        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({
                message: 'Email sent successfully',
                messageId: result.MessageId
            })
        };
        
    } catch (error) {
        console.error('Error sending email:', error);
        
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({
                error: 'Failed to send email',
                details: error.message
            })
        };
    }
};