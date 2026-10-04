# ADR 0003: Client-Side EXIF and Metadata Stripping

## Context
Volunteers take stream photos on personal mobile phones. Photos typically include Exchangeable Image File Format (EXIF) metadata containing exact GPS home coordinates, timestamp, camera serial number, and phone model. Storing raw metadata creates severe privacy violations under GDPR and risks leaking volunteer home addresses.

## Decision
All photos submitted via Naiad are rendered onto an off-screen HTML5 `<canvas>` element on the volunteer's phone, scaled to a maximum bounding dimension of $1200\times 900\,\text{px}$, and re-encoded into clean WebP/JPEG format. This client-side rendering completely purges all EXIF, GPS, and device header tags before the image payload is transmitted over the network. The backend server performs a secondary buffer validation.

## Alternatives Considered
- **Server-Side EXIF Stripping Only (via sharp/exiftool)**: Rejected as the sole measure because the raw photo with sensitive GPS coordinates would still traverse public mobile cellular networks and land on the backend server.
- **No Photo Uploads**: Rejected because water visual appearance (foam, sewage scum, algal blooms) requires visual ground-truth for coordinator validation and municipal handoffs.

## Consequences
- **Positive:** Volunteers' personal GPS coordinates never leave their device; payload size is reduced by $\sim 85\%$ (from $4\,\text{MB}$ to $\sim 150\,\text{KB}$), enabling swift uploads over weak cellular connections.
- **Negative:** Older low-end mobile devices take $200–500\,\text{ms}$ of CPU time to downsample and re-encode the canvas image.

## Implementation Status
**Not implemented.** The check-in dialog uses sample photos and shows the removal step without performing it: there is no camera capture, no canvas re-encoding and no upload. On the server, the storage API issues signed upload and download tickets for image types up to 10 MB, but no bucket receives files and nothing inspects image bytes. The decision stands for when camera capture is built.
