import type { ProblemDetails } from "../types/api";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const AUTH_TOKEN_KEY = "rpa_auth_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

export class ApiError extends Error {
  public problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail || problem.title || "API Error");
    this.name = "ApiError";
    this.problem = problem;
  }
}

let csrfPromise: Promise<void> | null = null;

export async function getCsrfCookie(): Promise<void> {
  if (typeof window === "undefined") return;

  if (!csrfPromise) {
    csrfPromise = fetch(`${API_BASE_URL}/sanctum/csrf-cookie`, {
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    })
      .then(() => {})
      .catch((err) => {
        console.warn("Error al obtener cookie CSRF:", err);
      })
      .finally(() => {
        csrfPromise = null;
      });
  }

  return csrfPromise;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^|;\\s*)(${name})=([^;]*)`));
  return match ? decodeURIComponent(match[3]) : null;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;

  // Si es una acción mutante (POST, PUT, DELETE, PATCH) y no tenemos cookie CSRF, obtenerla primero
  if (typeof window !== "undefined" && method !== "GET" && method !== "HEAD") {
    let token = getCookie("XSRF-TOKEN");
    if (!token) {
      await getCsrfCookie();
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const xsrfToken = getCookie("XSRF-TOKEN");
  if (xsrfToken) {
    headers["X-XSRF-TOKEN"] = xsrfToken;
  }

  const authToken = getStoredToken();
  if (authToken && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  let response = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  // Si falló por 419 (CSRF Token Mismatch), refrescar cookie y reintentar una vez
  if (response.status === 419 && typeof window !== "undefined") {
    await getCsrfCookie();
    const refreshedToken = getCookie("XSRF-TOKEN");
    if (refreshedToken) {
      headers["X-XSRF-TOKEN"] = refreshedToken;
    }
    response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });
  }

  // Si falló por 401 en una ruta protegida
  if (response.status === 401 && typeof window !== "undefined") {
    setStoredToken(null);
    window.dispatchEvent(new Event("rpa:unauthorized"));
  }

  if (!response.ok) {
    let problem: ProblemDetails;
    try {
      problem = await response.json();
    } catch {
      problem = {
        type: "about:blank",
        title: response.statusText || "Request Failed",
        status: response.status,
      };
    }
    throw new ApiError(problem);
  }

  if (response.status === 204) {
    return null as unknown as T;
  }

  return response.json();
}
