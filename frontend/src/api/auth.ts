import client from "./client";

export interface User {
  id: number;
  username: string;
  email: string;
  is_admin?: boolean;
  created_at?: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface ApiKeyResponse {
  api_key: string;
}

export const authApi = {
  register: (data: { username: string; email: string; password: string }) =>
    client.post<User>("/auth/register", data),

  login: (data: { username: string; password: string }) =>
    client.post<Token>("/auth/login", data),

  me: () => client.get<User>("/auth/me"),

  getApiKey: () => client.get<ApiKeyResponse>("/auth/api-key"),
  regenerateApiKey: () => client.post<ApiKeyResponse>("/auth/api-key/regenerate"),
};
