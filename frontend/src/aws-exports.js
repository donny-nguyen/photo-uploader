// src/aws-exports.js
// Replace these values with your actual Cognito configuration
const awsConfig = {
  Auth: {
    region: "YOUR_COGNITO_REGION",
    userPoolId: "YOUR_USER_POOL_ID",
    userPoolWebClientId: "YOUR_USER_POOL_CLIENT_ID",
  },
};

export default awsConfig;
