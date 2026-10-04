/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Signed Storage Tickets
 * Issues and records short-lived signed upload and download URLs for volunteer photos.
 * No bucket is connected yet: the URLs point at a placeholder host and are signed with this
 * service's own HMAC, so nothing can be uploaded to or downloaded from them today.
 * Features:
 * - Scoped storage paths: organizations/{organization_id}/uploads/{file_id}/{clean_filename}
 * - Declared MIME type must be JPEG, PNG or WebP (the bytes are never seen here)
 * - Declared size must be at most 10MB
 * - A photo can only be attached to a reach of the caller's own organization
 * - Download URLs only for assets of the caller's own organization
 */

import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { env } from '../config/env.ts';
import { getDb } from '../db/index.ts';
import { HttpError, NotFoundError } from './permissions.ts';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const SIGNED_URL_TTL_MS = 15 * 60 * 1000; // 15 mins

export interface PresignedUploadRequest {
  organizationId: string;
  userId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  reachId?: string;
}

export interface PresignedUploadResponse {
  fileId: string;
  storagePath: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export interface PresignedDownloadResponse {
  downloadUrl: string;
  expiresAt: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Builds a short-lived HMAC-signed URL for a storage path.
 * With a real bucket this becomes the provider's pre-signed URL.
 */
function signUrl(storagePath: string): { url: string; expiresAt: string } {
  const expires = Date.now() + SIGNED_URL_TTL_MS;
  const signature = crypto
    .createHmac('sha256', env.STORAGE_SIGNING_SECRET)
    .update(`${storagePath}:${expires}`)
    .digest('hex');

  return {
    url: `https://storage.naiad.internal/${storagePath}?expires=${expires}&sig=${signature}`,
    expiresAt: new Date(expires).toISOString(),
  };
}

/**
 * Generates direct pre-signed PUT upload URL after validating MIME type, size, and tenant context.
 */
export function createPresignedUploadUrl(
  req: PresignedUploadRequest,
  db: DatabaseSync = getDb()
): PresignedUploadResponse {
  // 1. Validate MIME Type
  if (!ALLOWED_MIME_TYPES.includes(req.mimeType)) {
    throw new HttpError(
      400,
      'VALIDATION_FAILED',
      `Invalid file type '${req.mimeType}'. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
    );
  }

  // 2. Validate Size
  if (req.sizeBytes <= 0 || req.sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new HttpError(
      413,
      'PAYLOAD_TOO_LARGE',
      `File size (${req.sizeBytes} bytes) exceeds maximum allowable limit of ${MAX_FILE_SIZE_BYTES} bytes (10MB)`
    );
  }

  // 3. A photo can only be attached to a reach of the caller's own organization
  if (req.reachId) {
    const reach = db
      .prepare('SELECT 1 FROM reaches WHERE id = ? AND organization_id = ? AND deleted_at IS NULL')
      .get(req.reachId, req.organizationId);
    if (!reach) {
      throw new NotFoundError(`Reach '${req.reachId}' not found within your organization.`);
    }
  }

  const fileId = crypto.randomUUID();
  const cleanFilename = req.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Tenant-scoped storage path
  const storagePath = `organizations/${req.organizationId}/uploads/${fileId}/${cleanFilename}`;
  const { url, expiresAt } = signUrl(storagePath);

  // 4. Register asset metadata in database
  db.prepare(`
    INSERT INTO file_assets (id, organization_id, uploaded_by_user_id, reach_id, storage_path, mime_type, size_bytes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_upload')
  `).run(
    fileId,
    req.organizationId,
    req.userId,
    req.reachId || null,
    storagePath,
    req.mimeType,
    req.sizeBytes
  );

  return {
    fileId,
    storagePath,
    uploadUrl: url,
    headers: {
      'Content-Type': req.mimeType,
      'x-amz-acl': 'private',
    },
    expiresAt,
  };
}

/**
 * Generates an authorized, short-lived download URL.
 * An asset of another organization is reported as not found, so its existence is not revealed.
 */
export function getPresignedDownloadUrl(
  fileId: string,
  requestingOrgId: string,
  db: DatabaseSync = getDb()
): PresignedDownloadResponse {
  const asset = db.prepare(`
    SELECT organization_id, storage_path, mime_type, size_bytes
    FROM file_assets
    WHERE id = ? AND deleted_at IS NULL
  `).get(fileId) as
    | { organization_id: string; storage_path: string; mime_type: string; size_bytes: number }
    | undefined;

  // Multi-tenant security check: strict organization boundary enforcement
  if (!asset || asset.organization_id !== requestingOrgId) {
    throw new NotFoundError(`File asset '${fileId}' not found.`);
  }

  const { url, expiresAt } = signUrl(asset.storage_path);

  return {
    downloadUrl: url,
    expiresAt,
    mimeType: asset.mime_type,
    sizeBytes: asset.size_bytes,
  };
}
