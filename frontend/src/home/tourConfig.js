import React from 'react';

export const steps = [
  {
    selector: '.home-title',
    content: () => (
      <div>
        <h3>🚀 Bắt đầu quản lý chi tiêu thông minh</h3>
        <p>Tour này giúp bạn tối ưu theo dõi Thu / Chi, ví, mục tiêu và phân tích tài chính cá nhân.</p>
        <p style={{marginTop:8,fontWeight:500}}>Mẹo: Ghi chép đều đặn + xem biểu đồ giúp kiểm soát tốt hơn.</p>
      </div>
    ),
    position: 'bottom'
  },
  {
    selector: '.home-actions',
    content: () => (
      <div>
        <h3>Ghi chép nhanh</h3>
        <p>Nhấn <b>+ Ghi chép</b> ngay khi phát sinh giao dịch để số liệu luôn chính xác.</p>
        <p style={{margin:0}}>Chuyển <b>Nhóm/Gia đình</b> nếu dùng chi tiêu chung.</p>
      </div>
    ),
    position: 'bottom',
  },
  {
    selector: '.fd-root',
    content: () => (
      <div>
        <h3>Thống kê tài chính trung tâm</h3>
        <p>Biểu đồ & bảng giúp bạn nhìn rõ cơ cấu chi tiêu, biến động và danh mục nổi bật.</p>
        <ul style={{paddingLeft:18, margin:'6px 0'}}>
          <li>Cột: Thu vs Chi</li>
          <li>Tròn: Phân bổ theo danh mục</li>
          <li>Dòng cột: Dòng tiền 30 ngày</li>
        </ul>
        <p style={{margin:0,fontStyle:'italic'}}>Tối ưu: Cắt giảm nhóm chiếm tỷ trọng cao bất thường.</p>
      </div>
    ),
    position: 'center',
  },
  {
    selector: '.wallets-container',
    content: () => (
      <div>
        <h3>Ví & dòng tiền</h3>
        <p>Tách ví theo mục đích (Sinh hoạt / Tiết kiệm / Đầu tư) để không lẫn lộn.</p>
        <p style={{margin:0}}>Có thể thêm danh mục riêng cho từng ví.</p>
      </div>
    ),
    position: 'left',
  },
  {
    selector: '.savings-container',
    content: () => (
      <div>
        <h3>Mục tiêu tiết kiệm</h3>
        <p>Thiết lập mục tiêu rõ ràng giúp kỷ luật hơn. Ghi nạp để thấy tiến độ.</p>
        <p style={{margin:0}}>Khi đạt → tạo báo cáo & lưu PDF.</p>
      </div>
    ),
    position: 'left',
  },
  {
    selector: '.home-reminder',
    content: () => (
      <div>
        <h3>Ghi chú & mẹo</h3>
        <p>Khu vực gợi nhắc các nguyên tắc hay chiến lược quản lý dòng tiền.</p>
        <p style={{margin:0}}>Bạn có thể mở rộng và cá nhân hóa phần này.</p>
      </div>
    ),
    position: 'left',
  },
  {
    selector: '.ai-button',
    content: () => (
      <div>
        <h3>Trợ lý AI tài chính</h3>
        <p>Hỏi: “Phân tích chi tiêu tuần này?”, “Gợi ý tối ưu ví tiết kiệm?”</p>
        <p style={{margin:0}}>AI có thể gợi ý & tạo giao dịch trực tiếp.</p>
      </div>
    ),
    position: 'top',
  },
];

export default steps;
