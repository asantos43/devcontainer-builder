// SPDX-License-Identifier: MPL-2.0
import { setHoverDelegateFactory } from 'monaco-editor/base/browser/ui/hover/hoverDelegateFactory.js'
import { setBaseLayerHoverDelegate } from 'monaco-editor/base/browser/ui/hover/hoverDelegate2.js'
import { StandaloneServices } from 'monaco-editor/editor/standalone/browser/standaloneServices.js'
import { IInstantiationService } from 'monaco-editor/platform/instantiation/common/instantiation.js'
import {
  IHoverService,
  WorkbenchHoverDelegate,
} from 'monaco-editor/platform/hover/browser/hover.js'
// Monaco's diff editors replace a global hover factory with a child service that
// is disposed when the diff closes (microsoft/monaco-editor#4612). Bind the factory
// to the application-lifetime standalone service so later editors remain usable.
export function restoreMonacoHoverServices(): void {
  const service = StandaloneServices.get(IInstantiationService)
  setHoverDelegateFactory((placement, instant) =>
    service.createInstance(WorkbenchHoverDelegate, placement, { instantHover: instant }, {}),
  )
  setBaseLayerHoverDelegate(StandaloneServices.get(IHoverService))
}
