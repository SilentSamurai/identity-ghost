import { HttpException, HttpStatus } from '@nestjs/common';

export class OAuthException extends HttpException {
  constructor(
    public readonly errorCode: string,
    public readonly errorDescription: string,
    statusCode: number,
  ) {
    super({ error: errorCode, error_description: errorDescription }, statusCode);
  }

  static invalidRequest(description: string): OAuthException {
    return new OAuthException('invalid_request', description, HttpStatus.BAD_REQUEST);
  }

  static invalidClient(description: string): OAuthException {
    return new OAuthException('invalid_client', description, HttpStatus.UNAUTHORIZED);
  }

  static invalidGrant(description: string): OAuthException {
    return new OAuthException('invalid_grant', description, HttpStatus.BAD_REQUEST);
  }

  static unauthorizedClient(description: string): OAuthException {
    return new OAuthException('unauthorized_client', description, HttpStatus.BAD_REQUEST);
  }

  static unsupportedGrantType(description: string): OAuthException {
    return new OAuthException('unsupported_grant_type', description, HttpStatus.BAD_REQUEST);
  }

  static invalidScope(description: string): OAuthException {
    return new OAuthException('invalid_scope', description, HttpStatus.BAD_REQUEST);
  }

  static invalidToken(description: string): OAuthException {
    return new OAuthException('invalid_token', description, HttpStatus.UNAUTHORIZED);
  }

  static serverError(): OAuthException {
    return new OAuthException('server_error', 'An unexpected error occurred', HttpStatus.BAD_REQUEST);
  }
}
