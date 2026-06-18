// GENERATED FILE - DO NOT EDIT
// Operation: getCoupon
// Method: GET
// Path: /coupons/{couponId}
// Domain: coupons
// Hook: useGetCouponQuery
// Client Output: src/api/generated/getCoupon.client.ts
// Hook Output: src/features/coupons/hooks/useGetCouponQuery.ts

import {
  getCouponClient,
  type GetCouponClientOptions,
} from "../../../api/generated/getCoupon.client";

export type UseGetCouponQueryOptions = GetCouponClientOptions;

export function useGetCouponQuery(options: UseGetCouponQueryOptions) {
  return {
    operationId: "getCoupon",
    domain: "coupons",
    method: "GET",
    path: "/coupons/{couponId}",
    clientOut: "src/api/generated/getCoupon.client.ts",
    hookOut: "src/features/coupons/hooks/useGetCouponQuery.ts",
    queryKey: ["coupons", "getCoupon", options.pathParams.couponId] as const,
    queryFn: () => getCouponClient(options),
  } as const;
}
