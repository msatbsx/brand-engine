// TEMPORARY POC ACCESS CONTROL
// Replace with proper authentication/SSO before production use.

import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import {
	isProtectionEnabled,
	validateSecret,
	hasValidCookie,
	setAccessCookie,
	clearAccessCookie
} from '$lib/server/access.js';

const UNPROTECTED_PATHS = new Set(['/access-denied']);

function isStaticAsset(pathname: string): boolean {
	return (
		pathname.startsWith('/_app/') ||
		pathname.startsWith('/favicon') ||
		/\.(svg|png|jpg|jpeg|gif|webp|ico|woff2?)$/.test(pathname)
	);
}

export const handle: Handle = async ({ event, resolve }) => {
	if (!isProtectionEnabled()) {
		return resolve(event);
	}

	const { pathname } = event.url;

	if (UNPROTECTED_PATHS.has(pathname) || isStaticAsset(pathname)) {
		return resolve(event);
	}

	const secret = event.url.searchParams.get('secret');
	if (secret !== null) {
		if (validateSecret(secret)) {
			setAccessCookie(event.cookies);
			const cleanUrl = new URL(event.url);
			cleanUrl.searchParams.delete('secret');
			throw redirect(302, cleanUrl.toString());
		} else {
			clearAccessCookie(event.cookies);
			throw redirect(302, '/access-denied');
		}
	}

	if (!hasValidCookie(event.cookies)) {
		if (pathname.startsWith('/api/')) {
			return new Response(JSON.stringify({ error: 'Forbidden' }), {
				status: 403,
				headers: { 'content-type': 'application/json' }
			});
		}
		throw redirect(302, '/access-denied');
	}

	return resolve(event);
};
