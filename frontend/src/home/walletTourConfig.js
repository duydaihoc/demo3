import React from 'react';

export const walletCreationSteps = [
  {
    selector: '.wallet-add-card-v2',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>Bước 1/10 – Thêm ví mới</h3>
        <p style={{ margin: 0 }}>
          Nhấn vào thẻ <strong>“Thêm ví mới”</strong> để mở form tạo ví riêng cho bạn.
        </p>
        <p style={{ margin: '6px 0 0', fontWeight: 600, color: '#4ecdc4' }}>
          Tour sẽ đi cùng bạn từ khi đặt tên ví tới khi lưu danh mục.
        </p>
      </div>
    ),
    position: 'left'
  },
  {
    selector: '.wallet-modal-field input[name="name"]',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>Bước 2/10 – Đặt tên ví</h3>
        <p style={{ margin: 0 }}>
          Gợi ý: <strong>“Ví tiền mặt”</strong>, <strong>“VCB lương”</strong>, <strong>“Tiết kiệm 6 tháng”</strong>.
        </p>
        <p style={{ margin: '6px 0 0', color: '#4ecdc4', fontWeight: 600 }}>
          Tên rõ ràng giúp bạn đọc báo cáo nhanh hơn.
        </p>
      </div>
    ),
    position: 'bottom',
    action: () => {
      const el = document.querySelector('.wallet-modal-field input[name="name"]');
      el && el.focus();
    }
  },
  {
    selector: '.wallet-modal-field select[name="currency"]',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>Bước 3/10 – Chọn loại tiền</h3>
        <ul style={{ paddingLeft: 18, margin: '6px 0' }}>
          <li><strong>VND</strong> – dùng cho chi tiêu hàng ngày (mặc định).</li>
          <li><strong>USD / EUR</strong> – dùng cho khoản ngoại tệ nếu có.</li>
        </ul>
        <p style={{ margin: 0, color: '#4ecdc4', fontWeight: 600 }}>
          Bạn vẫn có thể tạo nhiều ví với nhiều loại tiền khác nhau.
        </p>
      </div>
    ),
    position: 'bottom'
  },
  {
    selector: '.wallet-modal-field input[name="initialBalance"]',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>Bước 4/10 – Số dư ban đầu</h3>
        <p style={{ margin: 0 }}>
          Nhập số dư hiện tại của ví. Nếu mới bắt đầu, bạn có thể để <strong>0</strong>.
        </p>
        <p style={{ margin: '6px 0 0', color: '#4ecdc4', fontWeight: 600 }}>
          Chỉ nhập số, không cần ký tự “đ”.
        </p>
      </div>
    ),
    position: 'bottom'
  },
  {
    selector: '.wallet-modal-submit-btn',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>Bước 5/10 – Tạo ví</h3>
        <p style={{ margin: 0 }}>
          Kiểm tra lại tên, loại tiền và số dư, sau đó bấm <strong>Tạo</strong>.
        </p>
        <p style={{ margin: '6px 0 0', color: '#4ecdc4', fontWeight: 600 }}>
          Sau khi tạo, hệ thống sẽ dẫn bạn sang bước chọn danh mục.
        </p>
      </div>
    ),
    position: 'top'
  },
  {
    selector: '.category-modal',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>Bước 6/10 – Chọn danh mục Chi tiêu</h3>
        <p style={{ margin: 0 }}>
          Tab <strong>Chi tiêu</strong> đang mở. Hãy chọn các danh mục bạn thường dùng nhất.
        </p>
        <p style={{ margin: '6px 0 0', color: '#4ecdc4', fontWeight: 600 }}>
          Nên chọn các nhóm lớn: Ăn uống, Đi lại, Hóa đơn, Giải trí...
        </p>
      </div>
    ),
    position: 'bottom'
  },
  {
    selector: '.category-modal',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>Bước 7/10 – Hoàn tất Chi tiêu</h3>
        <p style={{ margin: 0 }}>
          Khi đã chọn xong, hãy chuyển sang tab <strong>Thu nhập</strong> ở phía trên.
        </p>
        <p style={{ margin: '6px 0 0', color: '#4ecdc4', fontWeight: 600 }}>
          Bấm vào tab <strong>“Thu nhập”</strong> để tiếp tục.
        </p>
      </div>
    ),
    position: 'bottom'
  },
  {
    selector: '.category-modal',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>Bước 8/10 – Chọn danh mục Thu nhập</h3>
        <p style={{ margin: 0 }}>
          Chọn các nguồn thu như: <strong>Lương</strong>, <strong>Thưởng</strong>, <strong>Lãi tiết kiệm</strong>, v.v.
        </p>
        <p style={{ margin: '6px 0 0', color: '#4ecdc4', fontWeight: 600 }}>
          Chỉ cần chọn những mục bạn thực sự dùng để báo cáo gọn hơn.
        </p>
      </div>
    ),
    position: 'bottom'
  },
  {
    selector: '.category-modal',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>Bước 9/10 – Kiểm tra lần cuối</h3>
        <p style={{ margin: 0 }}>
          Nhìn nhanh lại số lượng danh mục Chi tiêu và Thu nhập bạn đã tick.
        </p>
        <p style={{ margin: '6px 0 0', color: '#4ecdc4', fontWeight: 600 }}>
          Nếu ổn, bạn đã sẵn sàng lưu cấu hình cho ví này.
        </p>
      </div>
    ),
    position: 'bottom'
  },
  {
    selector: '.category-modal .wallet-modal-submit-btn',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>Bước 10/10 – Lưu & hoàn tất</h3>
        <p style={{ margin: 0 }}>
          Bấm <strong>Lưu danh mục</strong> để hoàn thành việc tạo ví và cấu hình danh mục ban đầu.
        </p>
        <p style={{ margin: '6px 0 0', color: '#27ae60', fontWeight: 600 }}>
          Sau bước này, bạn có thể bắt đầu ghi chép giao dịch với ví mới ngay lập tức.
        </p>
      </div>
    ),
    position: 'top'
  }
];

export default walletCreationSteps;
