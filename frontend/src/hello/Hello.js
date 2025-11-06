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
      title: 'Quản lý cá nhân',
      desc: 'Theo dõi ví cá nhân, mục tiêu tiết kiệm và phân tích chi tiêu hàng ngày.',
      pills: ['Đa ví', 'Mục tiêu', 'Phân loại tự động', 'Báo cáo PDF', 'Gợi ý điều chỉnh']
    },
    group: {
      title: 'Nhóm & Ghi nợ',
      desc: 'Chia sẻ chi phí, ghi nợ minh bạch và nhắc nhở thanh toán tự động.',
      pills: ['Tạo nhóm', 'Phân quyền', 'Ghi nợ', 'Tự động chia', 'Lịch sử minh bạch']
    },
    family: {
      title: 'Liên kết ví gia đình',
      desc: 'Tập trung tài chính gia đình, phân vai trò quản lý và theo dõi tổng hợp.',
      pills: ['Phân vai trò', 'Tổng hợp dòng tiền', 'Giới hạn chi', 'Cảnh báo sớm']
    },
    ai: {
      title: 'Trợ lý AI Gemini',
      desc: 'Phân tích xu hướng, tạo giao dịch bằng ngôn ngữ tự nhiên & gợi ý tối ưu.',
      pills: ['Hiểu ngữ cảnh', 'Tối ưu hóa', 'Hỏi đáp tài chính', 'Gợi ý tiết kiệm']
    },
    security: {
      title: 'Bảo mật & Tin cậy',
      desc: 'Mã hóa dữ liệu, xác thực an toàn và cảnh báo bất thường.',
      pills: ['Mã hóa', 'Theo dõi bất thường', 'Nhật ký bảo mật', 'Sao lưu']
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
          <h1 className="animate-on-scroll">Quản lý tài chính thông minh cho gia đình</h1>
          <p className="hero-subtitle animate-on-scroll">
            Giải pháp toàn diện: Quản lý cá nhân, nhóm chi tiêu, liên kết ví gia đình, ghi nợ thông minh và trợ lý AI
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
                {key === 'security' && '🔒'}
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
            <h3>Quản lý cá nhân</h3>
            <p>Kiểm soát hoàn toàn tài chính cá nhân với giao diện trực quan và dễ sử dụng</p>
            <ul className="feature-highlights">
              <li><i className="fas fa-check"></i> Tạo và quản lý nhiều ví riêng</li>
              <li><i className="fas fa-check"></i> Phân loại giao dịch tự động</li>
              <li><i className="fas fa-check"></i> Báo cáo chi tiêu chi tiết</li>
              <li><i className="fas fa-check"></i> Đặt mục tiêu tiết kiệm</li>
            </ul>
            <span className="feature-badge">Miễn phí</span>
          </div>

          <div className="feature-card-large animate-on-scroll">
            <div className="feature-icon-large">
              <i className="fas fa-users"></i>
            </div>
            <h3>Nhóm chi tiêu & Ghi nợ</h3>
            <p>Quản lý chi tiêu chung với bạn bè, đồng nghiệp một cách dễ dàng và minh bạch</p>
            <ul className="feature-highlights">
              <li><i className="fas fa-check"></i> Tạo nhóm không giới hạn</li>
              <li><i className="fas fa-check"></i> Ghi nợ và thanh toán thông minh</li>
              <li><i className="fas fa-check"></i> Chia sẻ chi phí tự động</li>
              <li><i className="fas fa-check"></i> Thông báo nhắc nhở thanh toán</li>
            </ul>
            <span className="feature-badge">Pro</span>
          </div>

          <div className="feature-card-large animate-on-scroll">
            <div className="feature-icon-large">
              <i className="fas fa-home"></i>
            </div>
            <h3>Liên kết ví gia đình</h3>
            <p>Quản lý tài chính gia đình tập trung, minh bạch và hiệu quả</p>
            <ul className="feature-highlights">
              <li><i className="fas fa-check"></i> Liên kết ví giữa các thành viên</li>
              <li><i className="fas fa-check"></i> Phân quyền quản lý linh hoạt</li>
              <li><i className="fas fa-check"></i> Theo dõi chi tiêu gia đình</li>
              <li><i className="fas fa-check"></i> Báo cáo tài chính tổng hợp</li>
            </ul>
            <span className="feature-badge">Family Plan</span>
          </div>

          <div className="feature-card-large animate-on-scroll">
            <div className="feature-icon-large">
              <i className="fas fa-wallet"></i>
            </div>
            <h3>Đa ví thông minh</h3>
            <p>Quản lý nhiều nguồn tiền khác nhau một cách khoa học và có hệ thống</p>
            <ul className="feature-highlights">
              <li><i className="fas fa-check"></i> Tạo ví không giới hạn</li>
              <li><i className="fas fa-check"></i> Chuyển tiền giữa các ví</li>
              <li><i className="fas fa-check"></i> Danh mục chi tiêu riêng biệt</li>
              <li><i className="fas fa-check"></i> Theo dõi số dư realtime</li>
            </ul>
            <span className="feature-badge">Miễn phí</span>
          </div>

          <div className="feature-card-large animate-on-scroll">
            <div className="feature-icon-large">
              <i className="fas fa-robot"></i>
            </div>
            <h3>Trợ lý AI Gemini</h3>
            <p>Trợ lý thông minh hỗ trợ quản lý tài chính 24/7 với công nghệ AI tiên tiến</p>
            <ul className="feature-highlights">
              <li><i className="fas fa-check"></i> Tạo giao dịch bằng giọng nói</li>
              <li><i className="fas fa-check"></i> Phân tích xu hướng chi tiêu</li>
              <li><i className="fas fa-check"></i> Tư vấn tài chính cá nhân hóa</li>
              <li><i className="fas fa-check"></i> Gợi ý tiết kiệm thông minh</li>
            </ul>
            <span className="feature-badge">AI Powered</span>
          </div>

          <div className="feature-card-large animate-on-scroll">
            <div className="feature-icon-large">
              <i className="fas fa-user-friends"></i>
            </div>
            <h3>Quản lý thành viên</h3>
            <p>Kết nối và quản lý thành viên trong gia đình hoặc nhóm một cách hiệu quả</p>
            <ul className="feature-highlights">
              <li><i className="fas fa-check"></i> Thêm thành viên không giới hạn</li>
              <li><i className="fas fa-check"></i> Phân quyền chi tiết</li>
              <li><i className="fas fa-check"></i> Theo dõi hoạt động thành viên</li>
              <li><i className="fas fa-check"></i> Lịch sử giao dịch minh bạch</li>
            </ul>
            <span className="feature-badge">Pro</span>
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
                <td>Quản lý ví cá nhân</td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
              </tr>
              <tr>
                <td>Nhóm chi tiêu</td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
                <td><span className="cross-icon" aria-hidden>✕</span></td>
              </tr>
              <tr>
                <td>Liên kết ví gia đình</td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
                <td><span className="cross-icon" aria-hidden>✕</span></td>
              </tr>
              <tr>
                <td>Ghi nợ thông minh</td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
                <td><span className="cross-icon" aria-hidden>✕</span></td>
              </tr>
              <tr>
                <td>Trợ lý AI Gemini</td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
                <td><span className="cross-icon" aria-hidden>✕</span></td>
              </tr>
              <tr>
                <td>Quản lý thành viên</td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
                <td><span className="check-icon" aria-hidden>✓</span></td>
              </tr>
              <tr>
                <td>Báo cáo chi tiết</td>
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
