import { forwardRef } from 'react';
type Props = { value: string };
// forwardRef 래퍼 → v1 제외 (OD-5).
export const Field = forwardRef<unknown, Props>((props, ref) => {
  return null;
});
