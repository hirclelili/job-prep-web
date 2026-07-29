import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './contexts/AppContext'
import { AgentProvider } from './contexts/AgentContext'
import NavBar from './components/NavBar'
import SettingsModal from './components/SettingsModal'
import AgentPanel from './components/AgentPanel'

const Home = lazy(() => import('./pages/Home'))
const ImportPage = lazy(() => import('./pages/ImportPage'))
const ExperiencePage = lazy(() => import('./pages/ExperiencePage'))
const LibraryPage = lazy(() => import('./pages/LibraryPage'))
const ExperienceDetailPage = lazy(() => import('./pages/ExperienceDetailPage'))
const DirectionPage = lazy(() => import('./pages/DirectionPage'))
const ResumePage = lazy(() => import('./pages/ResumePage'))
const JobLibraryPage = lazy(() => import('./pages/JobLibraryPage'))
const JobDetailPage = lazy(() => import('./pages/JobDetailPage'))
const BattlePlanPage = lazy(() => import('./pages/BattlePlanPage'))
const InterviewPrepPage = lazy(() => import('./pages/InterviewPrepPage'))

function PageFallback() {
  return (
    <div className="prep-bg flex min-h-[calc(100vh-64px)] items-center justify-center px-4">
      <div className="prep-panel px-6 py-5 text-center">
        <p className="text-sm font-black text-[#171321]">正在打开页面...</p>
      </div>
    </div>
  )
}

function AppInner() {
  const { showSettings } = useApp()
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      <main className="min-w-0 flex-1">
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/experience" element={<ExperiencePage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/library/:id" element={<ExperienceDetailPage />} />
            <Route path="/directions" element={<DirectionPage />} />
            <Route path="/resumes" element={<ResumePage />} />
            <Route path="/jobs" element={<JobLibraryPage />} />
            <Route path="/jobs/:id" element={<JobDetailPage />} />
            <Route path="/jobs/:id/prepare" element={<BattlePlanPage />} />
            <Route path="/interviews" element={<InterviewPrepPage />} />
            <Route path="/battle-plan" element={<Navigate to="/interviews" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      {showSettings && <SettingsModal />}
      <AgentPanel />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AgentProvider>
        <AppInner />
      </AgentProvider>
    </AppProvider>
  )
}
