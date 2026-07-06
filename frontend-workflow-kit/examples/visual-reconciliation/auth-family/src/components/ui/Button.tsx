// 픽스처 컴포넌트 — visual-consistency 검사 입력용 (컴파일 대상 아님).
export function Button(props: { children?: unknown }) {
  return <button type="button">{props.children}</button>;
}
