import { supabase } from './supabase';

export type Bucket = 'product-images' | 'receipts' | 'signatures' | 'outage-sheets' | 'preauth-pdfs';

// Uploads go straight from the browser to Storage, never through a function.
export async function uploadFile(bucket: Bucket, folder: string, file: Blob, ext?: string): Promise<string> {
  const extension = ext ?? (file.type.split('/')[1] || 'bin').replace('jpeg', 'jpg');
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

// Private files are shown through short-lived signed URLs.
export async function signedUrl(bucket: Bucket, path: string, seconds = 300): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
  if (error || !data) throw new Error(error?.message ?? 'Could not open the file.');
  return data.signedUrl;
}

export function productImageUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
}

// Product images from our own Storage load with CORS, so the service worker
// gets a readable response it can keep for offline use (an opaque one is never
// cached). Images from anywhere else load as before.
export function imageCrossOrigin(url: string | null): 'anonymous' | undefined {
  return url && url.includes('/storage/v1/object/public/product-images/') ? 'anonymous' : undefined;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',');
  const type = /data:([^;]+)/.exec(meta)?.[1] ?? 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
