<!--
GENERATED FILE — DO NOT EDIT

Source:  src/components/ui/**
Command: npm run workflow:catalog
업데이트하려면: 원본 컴포넌트를 수정하고 위 명령을 실행

NOTE(MVP-A): catalog-gen.mjs 는 MVP-C 산출물이다. 이 단계에서는 수동 작성을 임시 허용한다.
             아래 항목은 src/components/ui/** 의 실제 props 와 일치해야 한다.
-->

# Component Catalog

## Button
- import: `@/components/ui/Button`
- props: `variant: 'primary' | 'secondary'`, `size: 'sm' | 'md' | 'lg'`, `onPress: () => void`, `disabled?: boolean`

## SkeletonList
- import: `@/components/ui/SkeletonList`
- props: `count?: number`

## EmptyState
- import: `@/components/ui/EmptyState`
- props: `title: string`, `description?: string`, `icon?: string`

## ErrorState
- import: `@/components/ui/ErrorState`
- props: `message: string`, `onRetry: () => void`

## SegmentedTabs
- import: `@/components/ui/SegmentedTabs`
- props: `items: { key: string; label: string }[]`, `value: string`, `onChange: (key: string) => void`
