// GENERATED FILE - DO NOT EDIT
// Operation: getCoupon
// Method: GET
// Path: /coupons/{couponId}
// Domain: coupons
// Hook: useGetCouponQuery
// Client Output: src/api/generated/getCoupon.client.ts
// Hook Output: src/features/coupons/hooks/useGetCouponQuery.ts

export type GetCouponPathParams = {
  couponId: string | number;
};

function encodePathParam(value: string | number): string {
  return encodeURIComponent(String(value));
}

export function getCouponPath(pathParams: GetCouponPathParams): string {
  return "/coupons/" + encodePathParam(pathParams.couponId);
}

export type GetCouponClientOptions = {
  pathParams: GetCouponPathParams;
  baseUrl?: string;
  fetch?: typeof fetch;
  init?: RequestInit;
};

export async function getCouponClient(options: GetCouponClientOptions): Promise<unknown> {
  const fetcher = options.fetch ?? fetch;
  const url = (options.baseUrl ?? '') + getCouponPath(options.pathParams);
  const response = await fetcher(url, {
    ...(options.init ?? {}),
    method: "GET",
  });
  if (!response.ok) {
    throw new Error("GET /coupons/{couponId} failed with " + response.status);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}
