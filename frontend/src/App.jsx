import { Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing.jsx'
import Collective from './pages/Collective.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/c/:collectiveId" element={<Collective />} />
    </Routes>
  )
}
