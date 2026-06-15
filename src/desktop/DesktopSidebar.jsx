import { ChevronDown } from "lucide-react";
import { desktopNavigation, getActiveParentKey } from "./desktopNavigation";

function DesktopLogo() {
  return (
    <div className="rl-desktop-brand">
      <div className="rl-desktop-brand-mark">RL</div>
      <div className="rl-desktop-brand-copy">
        <strong>RiverLub</strong>
        <span>Sistema de gestao</span>
      </div>
    </div>
  );
}

export default function DesktopSidebar({ activeKey, onNavigate }) {
  const activeParent = getActiveParentKey(activeKey);

  return (
    <aside className="rl-desktop-sidebar">
      <div className="rl-desktop-sidebar-top">
        <DesktopLogo />
      </div>

      <nav className="rl-desktop-nav" aria-label="Navegacao principal">
        <div className="rl-desktop-nav-section">
          <div className="rl-desktop-nav-label">Sistema</div>

          {desktopNavigation.map((item) => {
            const Icon = item.icon;
            const isActive = activeParent === item.key;
            const hasChildren = Boolean(item.children?.length);

            return (
              <div className="rl-desktop-nav-group" key={item.key}>
                <button
                  className={`rl-desktop-nav-item${isActive ? " active" : ""}`}
                  type="button"
                  onClick={() => onNavigate(hasChildren ? item.children[0].key : item.key)}
                >
                  <span className="rl-desktop-nav-icon">
                    <Icon size={18} />
                  </span>
                  <span className="rl-desktop-nav-copy">
                    <span className="rl-desktop-nav-title">{item.label}</span>
                    <span className="rl-desktop-nav-meta">{item.description}</span>
                  </span>
                  {hasChildren ? (
                    <ChevronDown className={`rl-desktop-nav-chevron${isActive ? " open" : ""}`} size={16} />
                  ) : null}
                </button>

                {hasChildren && isActive ? (
                  <div className="rl-desktop-subnav">
                    {item.children.map((child) => {
                      const ChildIcon = child.icon;

                      return (
                        <button
                          className={`rl-desktop-subnav-item${activeKey === child.key ? " active" : ""}`}
                          type="button"
                          onClick={() => onNavigate(child.key)}
                          key={child.key}
                        >
                          <ChildIcon size={15} />
                          <span>
                            <strong>{child.label}</strong>
                            <small>{child.description}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </nav>

      <div className="rl-desktop-sidebar-support">
        <strong>RiverLub Desktop</strong>
        <span>Operacao local, WhatsApp e sistema nativo no mesmo fluxo.</span>
      </div>

      <div className="rl-desktop-sidebar-footer">
        <strong>Oficina RiverLub</strong>
        <span>Desktop seguro</span>
      </div>
    </aside>
  );
}
