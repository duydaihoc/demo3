import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import './Hello.css';

export default function Hello() {
  // Add scroll animation effect - SỬA: Thêm class visible ngay từ đầu
  useEffect(() => {
    const handleScroll = () => {
      const elements = document.querySelectorAll('.animate-on-scroll');
      
      elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight - 100;
        
        if (isVisible) {
          el.classList.add('visible');
        }
      });
    };
    
    // THÊM: Thêm class visible cho tất cả element ngay khi component mount
    const elements = document.querySelectorAll('.animate-on-scroll');
    elements.forEach(el => el.classList.add('visible'));
    
    window.addEventListener('scroll', handleScroll);
    // Trigger once on load
    handleScroll();
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const [activeFeature, setActiveFeature] = useState('personal');
  const [carouselIndex, setCarouselIndex] = useState(0);
  const carouselTimerRef = useRef(null);
  const statsRef = useRef(null);

  const featureData = {
    personal: {
      title: 'Quản lý cá nhân thông minh',
      desc: 'Quản lý tài chính cá nhân toàn diện với đa ví, mục tiêu tiết kiệm, phân tích chi tiêu và báo cáo chi tiết.',
      pills: ['Đa ví không giới hạn', 'Mục tiêu tiết kiệm', 'Bản đồ chi tiêu', 'Timeline chi tiêu', 'Xuất PDF/CSV', 'Phân tích theo danh mục']
    },
    group: {
      title: 'Nhóm & Ghi nợ thông minh',
      desc: 'Quản lý chi tiêu nhóm, chia sẻ chi phí, ghi nợ minh bạch và tối ưu hóa thanh toán tự động.',
      pills: ['Tạo nhóm không giới hạn', 'Chia chi phí tự động', 'Ghi nợ thông minh', 'Tối ưu thanh toán', 'Hoạt động nhóm', 'Lịch sử minh bạch']
    },
    family: {
      title: 'Quản lý gia đình toàn diện',
      desc: 'Quản lý tài chính gia đình tập trung với danh sách mua sắm, việc cần làm, ngân sách và lưu trữ hóa đơn.',
      pills: ['Danh sách mua sắm', 'Việc cần làm', 'Ngân sách gia đình', 'Lưu trữ hóa đơn', 'Giao dịch gia đình', 'Phân vai trò']
    },
    ai: {
      title: 'Trợ lý AI Gemini',
      desc: 'Trợ lý thông minh với công nghệ AI tiên tiến, tạo giao dịch bằng ngôn ngữ tự nhiên và phân tích xu hướng.',
      pills: ['Tạo giao dịch bằng giọng nói', 'Phân tích xu hướng', 'Gợi ý tài chính', 'Hỏi đáp thông minh', 'Hiểu ngữ cảnh', 'Tối ưu hóa chi tiêu']
    },
    advanced: {
      title: 'Tính năng nâng cao',
      desc: 'Các công cụ mạnh mẽ hỗ trợ quản lý tài chính hiệu quả với biểu đồ, thống kê và xuất dữ liệu.',
      pills: ['Biểu đồ trực quan', 'Thống kê chi tiết', 'Xuất dữ liệu', 'Bản đồ chi tiêu', 'Phân tích theo thời gian', 'Quản lý danh mục']
    }
  };

  const testimonialsSets = [
    [
      { quote: 'MoneyWise giúp tôi giảm 25% chi tiêu không cần thiết chỉ sau 2 tháng.', author: 'Vũ Ngọc Hà', role: 'Product Manager' },
      { quote: 'Tính năng nhóm quá tiện — tụi mình không còn phải ghi tay ai nợ ai.', author: 'Phạm Minh Khang', role: 'Sinh viên' }
    ],
    [
      { quote: 'Liên kết ví gia đình làm mọi thứ rõ ràng và ít tranh cãi hơn.', author: 'Nguyễn Thảo Vy', role: 'Nội trợ' },
      { quote: 'Trợ lý AI trả lời rất tự nhiên và cho gợi ý hợp lý.', author: 'Trần Anh Tuấn', role: 'Dev Backend' }
    ],
    [
      { quote: 'Giao diện đẹp, tốc độ nhanh, số liệu rõ ràng — mình recommend.', author: 'Lê Hữu Đạt', role: 'Designer' },
      { quote: 'Đã thử nhiều app khác, cái này trực quan và chi tiết nhất.', author: 'Đỗ Mai Linh', role: 'Tư vấn tài chính' }
    ]
  ];

  useEffect(() => {
    // Auto rotate testimonials
    carouselTimerRef.current = setInterval(() => {
      setCarouselIndex(prev => (prev + 1) % testimonialsSets.length);
    }, 6500);
    return () => clearInterval(carouselTimerRef.current);
  }, []);

  useEffect(() => {
    // Animated counters when in view
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const nums = e.target.querySelectorAll('[data-animate]');
            nums.forEach(el => {
              const target = el.getAttribute('data-target');
              if (!target) return;
              let current = 0;
              const max = parseInt(target.replace(/\D/g, ''), 10) || 0;
              const step = Math.ceil(max / 40);
              const timer = setInterval(() => {
                current += step;
                if (current >= max) {
                  current = max;
                  clearInterval(timer);
                  el.classList.add('animated');
                }
                el.textContent = target.includes('+') ? current + '+' : current;
              }, 45);
            });
            observer.disconnect();
          }
        });
      },
      { threshold: 0.35 }
    );
    if (statsRef.current) observer.observe(statsRef.current);
  }, []);

  // Close ribbon on scroll down a lot (optional)
  const [showRibbon, setShowRibbon] = useState(true);
  useEffect(() => {
    let lastY = window.scrollY;
    const handle = () => {
      const y = window.scrollY;
      if (y > lastY + 140) setShowRibbon(false);
      else if (y < 120) setShowRibbon(true);
      lastY = y;
    };
    window.addEventListener('scroll', handle);
    return () => window.removeEventListener('scroll', handle);
  }, []);

  return (
    <div className="hello-container">
      <header className="hello-header">
        <div className="logo-container">
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
        
        <div className="header-actions">
          <Link to="/login" className="login-btn">Đăng nhập</Link>
          <Link to="/register" className="register-btn">Đăng ký</Link>
        </div>
      </header>

      <section className="hero-section">
        <div className="hero-content">
          <h1 className="animate-on-scroll">Quản lý tài chính thông minh toàn diện</h1>
          <p className="hero-subtitle animate-on-scroll">
            Giải pháp hoàn chỉnh: Quản lý cá nhân, nhóm chi tiêu, gia đình, danh sách mua sắm, việc cần làm, ngân sách, lưu trữ hóa đơn và trợ lý AI Gemini
          </p>
          <div className="hero-cta animate-on-scroll">
            <Link to="/register" className="cta-primary">Dùng thử miễn phí</Link>
            <Link to="/login" className="cta-secondary">Đăng nhập</Link>
          </div>
        </div>
        <div className="hero-image animate-on-scroll">
          <div className="dashboard-preview">
            <div className="chart-container">
              <div className="chart-bar bar-1"></div>
              <div className="chart-bar bar-2"></div>
              <div className="chart-bar bar-3"></div>
              <div className="chart-bar bar-4"></div>
              <div className="chart-bar bar-5"></div>
            </div>
            <div className="wallet-preview">
              <div className="wallet-header"></div>
              <div className="wallet-amount"></div>
              <div className="wallet-details">
                <div className="wallet-row"></div>
                <div className="wallet-row"></div>
              </div>
            </div>
          </div>
        </div>
        <div className="hero-pulse" aria-hidden="true"></div>
      </section>

      {/* Tabs Tính năng */}
      <div className="features-tabs animate-on-scroll">
        <div className="feature-tab-list">
          {Object.keys(featureData).map(key => (
            <button
              key={key}
              type="button"
              className={`feature-tab-btn ${activeFeature === key ? 'active' : ''}`}
              onClick={() => setActiveFeature(key)}
              aria-pressed={activeFeature === key}
            >
              <span className="feature-tab-icon">
                {key === 'personal' && '👤'}
                {key === 'group' && '👥'}
                {key === 'family' && '🏠'}
                {key === 'ai' && '🤖'}
                {key === 'advanced' && '⚡'}
              </span>
              <span>{featureData[key].title}</span>
            </button>
          ))}
        </div>
        <div className="feature-tab-content fade-swap-enter">
          <h3 className="feature-tab-title">{featureData[activeFeature].title}</h3>
            <p className="feature-tab-desc">{featureData[activeFeature].desc}</p>
            <div className="feature-highlight-pills">
              {featureData[activeFeature].pills.map(p => (
                <span key={p} className="feature-pill">{p}</span>
              ))}
            </div>
        </div>
      </div>

      {/* Enhanced Features Showcase */}
      <section className="features-showcase">
        <h2 className="section-title animate-on-scroll">Tính năng nổi bật</h2>
        
        <div className="features-grid-large">
          <div className="feature-card-large animate-on-scroll">
            <div className="feature-icon-large">
              <i className="fas fa-user-circle"></i>
            </div>
            <h3>Quản lý cá nhân thông minh</h3>
            <p>Quản lý tài chính cá nhân toàn diện với đa ví, mục tiêu tiết kiệm, bản đồ chi tiêu và phân tích chi tiết</p>
            <ul className="feature-highlights">
              <li><i className="fas fa-check"></i> Tạo và quản lý nhiều ví không giới hạn</li>
              <li><i className="fas fa-check"></i> Đặt mục tiêu tiết kiệm với theo dõi tiến độ</li>
              <li><i className="fas fa-check"></i> Bản đồ chi tiêu với vị trí địa lý</li>
              <li><i className="fas fa-check"></i> Timeline chi tiêu trực quan</li>
              <li><i className="fas fa-check"></i> Xuất báo cáo PDF/CSV</li>
              <li><i className="fas fa-check"></i> Phân tích chi tiêu theo danh mục</li>
            </ul>
            <span className="feature-badge">Miễn phí</span>
          </div>

          <div className="feature-card-large animate-on-scroll">
            <div className="feature-icon-large">
              <i className="fas fa-users"></i>
            </div>
            <h3>Nhóm chi tiêu & Ghi nợ thông minh</h3>
            <p>Quản lý chi tiêu nhóm, chia sẻ chi phí, ghi nợ minh bạch và tối ưu hóa thanh toán tự động</p>
            <ul className="feature-highlights">
              <li><i className="fas fa-check"></i> Tạo nhóm không giới hạn thành viên</li>
              <li><i className="fas fa-check"></i> Chia chi phí tự động (chia đều, theo phần trăm)</li>
              <li><i className="fas fa-check"></i> Ghi nợ và thanh toán thông minh</li>
              <li><i className="fas fa-check"></i> Tối ưu hóa thanh toán (giảm số lần chuyển)</li>
              <li><i className="fas fa-check"></i> Hoạt động nhóm và lịch sử minh bạch</li>
              <li><i className="fas fa-check"></i> Thông báo nhắc nhở thanh toán</li>
            </ul>
            <span className="feature-badge">Pro</span>
          </div>

          <div className="feature-card-large animate-on-scroll">
            <div className="feature-icon-large">
              <i className="fas fa-home"></i>
            </div>
            <h3>Quản lý gia đình toàn diện</h3>
            <p>Quản lý tài chính gia đình tập trung với danh sách mua sắm, việc cần làm, ngân sách và lưu trữ hóa đơn</p>
            <ul className="feature-highlights">
              <li><i className="fas fa-check"></i> Danh sách mua sắm với mua/hoàn tiền</li>
              <li><i className="fas fa-check"></i> Danh sách việc cần làm với phân công</li>
              <li><i className="fas fa-check"></i> Ngân sách gia đình với theo dõi tiến độ</li>
              <li><i className="fas fa-check"></i> Lưu trữ hóa đơn với OCR</li>
              <li><i className="fas fa-check"></i> Giao dịch gia đình (quỹ/ví cá nhân)</li>
              <li><i className="fas fa-check"></i> Phân vai trò và quyền quản lý</li>
            </ul>
            <span className="feature-badge">Family Plan</span>
          </div>

          <div className="feature-card-large animate-on-scroll">
            <div className="feature-icon-large">
              <i className="fas fa-shopping-cart"></i>
            </div>
            <h3>Danh sách mua sắm thông minh</h3>
            <p>Quản lý danh sách mua sắm gia đình với tính năng mua hàng, thanh toán và hoàn tiền tự động</p>
            <ul className="feature-highlights">
              <li><i className="fas fa-check"></i> Tạo và quản lý danh sách mua sắm</li>
              <li><i className="fas fa-check"></i> Mua hàng bằng ví cá nhân hoặc quỹ gia đình</li>
              <li><i className="fas fa-check"></i> Tự động tạo giao dịch khi mua</li>
              <li><i className="fas fa-check"></i> Hoàn tiền thông minh</li>
              <li><i className="fas fa-check"></i> Xuất danh sách PDF/CSV</li>
              <li><i className="fas fa-check"></i> Phân loại theo danh mục</li>
            </ul>
            <span className="feature-badge">Family Plan</span>
          </div>

          <div className="feature-card-large animate-on-scroll">
            <div className="feature-icon-large">
              <i className="fas fa-robot"></i>
            </div>
            <h3>Trợ lý AI Gemini</h3>
            <p>Trợ lý thông minh với công nghệ AI tiên tiến, tạo giao dịch bằng ngôn ngữ tự nhiên và phân tích xu hướng</p>
            <ul className="feature-highlights">
              <li><i className="fas fa-check"></i> Tạo giao dịch bằng ngôn ngữ tự nhiên</li>
              <li><i className="fas fa-check"></i> Phân tích xu hướng chi tiêu thông minh</li>
              <li><i className="fas fa-check"></i> Gợi ý tài chính cá nhân hóa</li>
              <li><i className="fas fa-check"></i> Hỏi đáp tài chính 24/7</li>
              <li><i className="fas fa-check"></i> Hiểu ngữ cảnh và học hỏi</li>
              <li><i className="fas fa-check"></i> Tối ưu hóa chi tiêu tự động</li>
            </ul>
            <span className="feature-badge">AI Powered</span>
          </div>

          <div className="feature-card-large animate-on-scroll">
            <div className="feature-icon-large">
              <i className="fas fa-chart-line"></i>
            </div>
            <h3>Phân tích & Báo cáo nâng cao</h3>
            <p>Công cụ phân tích mạnh mẽ với biểu đồ trực quan, thống kê chi tiết và xuất dữ liệu đa định dạng</p>
            <ul className="feature-highlights">
              <li><i className="fas fa-check"></i> Biểu đồ trực quan (Pie, Bar, Line)</li>
              <li><i className="fas fa-check"></i> Thống kê chi tiết theo thời gian</li>
              <li><i className="fas fa-check"></i> Phân tích theo danh mục</li>
              <li><i className="fas fa-check"></i> Xuất dữ liệu PDF/CSV/TXT</li>
              <li><i className="fas fa-check"></i> Bản đồ chi tiêu với vị trí</li>
              <li><i className="fas fa-check"></i> Timeline chi tiêu trực quan</li>
            </ul>
            <span className="feature-badge">Premium</span>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="how-it-works-section">
        <h2 className="section-title animate-on-scroll">Cách thức hoạt động</h2>
        
        <div className="steps-container">
          <div className="step-card animate-on-scroll">
            <div className="step-number">1</div>
            <h3>Đăng ký tài khoản</h3>
            <p>Tạo tài khoản miễn phí chỉ trong 30 giây với email hoặc số điện thoại</p>
          </div>

          <div className="step-card animate-on-scroll">
            <div className="step-number">2</div>
            <h3>Tạo ví và nhóm</h3>
            <p>Thiết lập các ví cá nhân và nhóm chi tiêu theo nhu cầu của bạn</p>
          </div>

          <div className="step-card animate-on-scroll">
            <div className="step-number">3</div>
            <h3>Ghi nhận giao dịch</h3>
            <p>Ghi lại các giao dịch dễ dàng bằng tay hoặc sử dụng trợ lý AI</p>
          </div>

          <div className="step-card animate-on-scroll">
            <div className="step-number">4</div>
            <h3>Theo dõi và phân tích</h3>
            <p>Xem báo cáo chi tiết và nhận gợi ý tối ưu hóa tài chính</p>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats-section animate-on-scroll" ref={statsRef}>
        <h2 className="section-title">Con số ấn tượng</h2>
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-number" data-animate data-target="10000+">0+</span>
            <span className="stat-label">Người dùng</span>
          </div>
          <div className="stat-item">
            <span className="stat-number" data-animate data-target="50000+">0+</span>
            <span className="stat-label">Giao dịch / tháng</span>
          </div>
          <div className="stat-item">
            <span className="stat-number" data-animate data-target="5000+">0+</span>
            <span className="stat-label">Nhóm đang hoạt động</span>
          </div>
            <div className="stat-item">
            <span className="stat-number" data-animate data-target="98+">0+</span>
            <span className="stat-label">Tỷ lệ hài lòng</span>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="comparison-section">
        <h2 className="section-title animate-on-scroll">So sánh với ứng dụng khác</h2>
        
        <div className="comparison-table-wrapper animate-on-scroll">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Tính năng</th>
                <th>Quản lý Chi tiêu</th>
                <th>Ứng dụng khác</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Quản lý đa ví cá nhân</td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
              </tr>
              <tr>
                <td>Nhóm chi tiêu & Ghi nợ</td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
                <td><span className="cross-icon" aria-hidden>✕</span></td>
              </tr>
              <tr>
                <td>Quản lý gia đình toàn diện</td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
                <td><span className="cross-icon" aria-hidden>✕</span></td>
              </tr>
              <tr>
                <td>Danh sách mua sắm thông minh</td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
                <td><span className="cross-icon" aria-hidden>✕</span></td>
              </tr>
              <tr>
                <td>Danh sách việc cần làm</td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
                <td><span className="cross-icon" aria-hidden>✕</span></td>
              </tr>
              <tr>
                <td>Ngân sách gia đình</td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
                <td><span className="cross-icon" aria-hidden>✕</span></td>
              </tr>
              <tr>
                <td>Lưu trữ hóa đơn với OCR</td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
                <td><span className="cross-icon" aria-hidden>✕</span></td>
              </tr>
              <tr>
                <td>Trợ lý AI Gemini</td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
                <td><span className="cross-icon" aria-hidden>✕</span></td>
              </tr>
              <tr>
                <td>Bản đồ chi tiêu với vị trí</td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
                <td><span className="cross-icon" aria-hidden>✕</span></td>
              </tr>
              <tr>
                <td>Mục tiêu tiết kiệm</td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
              </tr>
              <tr>
                <td>Xuất dữ liệu PDF/CSV/TXT</td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
                <td><span className="cross-icon" aria-hidden>✕</span></td>
              </tr>
              <tr>
                <td>Biểu đồ & Thống kê nâng cao</td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
              </tr>
              <tr>
                <td>Miễn phí sử dụng cơ bản</td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
                <td><span className="cross-icon" aria-hidden>✕</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="benefits-section">
        <h2 className="section-title animate-on-scroll">Lợi ích khi sử dụng quản lý chi tiêu</h2>
        
        <div className="benefits-grid">
          <div className="benefit-card animate-on-scroll">
            <div className="benefit-icon">
              <i className="fas fa-chart-pie"></i>
            </div>
            <h3>Theo dõi chi tiêu</h3>
            <p>Ghi lại và phân loại mọi khoản chi tiêu, giúp bạn nắm rõ tiền đang đi về đâu</p>
          </div>
          
          <div className="benefit-card animate-on-scroll">
            <div className="benefit-icon">
              <i className="fas fa-bullseye"></i>
            </div>
            <h3>Đặt mục tiêu tài chính</h3>
            <p>Lập kế hoạch tiết kiệm và theo dõi tiến độ đạt được mục tiêu tài chính của bạn</p>
          </div>
          
          <div className="benefit-card animate-on-scroll">
            <div className="benefit-icon">
              <i className="fas fa-users"></i>
            </div>
            <h3>Quản lý nhóm chi tiêu</h3>
            <p>Dễ dàng tạo và quản lý chi tiêu chung trong gia đình hoặc nhóm bạn bè</p>
          </div>
          
          <div className="benefit-card animate-on-scroll">
            <div className="benefit-icon">
              <i className="fas fa-bell"></i>
            </div>
            <h3>Thông báo thông minh</h3>
            <p>Nhận cảnh báo khi chi tiêu vượt ngân sách và gợi ý tiết kiệm phù hợp</p>
          </div>
          
          <div className="benefit-card animate-on-scroll">
            <div className="benefit-icon">
              <i className="fas fa-lock"></i>
            </div>
            <h3>Bảo mật tối đa</h3>
            <p>Dữ liệu tài chính của bạn được bảo vệ bằng công nghệ mã hóa tiên tiến</p>
          </div>
          
          <div className="benefit-card animate-on-scroll">
            <div className="benefit-icon">
              <i className="fas fa-mobile-alt"></i>
            </div>
            <h3>Truy cập mọi lúc mọi nơi</h3>
            <p>Sử dụng trên mọi thiết bị, đồng bộ dữ liệu liền mạch giữa máy tính và điện thoại</p>
          </div>
        </div>
      </section>

      {/* Carousel Testimonials (thay khối cũ) */}
      <div className="testimonial-carousel animate-on-scroll">
        <h2 className="section-title" style={{ marginBottom: '30px' }}>Trải nghiệm thực tế</h2>
        <div className="carousel-track">
          {testimonialsSets.map((group, idx) => (
            <div
              key={idx}
              className={`carousel-slide ${carouselIndex === idx ? 'active scale-pop' : ''}`}
              aria-hidden={carouselIndex !== idx}
            >
              {group.map((t, i) => (
                <div key={i} className="testimonial-card">
                  <div className="testimonial-quote">“{t.quote}”</div>
                  <div className="testimonial-author">{t.author}</div>
                  <div className="testimonial-role">{t.role}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="carousel-controls" role="tablist" aria-label="Chuyển testimonial">
          {testimonialsSets.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`carousel-dot ${carouselIndex === i ? 'active' : ''}`}
              onClick={() => setCarouselIndex(i)}
              aria-label={`Slide ${i + 1}`}
              aria-selected={carouselIndex === i}
            />
          ))}
        </div>
      </div>

      <section className="cta-section animate-on-scroll">
        <div className="cta-content">
          <h2>Sẵn sàng để quản lý tài chính thông minh?</h2>
          <p>Tham gia cùng hàng nghìn người dùng đang tối ưu hóa chi tiêu của họ</p>
          <div className="cta-buttons">
            <Link to="/register" className="cta-primary">Đăng ký miễn phí</Link>
            <Link to="/login" className="cta-secondary">Đăng nhập</Link>
          </div>
        </div>
      </section>

      <footer className="hello-footer">
        <div className="footer-logo">
          <div className="logo-icon small">
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
        
        <div className="footer-links">
          <div className="footer-column">
            <h3>Sản phẩm</h3>
            <ul>
              <li><Link to="/">Tính năng</Link></li>
              <li><Link to="/">Bảng giá</Link></li>
              <li><Link to="/">Hướng dẫn</Link></li>
            </ul>
          </div>
          
          <div className="footer-column">
            <h3>Công ty</h3>
            <ul>
              <li><Link to="/">Giới thiệu</Link></li>
              <li><Link to="/">Blog</Link></li>
              <li><Link to="/">Tuyển dụng</Link></li>
            </ul>
          </div>
          
          <div className="footer-column">
            <h3>Hỗ trợ</h3>
            <ul>
              <li><Link to="/">Trung tâm trợ giúp</Link></li>
              <li><Link to="/">Liên hệ</Link></li>
              <li><Link to="/">Bảo mật</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} MoneyWise. Tất cả các quyền được bảo lưu.</p>
          <div className="social-links">
            <a href="/" aria-label="Facebook"><i className="fab fa-facebook-f"></i></a>
            <a href="/" aria-label="Twitter"><i className="fab fa-twitter"></i></a>
            <a href="/" aria-label="Instagram"><i className="fab fa-instagram"></i></a>
            <a href="/" aria-label="LinkedIn"><i className="fab fa-linkedin-in"></i></a>
          </div>
        </div>
      </footer>

      {showRibbon && (
        <div className="cta-ribbon cta-ribbon--glass" role="complementary" aria-label="Đăng ký nhanh">
          <div className="ribbon-text">
            <strong>Bắt đầu quản lý tài chính thông minh hôm nay</strong><br />
            Dùng thử miễn phí & trải nghiệm trợ lý AI ngay.
          </div>
          <div className="ribbon-actions">
            <button
              className="ribbon-btn outline"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >Tìm hiểu</button>
            <button
              className="ribbon-btn"
              onClick={() => window.location.href = '/register'}
            >Đăng ký miễn phí</button>
          </div>
        </div>
      )}
    </div>
  );
}
