// SPDX-License-Identifier: MPL-2.0
import React from 'react'
import { createRoot } from 'react-dom/client'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import { App } from './App'
import './style.css'
self.MonacoEnvironment = {
  getWorker: (_moduleId: string, label: string) =>
    label === 'json' ? new JsonWorker() : new EditorWorker(),
}
loader.config({ monaco })
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
