// SPDX-License-Identifier: MPL-2.0
// Narrow declarations for the pinned Monaco hover-service lifecycle workaround.
declare module 'monaco-editor/base/browser/ui/hover/hoverDelegateFactory.js' {
  export function setHoverDelegateFactory(
    factory: (placement: string, instant: boolean) => unknown,
  ): void
}
declare module 'monaco-editor/base/browser/ui/hover/hoverDelegate2.js' {
  export function setBaseLayerHoverDelegate(service: unknown): void
}
declare module 'monaco-editor/editor/standalone/browser/standaloneServices.js' {
  export const StandaloneServices: {
    get(id: unknown): { createInstance(constructor: unknown, ...args: unknown[]): unknown }
  }
}
declare module 'monaco-editor/platform/instantiation/common/instantiation.js' {
  export const IInstantiationService: unknown
}
declare module 'monaco-editor/platform/hover/browser/hover.js' {
  export const IHoverService: unknown
  export const WorkbenchHoverDelegate: unknown
}
