import { memo } from 'react';
type Props = { count: number };
function BadgeImpl(props: Props) {
  return null;
}
// memo 래퍼 → v1 제외 (OD-5).
export const Badge = memo(BadgeImpl);
