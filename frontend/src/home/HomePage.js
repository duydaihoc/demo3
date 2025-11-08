import React, { useState, useRef, useEffect } from 'react';
import { TourProvider, useTour } from '@reactour/tour';
import { steps } from './tourConfig';
import Sidebar from './Sidebar';
import Wallets from './Wallets';
import './HomePage.css';
import FinanceDashboard from './FinanceDashboard';
import SavingsGoals from './SavingsGoals';
import AiAssistant from './AiAssistant';
import { useNavigate } from 'react-router-dom';

// Custom next/previous button component for the tour
const TourNavigation = (props) => {
  const { currentStep, steps, setCurrentStep, setIsOpen } = props;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;
  
  const goToStep = (step) => {
    setCurrentStep(step);
  };
  
  const onClose = () => {
    setIsOpen(false);
  };

  return (
    <div style={{ 
      marginTop: '20px',
      display: 'flex',
      justifyContent: 'space-between',
      width: '100%',
      padding: '0 10px'
    }}>
      <button 
        onClick={onClose}
        style={{
          padding: '8px 16px',
          border: 'none',
          background: '#f0f0f0',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Bỏ qua
      </button>
      <div>
        {!isFirstStep && (
          <button 
            onClick={() => goToStep(currentStep - 1)}
            style={{
              marginRight: '10px',
              padding: '8px 16px',
              border: 'none',
              background: '#e0e0e0',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Trước
          </button>
        )}
        <button 
          onClick={() => isLastStep ? onClose() : goToStep(currentStep + 1)}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: '#4ecdc4',
            color: 'white',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {isLastStep ? 'Hoàn thành' : 'Tiếp theo'}
        </button>
      </div>
    </div>
  );
};

const HomePageContent = () => {
  const userName = localStorage.getItem('userName') || 'Tên người dùng';
  const navigate = useNavigate();
  const { setIsOpen, setCurrentStep } = useTour();
  const [showWelcome, setShowWelcome] = useState(false);
  const walletRef = useRef(null);
  const goalsRef = useRef(null);
  const aiRef = useRef(null);
  const statsRef = useRef(null);

  // Check if this is the first visit - CHỈ cho user mới
  useEffect(() => {
    const isNewUser = localStorage.getItem('isNewUser') === 'true';
    const hasSeenTour = localStorage.getItem('hasSeenTour') === 'true';
    const justRegistered = localStorage.getItem('justRegistered') === 'true';
    
    // Hiển thị tour nếu:
    // 1. User mới đăng ký (justRegistered)
    // 2. Hoặc là user mới (isNewUser) VÀ chưa xem tour (hasSeenTour = false)
    if (justRegistered || (isNewUser && !hasSeenTour)) {
      setShowWelcome(true);
      // Xóa flag justRegistered sau khi đã hiển thị
      localStorage.removeItem('justRegistered');
    }
  }, []);

  const startTour = () => {
    setShowWelcome(false);
    // Use a small timeout to ensure the tour has time to initialize
    setTimeout(() => {
      setIsOpen(true);
    }, 100);
  };
  
  // Function to show help button and trigger tour
  const showHelp = () => {
    setIsOpen(true);
  };

  const skipTour = async () => {
    setShowWelcome(false);
    // THÊM: Đánh dấu đã xem tour trên server
    await markTourAsSeen();
  };

  // THÊM: Function để đánh dấu đã xem tour
  const markTourAsSeen = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('http://localhost:5000/api/auth/mark-tour-seen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        // Cập nhật localStorage
        localStorage.setItem('hasSeenTour', 'true');
        localStorage.setItem('isNewUser', 'false');
        console.log('✅ Tour marked as seen');
      }
    } catch (error) {
      console.error('Error marking tour as seen:', error);
    }
  };

  return (
    <div className="home-container">
      <Sidebar userName={userName} />
      {showWelcome && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '12px',
            maxWidth: '500px',
            textAlign: 'center'
          }}>
            <h2>Chào mừng bạn đến với ứng dụng Quản lý tài chính!</h2>
            <p>Bạn có muốn xem hướng dẫn sử dụng không?</p>
            <div style={{ marginTop: '20px' }}>
              <button 
                onClick={startTour}
                style={{
                  padding: '10px 20px',
                  margin: '0 10px',
                  border: 'none',
                  background: '#4ecdc4',
                  color: 'white',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Có, hướng dẫn tôi
              </button>
              <button 
                onClick={skipTour}
                style={{
                  padding: '10px 20px',
                  margin: '0 10px',
                  border: '1px solid #ddd',
                  background: 'white',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Bỏ qua
              </button>
            </div>
          </div>
        </div>
      )}
      <main className="home-main">
        <div className="home-header">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="home-title">Trang chủ</span>
            <button
              onClick={showHelp}
              className="home-help-btn"
              title="Bấm để xem hướng dẫn sử dụng"
            >
              <i className="fas fa-question-circle"></i>
              Hướng dẫn
            </button>
          </div>
          <div className="home-actions">
            <button onClick={() => navigate('/transactions')}>+ Ghi chép</button>
            <button onClick={() => navigate('/switch')} style={{ marginLeft: 8 }}>
              <i className="fas fa-layer-group"></i> Nhóm/Gia đình
            </button>
          </div>
        </div>
        <div className="home-content">
          <section className="home-left">
            {/* FinanceDashboard renders the composition + daily stats table now */}
            <FinanceDashboard />
          </section>
          <aside className="home-right">
            {/* Đưa Wallets sang bên phải */}
            <Wallets />
            
            {/* Đưa SavingsGoals xuống dưới Wallets */}
            <SavingsGoals />
            
            <div className="home-reminder">
              <div className="home-reminder-title">Ghi chú / Nhắc nhở</div>
              <ul className="home-reminder-list">
                <li>💡 Quản lý nhiều ví để tách rõ loại chi tiêu.</li>
                <li>🎯 Đặt mục tiêu tiết kiệm cho từng ví.</li>
                <li>📝 Cập nhật danh mục cho chính xác hơn.</li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
      <AiAssistant />
    </div>
  );
}

function HomePage() {
  // THÊM: Function để đánh dấu đã xem tour
  const markTourAsSeen = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('http://localhost:5000/api/auth/mark-tour-seen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        localStorage.setItem('hasSeenTour', 'true');
        localStorage.setItem('isNewUser', 'false');
        console.log('✅ Tour marked as seen');
      }
    } catch (error) {
      console.error('Error marking tour as seen:', error);
    }
  };

  return (
    <TourProvider
      steps={steps}
      scrollSmooth={true}
      resizeObserving={true}          // THÊM: theo dõi resize
      onOpen={() => document.body.classList.add('tour-open')}
      onClose={() => document.body.classList.remove('tour-open')}
      onCurrentStepChange={(step) => {
        const stepDef = steps[step];
        if (stepDef?.selector === '.fd-root') {
          const target = document.querySelector('.fd-root');
          const scroller = document.querySelector('.home-main');
          if (target && scroller) {
            const top = target.offsetTop - 40;
            scroller.scrollTo({ top, behavior: 'smooth' });
          }
        }
      }}
      disableInteraction={false}
      disableDotsNavigation={false}
      disableKeyboardNavigation={false}
      showNavigation={true}
      showBadge={false}
      showCloseButton={true}
      onClickClose={({ setIsOpen }) => {
        markTourAsSeen();
        setIsOpen(false);
      }}
      styles={{
        popover: (base) => ({
          ...base,
          padding: 0,
          border: 'none',
          background: 'linear-gradient(135deg,#4ecdc4 0%,#2a5298 100%)',
          borderRadius: 20,
          boxShadow: '0 10px 28px -4px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }),
        dot: (base, { current }) => ({
          ...base,
          width: 12,
          height: 12,
          // margin removed so CSS gap + margin works
          backgroundColor: current ? '#4ecdc4' : '#d5dbe3',
          border: current ? '2px solid #2a5298' : '2px solid #ffffff',
          boxSizing: 'border-box',
        }),
        badge: () => ({
          display: 'none'
        }),
        maskArea: (base) => ({
          ...base,
          rx: 14,
          stroke: 'rgba(78,205,196,0.55)',
          strokeWidth: 4,
          transition: 'all .5s cubic-bezier(.4,.14,.25,1)'
        }),
        highlightedArea: (base) => ({
          ...base,
          stroke: 'url(#tour-gradient-stroke)',
          strokeWidth: 4,
          filter: 'drop-shadow(0 0 12px rgba(78,205,196,0.55))',
          transition: 'all .55s cubic-bezier(.4,.14,.25,1)',
        }),
        controls: (base) => ({
          ...base,
          marginTop: '20px'
        }),
        button: (base) => ({
          ...base,
          padding: '8px 16px',
          border: 'none',
          background: '#4ecdc4',
          color: 'white',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: '500',
          fontSize: '14px',
          transition: 'all 0.2s'
        })
      }}
      padding={10}
      position="center"
      prevButton={({ currentStep, setCurrentStep, steps }) => {
        const isFirstStep = currentStep === 0;
        return isFirstStep ? null : (
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            style={{
              padding: '8px 16px',
              marginRight: '10px',
              border: 'none',
              background: '#e0e0e0',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            ← Trước
          </button>
        );
      }}
      nextButton={({ currentStep, setCurrentStep, steps, setIsOpen }) => {
        const isLastStep = currentStep === steps.length - 1;
        return (
          <button
            onClick={() => {
              if (isLastStep) {
                markTourAsSeen();
                setIsOpen(false);
              } else {
                setCurrentStep(Math.min(steps.length - 1, currentStep + 1));
              }
            }}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: '#4ecdc4',
              color: 'white',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            {isLastStep ? 'Hoàn thành ✓' : 'Tiếp theo →'}
          </button>
        );
      }}
    >
      <HomePageContent />
    </TourProvider>
  );
}

export default HomePage;

