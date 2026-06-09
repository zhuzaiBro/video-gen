import COS from "cos-nodejs-sdk-v5";
import { ENV } from "./_core/env";

let _cosClient: COS | null = null;

/**
 * Initialize COS client with credentials from environment
 */
function getCosClient(): COS {
  if (!_cosClient) {
    if (!ENV.tencentCosSecretId || !ENV.tencentCosSecretKey) {
      throw new Error("Tencent COS credentials not configured");
    }

    _cosClient = new COS({
      SecretId: ENV.tencentCosSecretId,
      SecretKey: ENV.tencentCosSecretKey,
    });
  }

  return _cosClient;
}

/**
 * Generate COS object key for a file
 */
function generateKey(prefix: string, filename: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}/${timestamp}-${random}-${filename}`;
}

/**
 * Upload file to COS and return key and URL
 */
export async function uploadFileToCos(
  file: Buffer,
  filename: string,
  prefix: "personas" | "generated-videos" | "temp" = "temp",
  contentType: string = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const cos = getCosClient();
  const key = generateKey(prefix, filename);

  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: ENV.tencentCosBucket,
        Region: ENV.tencentCosRegion,
        Key: key,
        Body: file,
        ContentType: contentType,
      },
      (err: any, data: any) => {
        if (err) {
          console.error("[COS] Upload failed:", err);
          reject(err);
        } else {
          // Generate accessible URL
          const url = ENV.tencentCosCdnUrl
            ? `${ENV.tencentCosCdnUrl}/${key}`
            : `https://${ENV.tencentCosBucket}.cos.${ENV.tencentCosRegion}.myqcloud.com/${key}`;

          resolve({ key, url });
        }
      }
    );
  });
}

/**
 * Get signed URL for downloading file from COS
 */
export async function getSignedUrlFromCos(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const cos = getCosClient();

  return new Promise((resolve, reject) => {
    const url = cos.getObjectUrl(
      {
        Bucket: ENV.tencentCosBucket,
        Region: ENV.tencentCosRegion,
        Key: key,
        Sign: true,
        Expires: expiresIn,
      },
      (err: any, data: any) => {
        if (err) {
          console.error("[COS] Get signed URL failed:", err);
          reject(err);
        } else {
          resolve(data.Url);
        }
      }
    );
  });
}

/**
 * Download file from COS
 */
export async function downloadFileFromCos(key: string): Promise<Buffer> {
  const cos = getCosClient();

  return new Promise((resolve, reject) => {
    cos.getObject(
      {
        Bucket: ENV.tencentCosBucket,
        Region: ENV.tencentCosRegion,
        Key: key,
      },
      (err: any, data: any) => {
        if (err) {
          console.error("[COS] Download failed:", err);
          reject(err);
        } else {
          resolve(data.Body as Buffer);
        }
      }
    );
  });
}

/**
 * Delete file from COS
 */
export async function deleteFileFromCos(key: string): Promise<void> {
  const cos = getCosClient();

  return new Promise((resolve, reject) => {
    cos.deleteObject(
      {
        Bucket: ENV.tencentCosBucket,
        Region: ENV.tencentCosRegion,
        Key: key,
      },
      (err: any) => {
        if (err) {
          console.error("[COS] Delete failed:", err);
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Upload reference image for persona
 */
export async function uploadReferenceImage(
  personaId: number,
  file: Buffer,
  filename: string
): Promise<{ key: string; url: string }> {
  const key = `personas/${personaId}/${Date.now()}-${filename}`;

  return new Promise((resolve, reject) => {
    const cos = getCosClient();
    cos.putObject(
      {
        Bucket: ENV.tencentCosBucket,
        Region: ENV.tencentCosRegion,
        Key: key,
        Body: file,
        ContentType: "image/jpeg",
      },
      (err: any) => {
        if (err) {
          reject(err);
        } else {
          const url = ENV.tencentCosCdnUrl
            ? `${ENV.tencentCosCdnUrl}/${key}`
            : `https://${ENV.tencentCosBucket}.cos.${ENV.tencentCosRegion}.myqcloud.com/${key}`;
          resolve({ key, url });
        }
      }
    );
  });
}

/**
 * Upload generated video
 */
export async function uploadGeneratedVideo(
  taskId: number,
  videoBuffer: Buffer,
  filename: string = "video.mp4"
): Promise<{ key: string; url: string }> {
  const key = `generated-videos/${taskId}/${filename}`;

  return new Promise((resolve, reject) => {
    const cos = getCosClient();
    cos.putObject(
      {
        Bucket: ENV.tencentCosBucket,
        Region: ENV.tencentCosRegion,
        Key: key,
        Body: videoBuffer,
        ContentType: "video/mp4",
      },
      (err: any) => {
        if (err) {
          reject(err);
        } else {
          const url = ENV.tencentCosCdnUrl
            ? `${ENV.tencentCosCdnUrl}/${key}`
            : `https://${ENV.tencentCosBucket}.cos.${ENV.tencentCosRegion}.myqcloud.com/${key}`;
          resolve({ key, url });
        }
      }
    );
  });
}
