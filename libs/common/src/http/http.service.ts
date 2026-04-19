import { Injectable } from '@nestjs/common';
import { catchError, defer, from, Observable, throwError } from 'rxjs';

export interface HttpError extends Error {
  status: number;
  body: unknown;
  handled: boolean;
}

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  timeoutMs?: number;
}

@Injectable()
export class HttpService {
  private readonly defaultHeaders: Record<string, string> = {};

  get<T>(url: string, options: HttpRequestOptions = {}): Observable<T> {
    return this.request<T>('GET', url, undefined, options);
  }

  post<T>(
    url: string,
    body: unknown,
    options: HttpRequestOptions = {},
  ): Observable<T> {
    return this.request<T>('POST', url, body, options);
  }

  patch<T>(
    url: string,
    body: unknown,
    options: HttpRequestOptions = {},
  ): Observable<T> {
    return this.request<T>('PATCH', url, body, options);
  }

  delete<T>(url: string, options: HttpRequestOptions = {}): Observable<T> {
    return this.request<T>('DELETE', url, undefined, options);
  }

  addDefaultHeader(key: string, value: string): void {
    this.defaultHeaders[key] = value;
  }

  removeDefaultHeader(key: string): void {
    delete this.defaultHeaders[key];
  }

  private request<T>(
    method: string,
    url: string,
    body: unknown,
    options: HttpRequestOptions,
  ): Observable<T> {
    const finalUrl = options.params
      ? this.appendQuery(url, options.params)
      : url;

    const init: RequestInit = {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...this.defaultHeaders,
        ...(options.headers ?? {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };

    return defer(() => from(this.execute<T>(finalUrl, init, options))).pipe(
      catchError((error) => throwError(() => this.normalizeError(error))),
    );
  }

  private async execute<T>(
    url: string,
    init: RequestInit,
    options: HttpRequestOptions,
  ): Promise<T> {
    const controller =
      options.timeoutMs !== undefined ? new AbortController() : undefined;
    const timeout = controller
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : undefined;

    if (controller) {
      init.signal = controller.signal;
    }

    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        const body = await this.safeParseBody(response);
        throw this.buildError(response.status, response.statusText, body);
      }
      if (response.status === 204) {
        return undefined as T;
      }
      return (await response.json()) as T;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async safeParseBody(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  private appendQuery(url: string, params: Record<string, unknown>): string {
    const serialized = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
      )
      .join('&');

    if (!serialized) return url;
    return url.includes('?') ? `${url}&${serialized}` : `${url}?${serialized}`;
  }

  private buildError(
    status: number,
    message: string,
    body: unknown = null,
  ): HttpError {
    const error = new Error(message) as HttpError;
    error.status = status;
    error.body = body;
    error.handled = false;
    return error;
  }

  private normalizeError(error: unknown): HttpError {
    if (this.isHttpError(error)) {
      return error;
    }
    const err = new Error(
      error instanceof Error ? error.message : String(error),
    ) as HttpError;
    err.status = 0;
    err.body = null;
    err.handled = false;
    return err;
  }

  private isHttpError(error: unknown): error is HttpError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      'handled' in error
    );
  }
}
