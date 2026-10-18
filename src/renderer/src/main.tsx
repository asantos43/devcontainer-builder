// SPDX-License-Identifier: MPL-2.0
import React from 'react'
import { createRoot } from 'react-dom/client'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker'
import { App } from './App'
import './style.css'
self.MonacoEnvironment = {
  getWorker: (_moduleId: string, label: string) =>
    label === 'json' ? new JsonWorker() : new EditorWorker(),
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
