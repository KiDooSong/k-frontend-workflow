import { Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';

type Props = { message: string; onRetry: () => void };

export function ErrorState({ message, onRetry }: Props) {
  return (
    <View>
      <Text>{message}</Text>
      <Button variant="secondary" size="md" onPress={onRetry}>
        다시 시도
      </Button>
    </View>
  );
}
