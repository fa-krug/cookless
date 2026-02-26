/**
 * Thin fetch wrapper for the Django Ninja API.
 *
 * - Sends cookies (`credentials: "include"`) for session auth
 * - Attaches the CSRF token from the `csrftoken` cookie on mutating requests
 * - Base URL configurable via VITE_API_BASE_URL env var, defaults to "" for Vite proxy
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function getCsrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`API error ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers: extraHeaders, ...rest } = options;
  const isFormData = body instanceof FormData;

  const headers: Record<string, string> = {
    ...(extraHeaders as Record<string, string>),
  };

  if (body !== undefined && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  const method = (rest.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    headers["X-CSRFToken"] = getCsrfToken();
  }

  const response = await fetch(`${BASE_URL}${url}`, {
    credentials: "include",
    ...rest,
    headers,
    body: isFormData ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }
    throw new ApiError(response.status, errorBody);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  get<T>(url: string, options?: RequestOptions) {
    return request<T>(url, { ...options, method: "GET" });
  },

  post<T>(url: string, body?: unknown, options?: RequestOptions) {
    return request<T>(url, { ...options, method: "POST", body });
  },

  put<T>(url: string, body?: unknown, options?: RequestOptions) {
    return request<T>(url, { ...options, method: "PUT", body });
  },

  patch<T>(url: string, body?: unknown, options?: RequestOptions) {
    return request<T>(url, { ...options, method: "PATCH", body });
  },

  delete<T = void>(url: string, body?: unknown, options?: RequestOptions) {
    return request<T>(url, { ...options, method: "DELETE", body });
  },

  uploadFile<T>(url: string, file: File, fieldName = "image") {
    const formData = new FormData();
    formData.append(fieldName, file);
    return request<T>(url, { method: "POST", body: formData as unknown });
  },
};
