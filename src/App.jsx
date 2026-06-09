import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './contexts/AppContext'
import NavBar from './components/NavBar'
import SettingsModal from './components/SettingsModal'
import Home from './pages/Home'
import ImportPage from './pages/ImportPage'
import ExperiencePage from './pages/ExperiencePage'
import BattlePlanPage from './pages/BattlePlanPage'
import LibraryPage from './pages/LibraryPage'
import JobLibraryPage from './pages/JobLibraryPage'
import JobDetailPage from './pages/JobDetailPage'

function AppInner() {
  const { showSettings } = useApp()
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/experience" element={<ExperiencePage />} />
          <Route path="/battle-plan" element={<BattlePlanPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/jobs" element={<JobLibraryPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {showSettings && <SettingsModal />}
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  )
}
