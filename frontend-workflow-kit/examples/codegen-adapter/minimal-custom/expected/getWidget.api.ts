// GENERATED FILE - DO NOT EDIT
// Operation: getWidget
// Method: GET
// Path: /widgets/{widgetId}
// Domain: widgets
// Hook: useGetWidgetFetch
// Client Output: src/api/_generated/getWidget.api.ts
// Hook Output: src/features/widgets/hooks/useGetWidgetFetch.ts

export type GetWidgetPathParams = {
  widgetId: string | number;
};

function encodePathParam(value: string | number): string {
  return encodeURIComponent(String(value));
}

export function getWidgetPath(pathParams: GetWidgetPathParams): string {
  return "/widgets/" + encodePathParam(pathParams.widgetId);
}

export type GetWidgetClientOptions = {
  pathParams: GetWidgetPathParams;
  baseUrl?: string;
  fetch?: typeof fetch;
  init?: RequestInit;
};

export async function getWidgetClient(options: GetWidgetClientOptions): Promise<unknown> {
  const fetcher = options.fetch ?? fetch;
  const url = (options.baseUrl ?? '') + getWidgetPath(options.pathParams);
  const response = await fetcher(url, {
    ...(options.init ?? {}),
    method: "GET",
  });
  if (!response.ok) {
    throw new Error("GET /widgets/{widgetId} failed with " + response.status);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}
