/**
 * Download links for the standalone desktop label-printing app (yakima-label).
 * Binaries are built by the yakima-label repo's GitHub Actions workflow and
 * placed in uploads/yakima-label/ (served by nginx at /uploads, no auth).
 * Bump VERSION + filenames together when publishing a new build — the uploads
 * location is cached immutable for 30 days, so names must be versioned.
 */
export const DESKTOP_LABEL_APP_VERSION = '0.1.0';

export const DESKTOP_LABEL_APP_DOWNLOADS = {
	windows: {
		label: 'Windows (.exe)',
		url: `/uploads/yakima-label/yakima-label-${DESKTOP_LABEL_APP_VERSION}.exe`,
		notes: 'Windows 10/11, 64-bit. Uses your installed Zebra/ZDesigner printer driver.'
	},
	linux: {
		label: 'Linux (x86_64)',
		url: `/uploads/yakima-label/yakima-label-${DESKTOP_LABEL_APP_VERSION}-linux-x86_64`,
		notes: 'Prints over USB directly (libusb). Mark executable after download: chmod +x'
	}
} as const;
