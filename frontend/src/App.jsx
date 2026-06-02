import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import AdminLayout from "./components/AdminLayout";
import LockScreen from "./components/LockScreen";
import Enrollment from "./components/Enrollment";
import AdminPanel from "./components/AdminPanel";

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<LockScreen />} />
        <Route path="/enroll" element={<Enrollment />} />
      </Route>
      <Route path="/admin/*" element={
        <AdminLayout>
          <AdminPanel />
        </AdminLayout>
      } />
    </Routes>
  );
}

export default App;
