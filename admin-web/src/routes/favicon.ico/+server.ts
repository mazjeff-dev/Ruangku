import favicon from '#lib/assets/favicon.svg';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	if (favicon.startsWith('data:image/svg+xml,')) {
		return new Response(decodeURIComponent(favicon.slice(favicon.indexOf(',') + 1)), {
			headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' }
		});
	};

	return Response.redirect(new URL(favicon, url), 308);
}
