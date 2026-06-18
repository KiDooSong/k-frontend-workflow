// GENERATED FILE - DO NOT EDIT
// Operation: listCoupons
// Method: GET
// Path: /coupons
// Domain: coupons
// Hook: useListCouponsQuery
// Client Output: src/api/generated/listCoupons.client.ts
// Hook Output: src/features/coupons/hooks/useListCouponsQuery.ts

export function listCouponsPath(): string {
  return "/coupons";
}

export type ListCouponsClientOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
  init?: RequestInit;
};

export async function listCouponsClient(options: ListCouponsClientOptions = {}): Promise<unknown> {
  const fetcher = options.fetch ?? fetch;
  const url = (options.baseUrl ?? '') + listCouponsPath();
  const response = await fetcher(url, {
    ...(options.init ?? {}),
    method: "GET",
  });
  if (!response.ok) {
    throw new Error("GET /coupons failed with " + response.status);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}
