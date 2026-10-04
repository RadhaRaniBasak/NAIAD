/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Storage Pre-Signed URL & Tenant Security Tests
 * Verifies:
 * 1. Wrong file type rejected (400)
 * 2. File too large rejected (413)
 * 3. A photo can only be attached to a reach of the uploader's organization
 * 4. Cross-tenant download is reported as not found (404), so the asset's existence is not revealed
 * 5. Legitimate tenant download success
 */

import { assert, caught } from '../../../test/assert.ts';
import { getDb } from '../../db/index.ts';
import { HttpError } from '../permissions.ts';
import { createPresignedUploadUrl, getPresignedDownloadUrl } from '../storage.ts';

console.log('--- RUNNING NAIAD STORAGE & TENANT SECURITY TESTS ---');

// Setup in-memory test database with full schema
const testDb = getDb(':memory:');

// Insert test organizations and users
testDb.exec(`
  INSERT INTO organizations (id, name, slug, primary_city_id) VALUES ('org-coimbra', 'Coimbra Water', 'coi', 'coimbra');
  INSERT INTO organizations (id, name, slug, primary_city_id) VALUES ('org-toulouse', 'Toulouse Water', 'tou', 'toulouse');
  INSERT INTO users (id, organization_id, nickname) VALUES ('usr-coi', 'org-coimbra', 'Sara_Nobre');
  INSERT INTO users (id, organization_id, nickname) VALUES ('usr-tou', 'org-toulouse', 'Luc_Moreau');
  INSERT INTO reaches (id, organization_id, name, city_id, length_meters, topo_index, geometry_json)
  VALUES ('coi:r01', 'org-coimbra', 'Coselhas Reach', 'coimbra', 250, 0, '{}'),
         ('tou:r01', 'org-toulouse', 'Touch Reach', 'toulouse', 250, 0, '{}');
`);

/** True when `fn` is rejected with an HttpError of the given status. */
function rejectedWith(status: number, fn: () => unknown): boolean {
  const err = caught(fn);
  if (!(err instanceof HttpError) || err.statusCode !== status) return false;
  console.log(`• Caught expected ${status}: ${err.message}`);
  return true;
}

// ----------------------------------------------------------------------------
// TEST 1: Wrong file type rejected (400 Bad Request)
// ----------------------------------------------------------------------------
assert(
  rejectedWith(400, () =>
    createPresignedUploadUrl(
      {
        organizationId: 'org-coimbra',
        userId: 'usr-coi',
        filename: 'exploit.sh',
        mimeType: 'application/x-sh',
        sizeBytes: 2048,
      },
      testDb
    )
  ),
  'Wrong MIME type was rejected with HTTP 400'
);

// ----------------------------------------------------------------------------
// TEST 2: File too large rejected (413 Payload Too Large)
// ----------------------------------------------------------------------------
assert(
  rejectedWith(413, () =>
    createPresignedUploadUrl(
      {
        organizationId: 'org-coimbra',
        userId: 'usr-coi',
        filename: 'giant_stream_video.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 15 * 1024 * 1024, // 15MB (> 10MB limit)
      },
      testDb
    )
  ),
  'Oversized file (15MB) was rejected with HTTP 413'
);

// ----------------------------------------------------------------------------
// TEST 3: Legitimate pre-signed upload URL generation
// ----------------------------------------------------------------------------
const photo = {
  organizationId: 'org-coimbra',
  userId: 'usr-coi',
  filename: 'river_clarity.webp',
  mimeType: 'image/webp',
  sizeBytes: 245000, // 245 KB
};
const uploadResult = createPresignedUploadUrl({ ...photo, reachId: 'coi:r01' }, testDb);

assert(
  rejectedWith(404, () => createPresignedUploadUrl({ ...photo, reachId: 'tou:r01' }, testDb)),
  "A photo cannot be attached to another organization's reach (404)"
);
assert(
  rejectedWith(404, () => createPresignedUploadUrl({ ...photo, reachId: 'coi:nope' }, testDb)),
  'A photo cannot be attached to a reach that does not exist (404)'
);

assert(uploadResult.fileId.length > 0, 'Generated valid file UUID');
assert(
  uploadResult.storagePath.startsWith('organizations/org-coimbra/uploads/'),
  'Storage path is correctly scoped by organization ID'
);
assert(uploadResult.uploadUrl.includes('sig='), 'Upload URL contains HMAC signature');
console.log(`• Created upload URL for asset ${uploadResult.fileId} at ${uploadResult.storagePath}`);

// ----------------------------------------------------------------------------
// TEST 4: Cross-tenant download attempt reported as not found (404)
// ----------------------------------------------------------------------------
// User from org-toulouse attempts to download photo belonging to org-coimbra
const crossTenant = caught(() => getPresignedDownloadUrl(uploadResult.fileId, 'org-toulouse', testDb));
assert(
  crossTenant instanceof HttpError && crossTenant.statusCode === 404 && !crossTenant.message.includes('org-coimbra'),
  'Cross-tenant download is a 404 that does not name the owning organization'
);

// ----------------------------------------------------------------------------
// TEST 5: Legitimate tenant download succeeded (200 OK)
// ----------------------------------------------------------------------------
const downloadResult = getPresignedDownloadUrl(uploadResult.fileId, 'org-coimbra', testDb);
assert(downloadResult.downloadUrl.includes('sig='), 'Authorized download URL contains signed token');
assert(downloadResult.mimeType === 'image/webp', 'Authorized download returns correct metadata');
console.log(`• Legitimate download URL generated successfully: ${downloadResult.downloadUrl}`);

console.log('✅ ALL STORAGE & SECURITY TESTS PASSED SUCCESSFULLY!\n');
