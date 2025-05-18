import { safeParse, type XRPCProcedureMetadata, type XRPCQueryMetadata } from '@atcute/lexicons/validations';

import type { Literal, Promisable } from './types/misc.js';
import type { ProcedureConfig, QueryConfig, UnknownOperationContext } from './types/operation.js';

import { constructParamsHandler } from './utils/request-params.js';
import { invalidRequest, validationError } from './utils/response.js';

import { XRPCError } from './xrpc-error.js';

const JSON_TYPE_RE = /^\s*application\/json\s*(?:$|;)/i;

type InternalRequestContext = {
	url: URL;
	request: Request;
};

type InternalRequestHandler = (context: InternalRequestContext) => Promise<Response>;

type InternalRouteData = {
	method: 'GET' | 'POST';
	handler: InternalRequestHandler;
};

export class XRPCRouter {
	#handlers: Record<string, InternalRouteData> = {};

	handleNotFound(request: Request): Promisable<Response>;
	handleNotFound(_request: Request): Promisable<Response> {
		return new Response('Not Found', { status: 404 });
	}

	handleException(error: unknown, request: Request): Promisable<Response>;
	handleException(error: unknown, _request: Request): Promisable<Response> {
		if (error instanceof XRPCError) {
			return error.toResponse();
		}

		if (error instanceof Response) {
			return error;
		}

		return Response.json(
			{ error: 'InternalServerError', message: `an exception happened whilst processing this request` },
			{ status: 500 },
		);
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const pathname = url.pathname;

		if (!pathname.startsWith('/xrpc/')) {
			return this.handleNotFound(request);
		}

		const nsid = pathname.slice('/xrpc/'.length);
		const route = this.#handlers[nsid];

		if (route === undefined) {
			return this.handleNotFound(request);
		}

		if (request.method !== route.method) {
			return Response.json(
				{ error: 'InvalidRequest', message: `invalid http method` },
				{ status: 405, headers: { allow: `${route.method}` } },
			);
		}

		try {
			const response = await route.handler({
				request: request,
				url: url,
			});

			return response;
		} catch (err) {
			return this.handleException(err, request);
		}
	}

	query<TQuery extends XRPCQueryMetadata>(query: TQuery, config: QueryConfig<TQuery>): void {
		const handleParams = query.params ? constructParamsHandler(query.params) : null;

		const handler = config.handler;

		this.#handlers[query.nsid] = {
			method: 'GET',
			handler: async ({ request, url }) => {
				let params: Record<string, Literal | Literal[]>;

				if (handleParams !== null) {
					const result = handleParams(url.searchParams);
					if (!result.ok) {
						return validationError('params', result);
					}

					params = result.value;
				} else {
					params = {};
				}

				const context: UnknownOperationContext = {
					request: request,
					params: params,
				};

				const output = await handler(context as any);

				if (output instanceof Response) {
					return output;
				}

				return new Response(null);
			},
		};
	}

	procedure<TProcedure extends XRPCProcedureMetadata>(
		procedure: TProcedure,
		config: ProcedureConfig<TProcedure>,
	): void {
		const handleParams = procedure.params ? constructParamsHandler(procedure.params) : null;

		const requiresInput = procedure.input !== null;
		const inputSchema = procedure.input?.type === 'lex' ? procedure.input.schema : null;

		const handler = config.handler;

		this.#handlers[procedure.nsid] = {
			method: 'POST',
			handler: async ({ request, url }) => {
				let params: Record<string, Literal | Literal[]>;
				let input: Record<string, unknown> | undefined;

				if (handleParams !== null) {
					const result = handleParams(url.searchParams);
					if (!result.ok) {
						return validationError('params', result);
					}

					params = result.value;
				} else {
					params = {};
				}

				const headers = request.headers;
				if (requiresInput) {
					if (!isBodyPresent(headers)) {
						return invalidRequest(`request body is expected but none was provided`);
					}

					if (inputSchema !== null) {
						{
							const type = headers.get('content-type');
							if (type === null) {
								return invalidRequest(`request encoding not provided`);
							}

							if (!JSON_TYPE_RE.test(type)) {
								return invalidRequest(`invalid request encoding (expected application/json)`);
							}
						}

						let raw: any;
						try {
							raw = await request.json();
						} catch (err) {
							return invalidRequest(`invalid request body (failed to parse json)`);
						}

						const result = safeParse(inputSchema, raw);
						if (!result.ok) {
							return validationError('input', result);
						}

						input = result.value;
					}
				} else {
					if (isBodyPresent(headers)) {
						return invalidRequest(`request body is provided when none was expected`);
					}
				}

				const context: UnknownOperationContext = {
					request: request,
					params: params,
					input: input,
				};

				const output = await handler(context as any);

				if (output instanceof Response) {
					return output;
				}

				return new Response(null);
			},
		};
	}
}

const isBodyPresent = (headers: Headers): boolean => {
	return headers.get('content-length') !== null && headers.get('transfer-encoding') !== null;
};
