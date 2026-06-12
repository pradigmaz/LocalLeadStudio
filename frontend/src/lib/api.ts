type ApiErrorBody = {
  error?: string;
  detail?: unknown;
};

export const LOCAL_ACTION_HEADERS = { "X-LocalLead-Confirm": "1" };
export const JSON_ACTION_HEADERS = { "Content-Type": "application/json", ...LOCAL_ACTION_HEADERS };

const formatDetail = (detail: unknown): string | null => {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        return String(item);
      })
      .filter(Boolean)
      .join("; ");
  }
  return null;
};

export const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Ошибка сети/подключения";

export const getApiErrorMessage = (body: ApiErrorBody, fallback: string) =>
  body.error || formatDetail(body.detail) || fallback || "Неизвестная ошибка";

export const readJson = async <T,>(response: Response): Promise<T> => {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(getApiErrorMessage(data as ApiErrorBody, `HTTP ${response.status}`));
  }
  return data as T;
};
