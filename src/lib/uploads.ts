/**
 * Client-safe upload-path validation, shared by the APIs that accept a
 * client-supplied photo path and the components that render one.
 *
 * Paths must point inside /uploads/ — they are later rendered in <img src>
 * and <a href>, so reject anything else (external URLs, javascript: URIs)
 * and any '..' segment that would let the path escape /uploads/ once the
 * browser normalizes it.
 */
export function isUploadPath(path: unknown): path is string {
	return (
		typeof path === 'string' &&
		/^\/uploads\/[A-Za-z0-9._\-/]+$/.test(path) &&
		!path.includes('..')
	);
}
