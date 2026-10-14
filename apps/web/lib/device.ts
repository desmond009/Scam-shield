const KEY = "ss_device_id";

/** Stable per-browser device id, sent as X-Device-Id (the server stores only a hash). */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

/** Demo-login buttons use the demo account's registered (simulated) phone so payments come from a known device. */
export function setDeviceId(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* storage unavailable: the server falls back to the user agent */
  }
}
