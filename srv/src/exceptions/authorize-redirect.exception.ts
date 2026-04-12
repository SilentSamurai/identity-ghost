export class AuthorizeRedirectException extends Error {
  constructor(
    public readonly redirectUri: string,
    public readonly errorCode: string,
    public readonly errorDescription: string,
    public readonly state?: string,
  ) {
    super(errorDescription);
  }
}
