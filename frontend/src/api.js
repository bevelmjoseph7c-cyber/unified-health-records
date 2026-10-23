export const API_URL = "http://localhost:8000";

// Calls the backend and returns the raw Response. Throws an Error with a readable message on failure.
export async function api(path, { method = "GET", body, token, isForm = false } = {}) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body && !isForm) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") message = data.detail;
      else if (Array.isArray(data.detail)) message = data.detail.map((d) => d.msg).join("; ");
    } catch {
      // response had no JSON body; keep the default message
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return res;
}

// Same as api() but parses the JSON body.
export async function apiJson(path, options) {
  const res = await api(path, options);
  return res.json();
}

// The PDF endpoint needs the Authorization header, so we fetch it ourselves
// and turn it into a temporary URL the browser can display.
export async function fetchPdfBlobUrl(recordId, token) {
  const res = await api(`/records/${recordId}/document`, { token });
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}