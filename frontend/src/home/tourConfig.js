import React from 'react';

export const steps = [
  {
    selector: '.home-title',
    content: ({ goTo, setCurrentStep, steps, step }) => (
      <div>
        <h3>Chào mừng đến với Trang chủ</h3>
        <p>Đây là trang chính của ứng dụng quản lý tài chính cá nhân.</p>
      </div>
    ),
    position: 'bottom',
  },
  {
    selector: '.home-actions',
    content: () => (
      <div>
        <h3>Thao tác nhanh</h3>
        <p>Ở đây bạn có thể thêm giao dịch mới hoặc chuyển đổi giữa các nhóm/quản lý gia đình.</p>
      </div>
    ),
    position: 'bottom',
  },
  {
    selector: '.fd-root',
    content: () => (
      <div>
        <h3>Thống kê tài chính</h3>
        <p>Xem tổng quan về tình hình tài chính của bạn, bao gồm thu nhập, chi tiêu và biểu đồ phân tích.</p>
      </div>
    ),
    position: 'right',
  },
  {
    selector: '.wallets-container',
    content: () => (
      <div>
        <h3>Quản lý ví</h3>
        <p>Theo dõi số dư và quản lý các ví tiền của bạn. Bạn có thể thêm, sửa hoặc xóa ví tại đây.</p>
      </div>
    ),
    position: 'left',
  },
  {
    selector: '.savings-container',
    content: () => (
      <div>
        <h3>Mục tiêu tiết kiệm</h3>
        <p>Đặt và theo dõi các mục tiêu tiết kiệm của bạn. Xem tiến độ và số tiền còn lại để đạt được mục tiêu.</p>
      </div>
    ),
    position: 'left',
  },
  {
    selector: '.home-reminder',
    content: () => (
      <div>
        <h3>Ghi chú & Nhắc nhở</h3>
        <p>Xem các mẹo và lời nhắc hữu ích để quản lý tài chính hiệu quả hơn.</p>
      </div>
    ),
    position: 'left',
  },
  {
    selector: '.ai-button',
    content: () => (
      <div>
        <h3>Trợ lý AI</h3>
        <p>Nhận tư vấn tài chính thông minh từ trợ lý AI của chúng tôi. Hãy hỏi bất cứ điều gì về tài chính cá nhân!</p>
      </div>
    ),
    position: 'top',
  },
];

export default steps;
