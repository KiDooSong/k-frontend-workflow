import { Pressable, Text } from 'react-native';
import type { ReactNode } from 'react';

type Props = {
  variant: 'primary' | 'secondary';
  size: 'sm' | 'md' | 'lg';
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
};

// 공통 버튼. 화면/feature 에서 Pressable 로 버튼을 새로 만들지 말고 이 컴포넌트를 쓴다.
// loading 중 onPress 중복 방지 등은 여기서 처리한다 (화면에서 재구현 금지).
export function Button({ variant, size, onPress, disabled, children }: Props) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}>
      <Text>{children}</Text>
    </Pressable>
  );
}
