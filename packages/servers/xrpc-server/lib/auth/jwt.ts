import * as v from '@badrap/valita';

import { isDid, isNsid } from '@atcute/lexicons/syntax';

import type { AuthError, Result } from '../types/misc.js';

const didString = v.string().assert(isDid, `must be a did`);
const nsidString = v.string().assert(isNsid, `must be an nsid`);

const integer = v.number().assert((input) => input >= 0 && Number.isSafeInteger(input), `must be an integer`);

const INVALID_TYPES = ['at+jwt', 'refresh+jwt', 'dpop+jwt'];

const jwtHeader = v.object({
	typ: v
		.string()
		.assert((typ) => !INVALID_TYPES.includes(typ), `invalid jwt type`)
		.optional(),
	alg: v.string(),
});

export interface JwtHeader extends v.Infer<typeof jwtHeader> {}

const jwtPayload = v
	.object({
		iss: didString,
		aud: didString,
		exp: integer,
		iat: integer.optional(),
		lxm: nsidString.optional(),
		jti: v.string().optional(),
	})
	.assert(({ iat, exp }) => iat === undefined || exp > iat, {
		message: `expiry time must be greater than issued time`,
		path: ['exp'],
	});

export interface JwtPayload extends v.Infer<typeof jwtPayload> {}

export interface ParsedJwt {
	header: JwtHeader;
	payload: JwtPayload;
}

export const parseJwt = (jwtString: string): Result<ParsedJwt, AuthError> => {
	const parts = jwtString.split('.');
	if (parts.length !== 3) {
		return { ok: false, error: { error: `MalformedJwt`, description: `jwt token is malformed` } };
	}
};
