export const GET_TINYFISH_CREDENTIAL_STATUS_CHANNEL =
  "tinyfish:credential-status" as const;
export const SET_TINYFISH_API_KEY_CHANNEL = "tinyfish:set-api-key" as const;

export interface TinyFishCredentialStatus {
  configured: boolean;
}

export interface SetTinyFishApiKeyRequest {
  apiKey: string;
}

export interface SetTinyFishApiKeyResult {
  configured: boolean;
}
