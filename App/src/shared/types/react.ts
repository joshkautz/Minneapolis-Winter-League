/**
 * React-specific utility types
 *
 * Enhanced TypeScript utilities for React components, hooks, and patterns
 */

import React, { ComponentType, ReactNode } from 'react'

// Enhanced component prop types
export interface StrictComponentProps {
	children?: ReactNode
	className?: string
	id?: string
	'data-testid'?: string
}

// Forward ref component types
export type ForwardRefComponent<T, P = {}> = React.ForwardRefExoticComponent<
	React.PropsWithoutRef<P> & React.RefAttributes<T>
>

// Event handler types
export type EventHandler<T = Element> = (event: React.SyntheticEvent<T>) => void
export type ClickHandler<T = Element> = (event: React.MouseEvent<T>) => void
export type ChangeHandler<T = Element> = (event: React.ChangeEvent<T>) => void
export type SubmitHandler<T = Element> = (event: React.FormEvent<T>) => void
export type KeyboardHandler<T = Element> = (
	event: React.KeyboardEvent<T>
) => void
export type FocusHandler<T = Element> = (event: React.FocusEvent<T>) => void

// Async event handlers
export type AsyncEventHandler<T = Element> = (
	event: React.SyntheticEvent<T>
) => Promise<void>
export type AsyncClickHandler<T = Element> = (
	event: React.MouseEvent<T>
) => Promise<void>
export type AsyncSubmitHandler<T = Element> = (
	event: React.FormEvent<T>
) => Promise<void>

// Component state types
export type ComponentState<T> = {
	[K in keyof T]: T[K]
}

export type SetState<T> = React.Dispatch<React.SetStateAction<T>>

// Ref types
export type ComponentRef<T extends ComponentType<any>> = React.ComponentRef<T>

// Higher-order component types
export type HOC<P = {}, InjectedProps = {}> = <C extends ComponentType<any>>(
	component: C
) => ComponentType<Omit<React.ComponentProps<C>, keyof InjectedProps> & P>

// Render prop types
export type RenderProp<T = {}> = (props: T) => ReactNode
export type ChildrenRenderProp<T = {}> = {
	children: RenderProp<T>
}

// Component with render props
export type ComponentWithRenderProps<T = {}> = React.FC<ChildrenRenderProp<T>>

// Strict props that require specific properties
export type RequiredProps<T, K extends keyof T> = T & Required<Pick<T, K>>

// Optional props that make specific properties optional
export type OptionalProps<T, K extends keyof T> = Omit<T, K> &
	Partial<Pick<T, K>>

// Extract props from component type
export type ExtractProps<T> = T extends ComponentType<infer P> ? P : never

// Conditional props based on a discriminated union
export type ConditionalProps<T, K extends keyof T, V extends T[K]> = T extends {
	[P in K]: V
}
	? T
	: never

// Props with controlled/uncontrolled variants
export type ControlledProps<T> = T & {
	value: T[keyof T]
	onChange: (value: T[keyof T]) => void
}

export type UncontrolledProps<T> = T & {
	defaultValue?: T[keyof T]
	onChange?: (value: T[keyof T]) => void
}

export type ControllableProps<T> = ControlledProps<T> | UncontrolledProps<T>

// Compound component types
export type CompoundComponent<T, SubComponents> = React.FC<T> & SubComponents

// Theme-aware component props
export interface ThemeProps {
	theme?: 'light' | 'dark' | 'system'
}

// Responsive prop types
export type ResponsiveProp<T> = T | { xs?: T; sm?: T; md?: T; lg?: T; xl?: T }

// Variant-based props
export type VariantProps<T extends Record<string, any>> = {
	[K in keyof T]?: keyof T[K] | boolean
}

// Merge props utility type
export type MergeProps<T, U> = Omit<T, keyof U> & U

// Component display name utility
export type WithDisplayName<T> = T & {
	displayName?: string
}

// Memoized component type
export type MemoizedComponent<T> = React.MemoExoticComponent<React.FC<T>>

// Lazy component type
export type LazyComponent<T> = React.LazyExoticComponent<React.FC<T>>
