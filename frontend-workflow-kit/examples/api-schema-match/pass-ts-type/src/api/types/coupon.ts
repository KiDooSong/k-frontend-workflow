export interface CouponDto {
  id: string;
  title: string;
}

export type CouponListResponse = {
  items: CouponDto[];
};