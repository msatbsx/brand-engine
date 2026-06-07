// TEMPORARY POC ACCESS CONTROL
// Replace with proper authentication/SSO before production use.

import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { Cookies, RequestEvent } from '@sveltejs/kit';

const COOKIE_NAME = 'brand_guru_access';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export function isProtectionEnabled(): boolean {
	return !!env.APP_ACCESS_SECRET;
}

function cookieToken(): string {
	return createHash('sha256').update(env.APP_ACCESS_SECRET ?? '').digest('hex');
}

function safeCompare(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

export function validateSecret(candidate: string): boolean {
	const secret = env.APP_ACCESS_SECRET;
	if (!secret) return false;
	return safeCompare(candidate, secret);
}

export function hasValidCookie(cookies: Cookies): boolean {
	const value = cookies.get(COOKIE_NAME);
	if (!value) return false;
	return safeCompare(value, cookieToken());
}

export function setAccessCookie(cookies: Cookies): void {
	cookies.set(COOKIE_NAME, cookieToken(), {
		path: '/',
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax',
		maxAge: COOKIE_MAX_AGE
	});
}

export function clearAccessCookie(cookies: Cookies): void {
	cookies.delete(COOKIE_NAME, { path: '/' });
}

export function requireAccess(event: RequestEvent): void {
	if (isProtectionEnabled() && !hasValidCookie(event.cookies)) {
		error(403, 'Forbidden');
	}
}
