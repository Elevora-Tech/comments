/** Shapes returned by the Elevora comments backend. */

export interface CommentRecord {
  id: string;
  pagePath: string;
  selector: string | null;
  xPercent: number;
  yPercent: number;
  body: string;
  status: string;
  createdAt: string;
}

export interface ReviewerInfo {
  name: string;
}

export interface AuthExchangeResponse {
  token: string;
  reviewer: ReviewerInfo;
}

export interface ListCommentsResponse {
  comments: CommentRecord[];
}

export interface CreateCommentInput {
  pagePath: string;
  pageUrl: string;
  selector: string | null;
  xPercent: number;
  yPercent: number;
  body: string;
}

export interface CreatedComment {
  id: string;
  createdAt: string;
}

/** Typed error thrown for any non-2xx response. `status` is 0 for network failures. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface RequestInitOptions {
  method?: "GET" | "POST";
  token?: string;
  body?: unknown;
}

/** Tiny JSON fetch wrapper. Throws `ApiError` on any failure. */
export async function apiRequest<T>(
  apiBase: string,
  path: string,
  options: RequestInitOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method: options.method ?? "GET",
      mode: "cors",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Could not reach the feedback service. Check your connection and try again.");
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data: unknown = await response.json();
      if (
        data !== null &&
        typeof data === "object" &&
        typeof (data as Record<string, unknown>).message === "string"
      ) {
        message = (data as { message: string }).message;
      }
    } catch {
      // Non-JSON error body; keep the default message.
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}
