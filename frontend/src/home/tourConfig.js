import React from 'react';

export const steps = [
  {
    selector: '.home-title',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>🚀 Bắt đầu quản lý chi tiêu thông minh</h3>
        <p style={{ margin: 0 }}>
          Tour này sẽ dẫn bạn đi một vòng qua những phần quan trọng nhất của màn hình tổng quan.
        </p>
        <p style={{ marginTop: 8, fontWeight: 600, color: '#2563eb' }}>
          Mẹo nhỏ: ghi chép đều đặn + xem biểu đồ thường xuyên để không “lệch nhịp” chi tiêu.
        </p>
      </div>
    ),
    position: 'bottom'
  },
  {
    selector: '.home-actions',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>✍️ Ghi chép thật nhanh</h3>
        <p style={{ margin: 0 }}>
          Nhấn <b>+ Ghi chép</b> ngay khi phát sinh giao dịch để số liệu luôn chính xác.
        </p>
        <p style={{ margin: '6px 0 0' }}>
          Dùng nút <b>Nhóm / Gia đình</b> nếu đây là khoản chi chung với người khác.
        </p>
      </div>
    ),
    position: 'bottom'
  },
  {
    selector: '.fd-root',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>📊 Trung tâm phân tích tài chính</h3>
        <p style={{ margin: 0 }}>
          Khu vực này tổng hợp mọi thứ: cơ cấu chi tiêu, thu – chi theo tháng và biến động số dư.
        </p>
        <ul style={{ paddingLeft: 18, margin: '8px 0' }}>
          <li>Cột: so sánh Thu / Chi từng tháng</li>
          <li>Tròn: phân bổ theo danh mục</li>
          <li>Dòng cột: dòng tiền 30 ngày gần nhất</li>
        </ul>
        <p style={{ margin: 0, fontStyle: 'italic', color: '#64748b' }}>
          Nếu có một danh mục “phình to” bất thường, đó là nơi nên siết lại đầu tiên.
        </p>
      </div>
    ),
    position: 'center'
  },
  {
    selector: '.wallets-container',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>💼 Ví & dòng tiền</h3>
        <p style={{ margin: 0 }}>
          Tách ví theo mục đích (Sinh hoạt / Tiết kiệm / Đầu tư…) để không lẫn lộn tiền.
        </p>
        <p style={{ margin: '6px 0 0' }}>
          Mỗi ví có thể có bộ danh mục riêng, rất tiện cho việc phân tích sau này.
        </p>
      </div>
    ),
    position: 'left'
  },
  {
    selector: '.savings-container',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>🎯 Mục tiêu tiết kiệm</h3>
        <p style={{ margin: 0 }}>
          Đặt mục tiêu rõ ràng (ví dụ: Quỹ khẩn cấp, Mua nhà, Du lịch…) và nạp tiền định kỳ.
        </p>
        <p style={{ margin: '6px 0 0' }}>
          Khi đạt mục tiêu, bạn có thể tạo báo cáo & lưu lại như một cột mốc tài chính.
        </p>
      </div>
    ),
    position: 'left'
  },
  {
    selector: '.home-reminder',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>📝 Ghi chú & nguyên tắc</h3>
        <p style={{ margin: 0 }}>
          Khu vực này dùng để lưu các “luật chơi” tài chính riêng của bạn, hoặc những điều cần nhớ.
        </p>
        <p style={{ margin: '6px 0 0' }}>
          Bạn hoàn toàn có thể tùy biến, thêm bớt nội dung theo cách bạn muốn.
        </p>
      </div>
    ),
    position: 'left'
  },
  {
    selector: '.ai-button',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>🤖 Trợ lý AI tài chính</h3>
        <p style={{ margin: 0 }}>
          Hãy thử hỏi: <b>“Phân tích chi tiêu tuần này?”</b> hoặc <b>“Gợi ý tối ưu ví tiết kiệm?”</b>.
        </p>
        <p style={{ margin: '6px 0 0', color: '#16a34a', fontWeight: 600 }}>
          AI có thể đọc dữ liệu ví cá nhân của bạn và gợi ý, thậm chí tạo giao dịch giúp bạn.
        </p>
      </div>
    ),
    position: 'top'
  },
];

export default steps;
