import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from './lib/DataContext'
import Layout from './components/Layout'
import Home from './pages/Home'
import Leaderboard from './pages/Leaderboard'
import { RaceDetail, Races } from './pages/Races'
import { DriverProfile, Drivers } from './pages/Drivers'
import Track from './pages/Track'
import Gallery from './pages/Gallery'
import Admin from './pages/Admin'

export default function App() {
  return (
    <DataProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="leaderboard" element={<Leaderboard />} />
            <Route path="races" element={<Races />} />
            <Route path="races/:id" element={<RaceDetail />} />
            <Route path="track" element={<Track />} />
            <Route path="drivers" element={<Drivers />} />
            <Route path="drivers/:id" element={<DriverProfile />} />
            <Route path="gallery" element={<Gallery />} />
            <Route path="admin" element={<Admin />} />
            <Route path="*" element={<p className="muted">Page not found.</p>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DataProvider>
  )
}
