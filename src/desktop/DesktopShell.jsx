import DesktopHeader from "./DesktopHeader";
import DesktopSidebar from "./DesktopSidebar";
import { getNavigationItem } from "./desktopNavigation";

export default function DesktopShell({ activeKey, onNavigate, children }) {
  const activeItem = getNavigationItem(activeKey);

  return (
    <div className="rl-desktop-app">
      <DesktopSidebar activeKey={activeKey} onNavigate={onNavigate} />

      <div className="rl-desktop-shell-content">
        <main className="rl-desktop-main">
          <div className="rl-desktop-main-stage">
            <DesktopHeader activeItem={activeItem} />
            <div className="rl-desktop-page-transition-layer">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
