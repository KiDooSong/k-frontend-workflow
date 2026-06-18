// GENERATED FILE - DO NOT EDIT
// Operation: redeemCoupon
// Method: POST
// Path: /coupons/{couponId}/redeem
// Domain: coupons
// Hook: useRedeemCouponMutation
// Client Output: src/api/generated/redeemCoupon.client.ts
// Hook Output: src/features/coupons/hooks/useRedeemCouponMutation.ts

import {
  redeemCouponClient,
  type RedeemCouponClientOptions,
} from "../../../api/generated/redeemCoupon.client";

export type UseRedeemCouponMutationOptions = RedeemCouponClientOptions;

export function useRedeemCouponMutation() {
  return {
    operationId: "redeemCoupon",
    domain: "coupons",
    method: "POST",
    path: "/coupons/{couponId}/redeem",
    clientOut: "src/api/generated/redeemCoupon.client.ts",
    hookOut: "src/features/coupons/hooks/useRedeemCouponMutation.ts",
    mutationKey: ["coupons", "redeemCoupon"] as const,
    mutationFn: (options: UseRedeemCouponMutationOptions) => redeemCouponClient(options),
  } as const;
}
