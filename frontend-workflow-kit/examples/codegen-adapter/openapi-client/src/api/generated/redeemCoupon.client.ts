// GENERATED FILE - DO NOT EDIT
// Operation: redeemCoupon
// Method: POST
// Path: /coupons/{couponId}/redeem
// Domain: coupons
// Hook: useRedeemCouponMutation
// Client Output: src/api/generated/redeemCoupon.client.ts
// Hook Output: src/features/coupons/hooks/useRedeemCouponMutation.ts

export type RedeemCouponPathParams = {
  couponId: string | number;
};

function encodePathParam(value: string | number): string {
  return encodeURIComponent(String(value));
}

export function redeemCouponPath(pathParams: RedeemCouponPathParams): string {
  return "/coupons/" + encodePathParam(pathParams.couponId) + "/redeem";
}

export type RedeemCouponClientOptions = {
  pathParams: RedeemCouponPathParams;
  baseUrl?: string;
  fetch?: typeof fetch;
  init?: RequestInit;
};

export async function redeemCouponClient(options: RedeemCouponClientOptions): Promise<unknown> {
  const fetcher = options.fetch ?? fetch;
  const url = (options.baseUrl ?? '') + redeemCouponPath(options.pathParams);
  const response = await fetcher(url, {
    ...(options.init ?? {}),
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("POST /coupons/{couponId}/redeem failed with " + response.status);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}
