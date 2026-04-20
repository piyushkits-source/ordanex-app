import { Outlet } from "react-router-dom";
import TopBar from "./TopBar";


export default function AppLayout() {
  return (
    <div style={appShell}>
      <TopBar />



        <div style={contentArea}>
          <Outlet />
        </div>
      
    </div>
  );
}

const appShell: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f8fafc",
  padding: 16,
};

const bodyLayout: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "280px minmax(0, 1fr)",
  gap: 16,
  marginTop: 16,
  alignItems: "start",
};


const contentArea: React.CSSProperties = {
  minWidth: 0,
};
