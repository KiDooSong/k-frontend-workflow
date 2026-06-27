// AsyncState 계약 — View 가 의존하는 유일한 상태 표면.
export interface AsyncState {
  status: 'loading' | 'success' | 'error';
  isRefreshing?: boolean;
}
