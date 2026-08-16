import { useState } from 'react'
import type { Settings } from '@shared/types'
import { IconClose } from './icons'

interface SettingsModalProps {
  settings: Settings
  onSave: (settings: Settings) => void
  onClose: () => void
}

export default function SettingsModal({ settings, onSave, onClose }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState(settings.apiKey)
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl)
  const [model, setModel] = useState(settings.model)
  const [temperature, setTemperature] = useState(String(settings.temperature))
  const [maxContextChars, setMaxContextChars] = useState(String(settings.maxContextChars))
  const [showKey, setShowKey] = useState(false)

  const save = () => {
    onSave({
      ...settings,
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim().replace(/\/+$/, ''),
      model: model.trim(),
      temperature: Number(temperature) || 0.7,
      maxContextChars: Number(maxContextChars) || 12000
    })
    onClose()
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="tool-btn icon" onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <div className="modal-body">
          <label className="field">
            <span>API Key</span>
            <div className="key-row">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
                autoFocus
              />
              <button className="btn ghost" onClick={() => setShowKey((v) => !v)}>
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>
          <label className="field">
            <span>Base URL</span>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </label>
          <label className="field">
            <span>Model</span>
            <input value={model} onChange={(e) => setModel(e.target.value)} />
            <p className="hint">
              e.g. <code>deepseek-chat</code> or <code>deepseek-reasoner</code>
            </p>
          </label>
          <label className="field">
            <span>Temperature</span>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Max context characters per page</span>
            <input
              type="number"
              min="500"
              step="500"
              value={maxContextChars}
              onChange={(e) => setMaxContextChars(e.target.value)}
            />
          </label>
          <p className="hint">
            Your key is stored locally on this device and sent only to the configured Base URL.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
