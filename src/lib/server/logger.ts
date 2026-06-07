import { Node as Logtail } from '@logtail/js';
import { env } from '$env/dynamic/private';

function createLogger() {
	const token = env.BETTERSTACK_SOURCE_TOKEN;
	if (!token) return null;
	return new Logtail(token);
}

const logtail = createLogger();

export const logger = {
	question(question: string, brand: string, hasImages: boolean) {
		if (!logtail) return;
		logtail.info('user_question', { question, brand, hasImages });
		logtail.flush();
	},

	error(message: string, context: Record<string, unknown> = {}) {
		if (!logtail) return;
		logtail.error(message, context);
		logtail.flush();
	}
};
