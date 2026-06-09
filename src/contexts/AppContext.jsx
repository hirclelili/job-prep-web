import React, { createContext, useContext, useState, useEffect } from 'react'
import { getSettings, saveSettings, getExperiences } from '../utils/storage'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [settings, setSettings] = useState(() => getSettings())
  const [experiences, setExperiences] = useState(() => getExperiences())
  const [showSettings, setShowSettings] = useState(false)

  // Refresh experiences from storage (called after save/delete)
  const refreshExperiences = () => setExperiences(getExperiences())

  const updateSettings = (newSettings) => {
    const merged = { ...settings, ...newSettings }
    setSettings(merged)
    saveSettings(merged)
  }

  const isConfigured = !!(settings.provider && settings.apiKey && settings.model)

  return (
    <AppContext.Provider value={{
      settings,
      updateSettings,
      experiences,
      refreshExperiences,
      showSettings,
      setShowSettings,
      isConfigured,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
