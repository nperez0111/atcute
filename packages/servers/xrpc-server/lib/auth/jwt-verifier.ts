import { type DidDocumentResolver } from '@atcute/identity-resolver';

export interface ServiceJwtVerifierOptions {
	resolver: DidDocumentResolver;
}

export class ServiceJwtVerifier {
	#resolver: DidDocumentResolver;
}
