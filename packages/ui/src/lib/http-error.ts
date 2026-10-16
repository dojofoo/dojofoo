/** Read an unsuccessful response once. Servers and proxies need not return JSON. */
export async function httpError(response: Response): Promise<Error> {
  const text = (await response.text()).trim();
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === "object") {
      if ("error" in body && typeof body.error === "string") return new Error(body.error);
      if ("message" in body && typeof body.message === "string") return new Error(body.message);
    }
  } catch { /* A plain-text error from a proxy is valid error evidence. */ }
  return new Error(text || `Request failed (${response.status}).`);
}
