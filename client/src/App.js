import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CreateThesis from './pages/CreateThesis';
import ThesisDetail from './pages/ThesisDetail';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/create" element={<CreateThesis />} />
        <Route path="/thesis/:id" element={<ThesisDetail />} />
      </Routes>
    </Router>
  );
}

export default App;