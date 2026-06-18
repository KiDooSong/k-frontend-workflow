// GENERATED FILE - DO NOT EDIT
// Operation: listCoupons
// Method: GET
// Path: /coupons
// Domain: coupons
// Hook: useListCouponsQuery
// Client Output: src/api/generated/listCoupons.client.ts
// Hook Output: src/features/coupons/hooks/useListCouponsQuery.ts

import {
  listCouponsClient,
  type ListCouponsClientOptions,
} from "../../../api/generated/listCoupons.client";

export type UseListCouponsQueryOptions = ListCouponsClientOptions;

export function useListCouponsQuery(options: UseListCouponsQueryOptions = {}) {
  return {
    operationId: "listCoupons",
    domain: "coupons",
    method: "GET",
    path: "/coupons",
    clientOut: "src/api/generated/listCoupons.client.ts",
    hookOut: "src/features/coupons/hooks/useListCouponsQuery.ts",
    queryKey: ["coupons", "listCoupons"] as const,
    queryFn: () => listCouponsClient(options),
  } as const;
}
