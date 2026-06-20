// GENERATED FILE - DO NOT EDIT
// Operation: getWidget
// Method: GET
// Path: /widgets/{widgetId}
// Domain: widgets
// Hook: useGetWidgetFetch
// Client Output: src/api/_generated/getWidget.api.ts
// Hook Output: src/features/widgets/hooks/useGetWidgetFetch.ts

import {
  getWidgetClient,
  type GetWidgetClientOptions,
} from "../../../api/_generated/getWidget.api";

export type UseGetWidgetFetchOptions = GetWidgetClientOptions;

export function useGetWidgetFetch(options: UseGetWidgetFetchOptions) {
  return {
    operationId: "getWidget",
    domain: "widgets",
    method: "GET",
    path: "/widgets/{widgetId}",
    clientOut: "src/api/_generated/getWidget.api.ts",
    hookOut: "src/features/widgets/hooks/useGetWidgetFetch.ts",
    queryKey: ["widgets", "getWidget", String(options.pathParams.widgetId)] as const,
    queryFn: () => getWidgetClient(options),
  } as const;
}
