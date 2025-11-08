import React from 'react';

export const walletCreationSteps = [
  {
    selector: '.wallet-add-card-v2',
    content: () => (
      <div>
        <h3>🧱 Bước 1: Thêm ví mới</h3>
        <p>Bấm vào thẻ <strong>Thêm ví mới</strong> để mở form tạo ví.</p>
        <p style={{margin:0,fontWeight:600,color:'#4ecdc4'}}>Tour không mở tự động.</p>
      </div>
    ),
    position: 'left'
  },
  {
    selector: '.wallet-modal-field input[name="name"]',
    content: () => (
      <div>
        <h3>✍️ Bước 2: Nhập tên ví</h3>
        <p>Ví dụ: “Ví tiền mặt”, “Tài khoản VCB”.</p>
        <p style={{margin:0,color:'#4ecdc4',fontWeight:600}}>Nhập xong chuyển bước.</p>
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
      <div>
        <h3>💱 Bước 3: Chọn loại tiền</h3>
        <ul style={{paddingLeft:18,margin:'6px 0'}}>
          <li>VND (mặc định)</li>
          <li>USD / EUR nếu cần</li>
        </ul>
        <p style={{margin:0,color:'#4ecdc4',fontWeight:600}}>Chọn xong tiếp tục.</p>
      </div>
    ),
    position: 'bottom'
  },
  {
    selector: '.wallet-modal-field input[name="initialBalance"]',
    content: () => (
      <div>
        <h3>💰 Bước 4: Nhập số dư ban đầu</h3>
        <p>Có thể để 0 nếu bắt đầu mới.</p>
        <p style={{margin:0,color:'#4ecdc4',fontWeight:600}}>Chỉ nhập số.</p>
      </div>
    ),
    position: 'bottom'
  },
  {
    selector: '.wallet-modal-submit-btn',
    content: () => (
      <div>
        <h3>🚀 Bước 5: Tạo ví</h3>
        <p>Kiểm tra rồi bấm <strong>Tạo</strong>.</p>
        <p style={{margin:0,color:'#4ecdc4',fontWeight:600}}>Tự chuyển qua chọn danh mục.</p>
      </div>
    ),
    position: 'top'
  },
  {
    selector: '.category-modal',
    content: () => (
      <div>
        <h3>🗂️ Bước 6: Chuẩn bị chọn Chi tiêu</h3>
        <p>Tab <strong>Chi tiêu</strong> đang mở. Chọn các danh mục thường dùng.</p>
        <p style={{margin:0,color:'#4ecdc4',fontWeight:600}}>Chọn ít nhất 1 danh mục.</p>
      </div>
    ),
    position: 'bottom'
  },
  {
    selector: '.category-modal',
    content: () => (
      <div>
        <h3>✅ Bước 7: Đã chọn Chi tiêu</h3>
        <p>Chuyển sang tab <strong>Thu nhập</strong> để chọn tiếp.</p>
        <p style={{margin:0,color:'#4ecdc4',fontWeight:600}}>Bấm “Thu nhập”.</p>
      </div>
    ),
    position: 'bottom'
  },
  {
    selector: '.category-modal',
    content: () => (
      <div>
        <h3>📥 Bước 8: Chọn Thu nhập</h3>
        <p>Chọn: Lương, Thưởng, Lãi,... những gì bạn dùng.</p>
        <p style={{margin:0,color:'#4ecdc4',fontWeight:600}}>Chọn ít nhất 1.</p>
      </div>
    ),
    position: 'bottom'
  },
  {
    selector: '.category-modal',
    content: () => (
      <div>
        <h3>👍 Bước 9: Đã chọn Thu nhập</h3>
        <p>Kiểm tra lại số lượng danh mục đã chọn.</p>
        <p style={{margin:0,color:'#4ecdc4',fontWeight:600}}>Sẵn sàng lưu.</p>
      </div>
    ),
    position: 'bottom'
  },
  {
    selector: '.category-modal .wallet-modal-submit-btn',
    content: () => (
      <div>
        <h3>🎉 Bước 10: Lưu & Hoàn tất</h3>
        <p>Bấm <strong>Lưu danh mục</strong> để hoàn thành.</p>
        <p style={{margin:0,color:'#27ae60',fontWeight:600}}>Tour sẽ tự kết thúc.</p>
      </div>
    ),
    position: 'top'
  }
];

export default walletCreationSteps;
