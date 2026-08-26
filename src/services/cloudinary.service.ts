import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export async function uploadImageToCloudinary(
  fileData: string,
  folder: string = 'mako_avatars'
): Promise<string> {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary credentials are not configured in environment variables.');
  }

  const timestamp = Math.floor(Date.now() / 1000);

  // Sorted parameters for signature calculation
  const paramsToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(paramsToSign).digest('hex');

  const formData = new FormData();
  formData.append('file', fileData);
  formData.append('api_key', apiKey);
  formData.append('timestamp', timestamp.toString());
  formData.append('signature', signature);
  formData.append('folder', folder);

  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });

  const data: any = await response.json();

  if (!response.ok || data.error) {
    logger.error('Cloudinary Upload Error:', data.error);
    throw new Error(data.error?.message || 'Failed to upload image to Cloudinary');
  }

  return data.secure_url || data.url;
}
