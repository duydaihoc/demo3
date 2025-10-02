import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Hello.css';

export default function Hello() {
  // Add scroll animation effect
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
    
    window.addEventListener('scroll', handleScroll);
    // Trigger once on load
    handleScroll();
    
    return () => window.removeEventListener('scroll', handleScroll);
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
          <h1 className="animate-on-scroll">Quản lý chi tiêu thông minh</h1>
          <p className="hero-subtitle animate-on-scroll">
            Giải pháp toàn diện giúp bạn theo dõi, phân tích và tối ưu hóa tài chính cá nhân
          </p>
          <div className="hero-cta animate-on-scroll">
            <Link to="/register" className="cta-primary">Bắt đầu miễn phí</Link>
            <Link to="/login" className="cta-secondary">Đã có tài khoản</Link>
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

      <section className="features-section">
        <div className="feature-container animate-on-scroll">
          <div className="feature-content">
            <h2>Phân tích chi tiêu thông minh</h2>
            <p>Biểu đồ trực quan giúp bạn hiểu rõ cấu trúc chi tiêu. Phân tích thông minh giúp phát hiện các khoản chi tiêu không cần thiết và cơ hội tiết kiệm.</p>
            <ul className="feature-list">
              <li><i className="fas fa-check"></i> Biểu đồ trực quan</li>
              <li><i className="fas fa-check"></i> So sánh giữa các tháng</li>
              <li><i className="fas fa-check"></i> Phân tích xu hướng</li>
            </ul>
          </div>
          <div className="feature-image analytics-image"></div>
        </div>
        
        <div className="feature-container reverse animate-on-scroll">
          <div className="feature-content">
            <h2>Ngân sách thông minh</h2>
            <p>Tạo và theo dõi ngân sách cho từng danh mục chi tiêu. Nhận thông báo khi bạn sắp đạt đến giới hạn ngân sách.</p>
            <ul className="feature-list">
              <li><i className="fas fa-check"></i> Tự động phân loại</li>
              <li><i className="fas fa-check"></i> Cảnh báo vượt ngân sách</li>
              <li><i className="fas fa-check"></i> Gợi ý tiết kiệm</li>
            </ul>
          </div>
          <div className="feature-image budget-image"></div>
        </div>
      </section>

      <section className="testimonials-section animate-on-scroll">
        <h2 className="section-title">Người dùng nói gì về chúng tôi</h2>
        
        <div className="testimonials-container">
          <div className="testimonial-card">
            <div className="testimonial-quote">"MoneyWise đã giúp tôi tiết kiệm hơn 30% thu nhập hàng tháng bằng cách chỉ ra những khoản chi tiêu không cần thiết."</div>
            <div className="testimonial-author">Nguyễn Minh Tuấn</div>
            <div className="testimonial-role">Kỹ sư phần mềm</div>
          </div>
          
          <div className="testimonial-card">
            <div className="testimonial-quote">"Giao diện trực quan và dễ sử dụng. Giờ đây cả gia đình tôi có thể theo dõi chi tiêu chung một cách hiệu quả."</div>
            <div className="testimonial-author">Trần Thị Hương</div>
            <div className="testimonial-role">Giáo viên</div>
          </div>
          
          <div className="testimonial-card">
            <div className="testimonial-quote">"Tôi đã đạt được mục tiêu tiết kiệm cho chuyến du lịch châu Âu nhờ tính năng đặt mục tiêu tài chính của MoneyWise."</div>
            <div className="testimonial-author">Lê Văn Hòa</div>
            <div className="testimonial-role">Nhân viên marketing</div>
          </div>
        </div>
      </section>

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
    </div>
  );
}
