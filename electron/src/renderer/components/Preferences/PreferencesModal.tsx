import { useState } from 'react'
import { X } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'

interface PreferencesModalProps {
  isOpen: boolean
  onClose: () => void
}

export function PreferencesModal({ isOpen, onClose }: PreferencesModalProps) {
  const settings = useSettingsStore()
  const [localSettings, setLocalSettings] = useState(settings)

  if (!isOpen) return null

  const handleSave = () => {
    settings.updateSettings(localSettings)
    onClose()
  }

  const handleCancel = () => {
    setLocalSettings(settings)
    onClose()
  }

  const handleReset = () => {
    settings.resetToDefaults()
    setLocalSettings(useSettingsStore.getState())
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={handleCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#2d2d2d',
          borderRadius: '8px',
          width: '600px',
          maxWidth: '90vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #3e3e3e',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#ffffff' }}>
            Preferences
          </h2>
          <button
            onClick={handleCancel}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              opacity: 0.7,
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.7'
            }}
          >
            <X size={20} color="#d4d4d4" />
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
          }}
        >
          {/* Font Settings */}
          <Section title="Font">
            <FormField label="Font Family">
              <input
                type="text"
                value={localSettings.fontFamily}
                onChange={(e) => setLocalSettings({ ...localSettings, fontFamily: e.target.value })}
                style={inputStyle}
              />
            </FormField>

            <FormField label="Font Size">
              <input
                type="number"
                min="8"
                max="32"
                value={localSettings.fontSize}
                onChange={(e) => setLocalSettings({ ...localSettings, fontSize: Number(e.target.value) })}
                style={inputStyle}
              />
            </FormField>

            <FormField label="Line Height">
              <input
                type="number"
                min="1"
                max="2"
                step="0.1"
                value={localSettings.lineHeight}
                onChange={(e) => setLocalSettings({ ...localSettings, lineHeight: Number(e.target.value) })}
                style={inputStyle}
              />
            </FormField>
          </Section>

          {/* Cursor Settings */}
          <Section title="Cursor">
            <FormField label="Cursor Style">
              <select
                value={localSettings.cursorStyle}
                onChange={(e) => setLocalSettings({ ...localSettings, cursorStyle: e.target.value as any })}
                style={selectStyle}
              >
                <option value="block">Block</option>
                <option value="underline">Underline</option>
                <option value="bar">Bar</option>
              </select>
            </FormField>

            <FormField label="Cursor Blink">
              <input
                type="checkbox"
                checked={localSettings.cursorBlink}
                onChange={(e) => setLocalSettings({ ...localSettings, cursorBlink: e.target.checked })}
                style={{ width: '20px', height: '20px' }}
              />
            </FormField>
          </Section>

          {/* Terminal Settings */}
          <Section title="Terminal">
            <FormField label="Scrollback Lines">
              <input
                type="number"
                min="1000"
                max="100000"
                step="1000"
                value={localSettings.scrollback}
                onChange={(e) => setLocalSettings({ ...localSettings, scrollback: Number(e.target.value) })}
                style={inputStyle}
              />
            </FormField>

            <FormField label="Theme">
              <select
                value={localSettings.theme}
                onChange={(e) => setLocalSettings({ ...localSettings, theme: e.target.value as any })}
                style={selectStyle}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </FormField>
          </Section>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderTop: '1px solid #3e3e3e',
          }}
        >
          <button onClick={handleReset} style={secondaryButtonStyle}>
            Reset to Defaults
          </button>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={handleCancel} style={secondaryButtonStyle}>
              Cancel
            </button>
            <button onClick={handleSave} style={primaryButtonStyle}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface SectionProps {
  title: string
  children: React.ReactNode
}

function Section({ title, children }: SectionProps) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
        {title}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {children}
      </div>
    </div>
  )
}

interface FormFieldProps {
  label: string
  children: React.ReactNode
}

function FormField({ label, children }: FormFieldProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <label style={{ flex: '0 0 140px', fontSize: '13px', color: '#d4d4d4' }}>
        {label}
      </label>
      <div style={{ flex: 1 }}>
        {children}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  fontSize: '13px',
  backgroundColor: '#1e1e1e',
  border: '1px solid #3e3e3e',
  borderRadius: '4px',
  color: '#d4d4d4',
  outline: 'none',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: '13px',
  fontWeight: 500,
  backgroundColor: '#007acc',
  color: '#ffffff',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  transition: 'background-color 0.15s ease',
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: '13px',
  fontWeight: 500,
  backgroundColor: 'transparent',
  color: '#d4d4d4',
  border: '1px solid #3e3e3e',
  borderRadius: '4px',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
}
