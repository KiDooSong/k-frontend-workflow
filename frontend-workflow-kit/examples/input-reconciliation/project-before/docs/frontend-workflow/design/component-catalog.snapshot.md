> SAMPLE SNAPSHOT — NOT GENERATED
> This file shows the expected shape of generated output for documentation/testing only.
> Do not treat this as a source of truth.

<!--
GENERATED FILE — DO NOT EDIT (shape sample)

Source:  src/components/ui/**
Command: npm run workflow:catalog
업데이트하려면: 원본 컴포넌트를 수정하고 위 명령을 실행

NOTE: 이 fixture 는 md-only 라 실제 catalog-gen 산출물이 없다.
      아래는 생성되었을 때 기대되는 형태를 보여주는 sample snapshot 이다.
      `component_catalog_generated = false` 이므로 readiness fact-ceiling 은 screen-skeleton 이다.
-->

# Component Catalog

## Button
- import: `@/components/ui/Button`
- props: `variant: 'primary' | 'secondary'`, `size: 'sm' | 'md' | 'lg'`, `onPress: () => void`, `disabled?: boolean`, `loading?: boolean`

## TextField
- import: `@/components/ui/TextField`
- props: `value: string`, `onChangeText: (text: string) => void`, `label?: string`, `placeholder?: string`, `secureTextEntry?: boolean`, `error?: string`

## SkeletonList
- import: `@/components/ui/SkeletonList`
- props: `count?: number`

## EmptyState
- import: `@/components/ui/EmptyState`
- props: `title: string`, `description?: string`, `icon?: string`

## ErrorState
- import: `@/components/ui/ErrorState`
- props: `message: string`, `onRetry: () => void`

## Avatar
- import: `@/components/ui/Avatar`
- props: `source?: { uri: string }`, `size?: 'sm' | 'md' | 'lg'`, `fallback?: string`
