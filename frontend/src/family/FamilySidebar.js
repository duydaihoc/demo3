import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Home, 
  ArrowLeftRight, 
  List, 
  Archive,
  BarChart3,
  Users,
  Settings,
  ShoppingCart,
  CheckSquare,
  Network,
  LayoutGrid
} from 'lucide-react';
import './FamilySidebar.css';

export default function FamilySidebar({ active }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    // Load collapsed state from localStorage (separate key for family sidebar)
    const saved = localStorage.getItem('familySidebarCollapsed');
    return saved === 'true';
  });

  // Menu items array với dropdown cho lists
  const items = [
    { id: 'home', label: 'Trang chủ', route: '/family', icon: Home },
    { id: 'transactions', label: 'Giao dịch', route: '/family/transactions', icon: ArrowLeftRight },
    { 
      id: 'lists', 
      label: 'Danh sách', 
      icon: List,
      hasDropdown: true,
      submenu: [
        { id: 'shopping-list', label: 'Danh sách mua sắm', route: '/family/shopping-list', icon: ShoppingCart },
        { id: 'todo-list', label: 'Danh sách việc cần làm', route: '/family/todo-list', icon: CheckSquare }
      ]
    },
    { id: 'archive', label: 'Lưu trữ', route: '/family/archive', icon: Archive },
    { id: 'charts', label: 'Biểu đồ', route: '/family/charts', icon: BarChart3 },
    { id: 'members', label: 'Thành viên', route: '/family/members', icon: Users },
    { id: 'settings', label: 'Cài đặt', route: '/family/settings', icon: Settings },
  ];

  // Xác định tab active dựa trên URL hiện tại
  const getActiveTab = () => {
    const path = location.pathname;
    
    if (path === '/family') return 'home';
    if (path === '/family/transactions') return 'transactions';
    if (path === '/family/lists') return 'lists';
    if (path === '/family/shopping-list') return 'shopping-list';
    if (path === '/family/todo-list') return 'todo-list';
    if (path === '/family/archive') return 'archive';
    if (path === '/family/charts') return 'charts';
    if (path === '/family/members') return 'members';
    if (path === '/family/settings') return 'settings';
    
    return '';
  };

  const activeTab = getActiveTab();

  // Toggle sidebar collapse
  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('familySidebarCollapsed', newState.toString());
    // Update body class to adjust main content margin
    if (newState) {
      document.body.classList.add('family-sidebar-collapsed');
    } else {
      document.body.classList.remove('family-sidebar-collapsed');
    }
  };

  // Apply initial collapsed state to body
  useEffect(() => {
    if (isCollapsed) {
      document.body.classList.add('family-sidebar-collapsed');
    } else {
      document.body.classList.remove('family-sidebar-collapsed');
    }
  }, [isCollapsed]);

  // Auto-open dropdown if submenu is active
  useEffect(() => {
    if (activeTab === 'shopping-list' || activeTab === 'todo-list') {
      setDropdownOpen(true);
    }
  }, [activeTab]);

  // Keep main content height in sync on resize (UI-only)
  useEffect(() => {
    const resizeHandler = () => {
      const main = document.querySelector('.family-main');
      if (!main) return;
      // ensure main is at least viewport height so internal scroll behaves consistently
      main.style.minHeight = '100vh';
    };
    window.addEventListener('resize', resizeHandler);
    // initial run
    resizeHandler();
    return () => window.removeEventListener('resize', resizeHandler);
  }, []);

  const handleNav = (it) => {
    if (it.hasDropdown) {
      setDropdownOpen(!dropdownOpen);
    } else if (it.route) {
      navigate(it.route);
      // UI: after navigation, ensure the content scroll container is at top
      setTimeout(() => {
        const main = document.querySelector('.family-main');
        if (main) {
          try {
            main.scrollTo({ top: 0, behavior: 'smooth' });
          } catch (e) {
            // fallback
            main.scrollTop = 0;
          }
        } else {
          // fallback to window scroll
          try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(e){ window.scrollTo(0,0); }
        }
      }, 60);
    }
  };

  const handleSubmenuNav = (submenuItem) => {
    if (submenuItem.route) {
      navigate(submenuItem.route);
      setTimeout(() => {
        const main = document.querySelector('.family-main');
        if (main) {
          try {
            main.scrollTo({ top: 0, behavior: 'smooth' });
          } catch (e) {
            main.scrollTop = 0;
          }
        } else {
          try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(e){ window.scrollTo(0,0); }
        }
      }, 60);
    }
  };

  return (
    <>
      <button
        className={`family-sidebar-toggle ${isCollapsed ? 'collapsed' : ''}`}
        onClick={toggleSidebar}
        aria-label={isCollapsed ? "Mở sidebar gia đình" : "Đóng sidebar gia đình"}
        title={isCollapsed ? "Mở sidebar gia đình" : "Đóng sidebar gia đình"}
      >
        <span className={`toggle-arrow ${isCollapsed ? 'collapsed' : ''}`}>
          {isCollapsed ? '›' : '‹'}
        </span>
      </button>
      <aside className={`family-sidebar ${isCollapsed ? 'collapsed' : ''}`} aria-label="Sidebar gia đình">
      {/* Add logo component at the top */}
      <div className="sidebar-logo">
        <div className="logo-icon">
          <div className="coin-stack">
            <div className="coin coin-1"></div>
            <div className="coin coin-2"></div>
            <div className="coin coin-3"></div>
          </div>
          <div className="wallet"></div>
        </div>
        <div className="logo-text">
          <span className="text-primary">Quản lý</span>
          <span className="text-secondary">Chi tiêu</span>
        </div>
      </div>
      
      <div className="fs-header1">
        <div className="fs-sub">Quản lý tài chính gia đình</div>
      </div>

      <nav className="fs-nav" role="navigation">
        <ul className="sidebar-menu">
          {items.map(it => {
            const IconComponent = it.icon;
            return (
              <li key={it.id}>
                <button
                  className={`fs-item ${activeTab === it.id || (it.submenu && it.submenu.some(sub => sub.id === activeTab)) ? 'active' : ''}`}
                  onClick={() => handleNav(it)}
                  aria-pressed={activeTab === it.id}
                  aria-label={it.label}
                  title={it.label}
                >
                  <IconComponent className="fs-item-icon" />
                  <span className="fs-label">{it.label}</span>
                  {it.hasDropdown && (
                    <i className={`fas fa-chevron-${dropdownOpen ? 'up' : 'down'} fs-dropdown-icon`} aria-hidden="true"></i>
                  )}
                </button>
                
                {/* Submenu dropdown */}
                {it.hasDropdown && it.submenu && (
                  <ul className={`fs-submenu ${dropdownOpen ? 'open' : ''}`}>
                    {it.submenu.map(subItem => {
                      const SubIconComponent = subItem.icon;
                      return (
                        <li key={subItem.id}>
                          <button
                            className={`fs-submenu-item ${activeTab === subItem.id ? 'active' : ''}`}
                            onClick={() => handleSubmenuNav(subItem)}
                            aria-pressed={activeTab === subItem.id}
                            aria-label={subItem.label}
                            title={subItem.label}
                          >
                            <SubIconComponent className="fs-submenu-icon" />
                            <span className="fs-submenu-label">{subItem.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="fs-footer">
        <button 
          className="fs-group-btn" 
          onClick={() => navigate('/group')}
          title="Chuyển sang Nhóm"
          aria-label="Chuyển sang Nhóm"
        >
          <Network className="fs-btn-icon" />
        </button>
        <button 
          className="fs-back" 
          onClick={() => navigate('/home')}
          title="Về Trang cá nhân"
          aria-label="Về Trang cá nhân"
        >
          <LayoutGrid className="fs-btn-icon" />
        </button>
      </div>
    </aside>
    </>
  );
}
