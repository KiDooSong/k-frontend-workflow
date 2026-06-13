// 화면이 의존하는 유일한 데이터 계약.
// TanStack Query 객체를 화면에 그대로 노출하지 않는다 (fake/real 구현 교체 시 shape 안정).
// 참고: frontend-llm-workflow.md §6
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export type AsyncState<TData, TError = Error> = {
  data: TData | undefined;
  status: AsyncStatus;
  isLoading: boolean;
  isRefreshing: boolean;
  isError: boolean;
  error: TError | null;
  refetch: () => Promise<unknown>;
};

// TanStack Query 결과를 AsyncState 로 변환하는 어댑터 (real 구현에서 사용).
// MVP-A 골든 예제는 fake 구현만 포함하므로 참조 구현으로만 둔다.
export function toAsyncState<TData>(query: {
  data: TData | undefined;
  isLoading: boolean;
  isRefetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
  isSuccess: boolean;
}): AsyncState<TData> {
  const isEmpty =
    query.isSuccess && Array.isArray(query.data) && query.data.length === 0;
  let status: AsyncStatus = 'idle';
  if (query.isLoading) status = 'loading';
  else if (query.isError) status = 'error';
  else if (isEmpty) status = 'empty';
  else if (query.isSuccess) status = 'success';

  return {
    data: query.data,
    status,
    isLoading: query.isLoading,
    isRefreshing: query.isRefetching,
    isError: query.isError,
    error: (query.error as Error) ?? null,
    refetch: query.refetch,
  };
}
