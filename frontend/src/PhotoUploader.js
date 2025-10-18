import { useState } from 'react';
import { Upload, CheckCircle, AlertCircle, Loader2, Image } from 'lucide-react';
import packageJson from '../package.json'; // Import as default export

export default function PhotoUploader() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState(null);
  const [uploadedUrl, setUploadedUrl] = useState(null);

  // API endpoints
  const PRESIGN_API = 'https://0yr7gwy1qb.execute-api.us-east-1.amazonaws.com/prod/presign-url';
  const EMAIL_API = 'https://htj2s7obhl.execute-api.us-east-1.amazonaws.com/prod/emails';

  // Handle file selection
  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (!selectedFile.type.startsWith('image/')) {
        setStatus({ type: 'error', message: 'Please select an image file' });
        return;
      }
      setFile(selectedFile);
      setStatus(null);
      setUploadedUrl(null);

      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  // Get presigned URL from backend
  const getPresignedUrl = async (key, operation, description = null) => {
    const payload = { key, operation };
    if (description !== null && operation === 'put_object') {
      payload.description = description;
    }

    const response = await fetch(PRESIGN_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to get presigned URL: ${response.statusText}`);
    }

    const data = await response.json();
    return data.url;
  };

  // Upload image to S3
  const uploadToS3 = async (presignedUrl, file) => {
    const response = await fetch(presignedUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    });

    if (!response.ok) {
      throw new Error(`Failed to upload file: ${response.statusText}`);
    }

    return response;
  };

  // 🔔 Send email notification
  const sendEmailNotification = async (imageUrl, description) => {
    const subject = 'New Image Uploaded';
    const message = `
      <h3>A new image has been uploaded!</h3>
      <p><strong>Description:</strong> ${description || 'No description provided'}</p>
      <p><strong>View Image:</strong> <a href="${imageUrl}" target="_blank">${imageUrl}</a></p>
    `;

    const response = await fetch(EMAIL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, message }),
    });

    if (!response.ok) {
      throw new Error(`Email notification failed: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Email sent:', data);
  };

  // Handle upload button
  const handleUpload = async () => {
    if (!file) {
      setStatus({ type: 'error', message: 'Please select a file first' });
      return;
    }

    setUploading(true);
    setStatus(null);

    try {
      const isoDateTime = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const key = `${isoDateTime}_${sanitizedFileName}`;

      setStatus({ type: 'info', message: 'Getting presigned URL...' });
      const presignedUrl = await getPresignedUrl(key, 'put_object', description);

      setStatus({ type: 'info', message: 'Uploading file...' });
      await uploadToS3(presignedUrl, file);

      const viewUrl = await getPresignedUrl(key, 'get_object');
      setUploadedUrl(viewUrl);

      // ✅ Send email after successful upload
      setStatus({ type: 'info', message: 'Sending email notification...' });
      await sendEmailNotification(viewUrl, description);

      setStatus({
        type: 'success',
        message: 'File uploaded and email notification sent successfully!',
      });

      setFile(null);
      setPreview(null);
      setDescription('');
    } catch (error) {
      console.error('Upload error:', error);
      setStatus({
        type: 'error',
        message: `Operation failed: ${error.message}`,
      });
    } finally {
      setUploading(false);
    }
  };

  // --- JSX layout (unchanged) ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-4">
              <Image className="w-8 h-8 text-indigo-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Photo Uploader</h1>
            <p className="text-gray-600">Upload your images to AWS S3 with descriptions</p>
          </div>

          {/* File Upload UI */}
          <div className="mb-6">
            <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-all">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-12 h-12 text-gray-400 mb-3" />
                <p className="mb-2 text-sm text-gray-600">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
              </div>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleFileSelect}
                disabled={uploading}
              />
            </label>
          </div>

          {preview && (
            <div className="mb-6">
              <div className="relative rounded-lg overflow-hidden border-2 border-gray-200">
                <img src={preview} alt="Preview" className="w-full h-64 object-cover" />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                  <p className="text-white text-sm font-medium truncate">{file?.name}</p>
                  <p className="text-white/80 text-xs">{(file?.size / 1024).toFixed(2)} KB</p>
                </div>
              </div>
            </div>
          )}

          {file && (
            <div className="mb-6">
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Image Description
              </label>
              <textarea
                id="description"
                rows="3"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter a description for your image..."
                disabled={uploading}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              <p className="mt-1 text-xs text-gray-500">Optional: Add details about this image</p>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Upload Photo
              </>
            )}
          </button>

          {/* Status message */}
          {status && (
            <div
              className={`mt-6 p-4 rounded-lg flex items-start gap-3 ${
                status.type === 'success'
                  ? 'bg-green-50 border border-green-200'
                  : status.type === 'error'
                  ? 'bg-red-50 border border-red-200'
                  : 'bg-blue-50 border border-blue-200'
              }`}
            >
              {status.type === 'success' && (
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              )}
              {status.type === 'error' && (
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              {status.type === 'info' && (
                <Loader2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5 animate-spin" />
              )}
              <div className="flex-1">
                <p
                  className={`text-sm font-medium ${
                    status.type === 'success'
                      ? 'text-green-800'
                      : status.type === 'error'
                      ? 'text-red-800'
                      : 'text-blue-800'
                  }`}
                >
                  {status.message}
                </p>
              </div>
            </div>
          )}

          {uploadedUrl && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Uploaded Image</h3>
              <div className="rounded-lg overflow-hidden border-2 border-green-200">
                <img src={uploadedUrl} alt="Uploaded" className="w-full h-64 object-cover" />
              </div>
              {description && (
                <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-sm font-medium text-gray-700 mb-1">Description:</p>
                  <p className="text-sm text-gray-600">{description}</p>
                </div>
              )}
            </div>
          )}

          <div className="mt-8 text-center text-gray-500 text-sm">
            <p>Version: {packageJson.version}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
