import React, { useState, useRef, useEffect } from 'react';
import { TourProvider, useTour } from '@reactour/tour';
import { steps } from './tourConfig';
import { walletCreationSteps } from './walletTourConfig';
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
  const { setIsOpen, setCurrentStep, setSteps, currentStep } = useTour();
  const [showWelcome, setShowWelcome] = useState(false);
  const [showHelpDropdown, setShowHelpDropdown] = useState(false);
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

  // Function to show general guide
  const showGeneralHelp = () => {
    setSteps(steps);
    setShowHelpDropdown(false);
    setIsOpen(true);
  };

  // Function to show wallet creation guide
  const showWalletCreationGuide = () => {
    setSteps(walletCreationSteps);
    setShowHelpDropdown(false);
    setCurrentStep(0);
    setIsOpen(true);
  };

  // Toggle dropdown
  const toggleHelpDropdown = () => {
    setShowHelpDropdown(!showHelpDropdown);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.home-help-dropdown')) {
        setShowHelpDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const onAddModal = () => {
      if (currentStep === 0) setTimeout(() => setCurrentStep(1), 150);
    };
    const onWalletCreated = () => {
      setTimeout(() => setCurrentStep(5), 250); // jump to step 6 (index 5)
    };
    const onExpenseChosen = () => {
      if (currentStep === 5) setTimeout(() => setCurrentStep(6), 150); // move to step 7
    };
    const onIncomeTab = () => {
      if (currentStep === 6) setTimeout(() => setCurrentStep(7), 150); // move to step 8
    };
    const onIncomeChosen = () => {
      if (currentStep === 7) setTimeout(() => setCurrentStep(8), 150); // move to step 9
    };
    const onCategoriesSaved = () => {
      if (currentStep <= 9) {
        markTourAsSeen();
        setIsOpen(false);
      }
    };
    window.addEventListener('walletAddModalOpened', onAddModal);
    window.addEventListener('walletCreated', onWalletCreated);
    window.addEventListener('walletExpenseCategoryChosen', onExpenseChosen);
    window.addEventListener('walletIncomeTabSelected', onIncomeTab);
    window.addEventListener('walletIncomeCategoryChosen', onIncomeChosen);
    window.addEventListener('walletCategoriesSaved', onCategoriesSaved);
    return () => {
      window.removeEventListener('walletAddModalOpened', onAddModal);
      window.removeEventListener('walletCreated', onWalletCreated);
      window.removeEventListener('walletExpenseCategoryChosen', onExpenseChosen);
      window.removeEventListener('walletIncomeTabSelected', onIncomeTab);
      window.removeEventListener('walletIncomeCategoryChosen', onIncomeChosen);
      window.removeEventListener('walletCategoriesSaved', onCategoriesSaved);
    };
  }, [currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Recalc highlight when category filter changes or modal resizes
    const forceRecalc = () => {
      // hack: trigger resize + re-set same step to force recompute bbox
      window.dispatchEvent(new Event('resize'));
      setTimeout(() => setCurrentStep(s => s), 50);
    };
    const onFilterChanged = forceRecalc;
    const onModalResized = forceRecalc;

    window.addEventListener('walletCategoryFilterChanged', onFilterChanged);
    window.addEventListener('walletCategoryModalResized', onModalResized);

    return () => {
      window.removeEventListener('walletCategoryFilterChanged', onFilterChanged);
      window.removeEventListener('walletCategoryModalResized', onModalResized);
    };
  }, [setCurrentStep]);

  useEffect(() => {
    // Attach MutationObserver when on category steps of wallet tour
    const modal = document.querySelector('.category-modal');
    if (!modal) return;
    const observer = new MutationObserver(() => {
      try { window.dispatchEvent(new CustomEvent('walletCategoryModalResized')); } catch(_) {}
    });
    observer.observe(modal, { childList: true, subtree: true, attributes: true });
    return () => observer.disconnect();
  }, [currentStep]);

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
            <div 
              className={`home-help-dropdown ${showHelpDropdown ? 'open' : ''}`}
            >
              <button
                onClick={toggleHelpDropdown}
                className="home-help-btn"
                title="Chọn loại hướng dẫn"
              >
                <i className="fas fa-question-circle"></i>
                Hướng dẫn
                <i className="fas fa-chevron-down dropdown-arrow"></i>
              </button>
              <div className="home-help-dropdown-content">
                <button 
                  className="home-help-dropdown-item"
                  onClick={showGeneralHelp}
                >
                  <i className="fas fa-compass"></i>
                  Hướng dẫn chung
                </button>
                <button 
                  className="home-help-dropdown-item"
                  onClick={showWalletCreationGuide}
                >
                  <i className="fas fa-wallet"></i>
                  Hướng dẫn tạo ví
                </button>
              </div>
            </div>
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
    <div>
    <TourProvider
      steps={steps}
      scrollSmooth={true}
      resizeObserving={true}
      components={{
        Navigation: (props) => {
          const { currentStep, steps, setCurrentStep, setIsOpen } = props;
          const visibleDots = 5; // Maximum number of visible dots
          let startIndex = 0;
          
          // Calculate the starting index to show a sliding window of dots
          if (currentStep >= visibleDots) {
            startIndex = currentStep - visibleDots + 1;
          }
          
          // Ensure we don't go beyond the total number of steps
          const endIndex = Math.min(startIndex + visibleDots, steps.length);
          const isFirstStep = currentStep === 0;
          const isLastStep = currentStep === steps.length - 1;
          
          return (
            <div style={{
              background: 'linear-gradient(135deg, rgba(78, 205, 196, 0.1), rgba(42, 82, 152, 0.1))',
              borderRadius: '12px',
              padding: '15px 20px',
              margin: '20px 0',
              boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)',
              width: '100%',
              maxWidth: '400px',
              margin: '20px auto',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              {/* Step Counter */}
              <div style={{
                textAlign: 'center',
                marginBottom: '15px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#4ecdc4',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                Bước {currentStep + 1} / {steps.length}
              </div>
              
              {/* Dots Navigation */}
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: '15px',
                padding: '0 10px'
              }}>
                {steps.map((_, index) => {
                  // Only render dots within the visible range
                  if (index >= startIndex && index < endIndex) {
                    return (
                      <button
                        key={index}
                        onClick={() => setCurrentStep(index)}
                        style={{
                          width: currentStep === index ? '12px' : '8px',
                          height: currentStep === index ? '12px' : '8px',
                          borderRadius: '50%',
                          border: 'none',
                          margin: '0 6px',
                          padding: 0,
                          background: currentStep === index 
                            ? 'linear-gradient(135deg, #4ecdc4, #2a5298)' 
                            : 'rgba(255, 255, 255, 0.4)',
                          cursor: 'pointer',
                          transition: 'all 0.3s ease',
                          boxShadow: currentStep === index 
                            ? '0 0 10px rgba(78, 205, 196, 0.5)' 
                            : 'none'
                        }}
                        aria-label={`Bước ${index + 1}`}
                      />
                    );
                  }
                  return null;
                })}
              </div>
              
              {/* Navigation Buttons */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                gap: '15px'
              }}>
                {/* Back Button */}
                <button
                  onClick={() => setCurrentStep(currentStep - 1)}
                  disabled={isFirstStep}
                  style={{
                    flex: 1,
                    padding: '10px 15px',
                    border: '1px solid rgba(78, 205, 196, 0.5)',
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    cursor: isFirstStep ? 'not-allowed' : 'pointer',
                    color: isFirstStep ? 'rgba(78, 205, 196, 0.5)' : '#4ecdc4',
                    fontWeight: 600,
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.3s ease',
                    opacity: isFirstStep ? 0.6 : 1,
                    backdropFilter: 'blur(5px)'
                  }}
                >
                  <span>←</span> Quay lại
                </button>
                
                {/* Next/Finish Button */}
                <button
                  onClick={() => isLastStep ? setIsOpen(false) : setCurrentStep(currentStep + 1)}
                  style={{
                    flex: 1,
                    padding: '10px 15px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #4ecdc4, #2a5298)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 15px rgba(78, 205, 196, 0.3)'
                  }}
                >
                  {isLastStep ? 'Hoàn thành' : 'Tiếp theo'}
                  {!isLastStep && <span>→</span>}
                </button>
              </div>
            </div>
          );
        }
      }}
      onOpen={() => document.body.classList.add('tour-open')}
      onClose={() => document.body.classList.remove('tour-open')}
      onCurrentStepChange={(step) => {
        // Handle step changes for both general and wallet creation tours
        const currentSteps = steps.length > 0 ? steps : walletCreationSteps;
        const stepDef = currentSteps[step];
        
        if (stepDef?.selector === '.fd-root') {
          const target = document.querySelector('.fd-root');
          const scroller = document.querySelector('.home-main');
          if (target && scroller) {
            const top = target.offsetTop - 40;
            scroller.scrollTo({ top, behavior: 'smooth' });
          }
        }

        // Execute step action if available (for wallet creation guide)
        if (stepDef?.action && typeof stepDef.action === 'function') {
          setTimeout(() => {
            stepDef.action();
          }, 500);
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
    </div>
  );
}

export default HomePage;

