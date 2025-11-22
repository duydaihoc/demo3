import React from 'react';

export const savingsGoalSteps = [
  {
    selector: '.tour-goals-component',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>Mục tiêu tiết kiệm</h3>
        <p style={{ margin: 0 }}>
          Đây là nơi bạn đặt các mục tiêu (Du lịch, Quỹ khẩn cấp, Mua xe...)
          và theo dõi tiến độ tiết kiệm cho từng mục tiêu.
        </p>
      </div>
    ),
    position: 'left',
  },
  {
    // Hỗ trợ cả hai trạng thái:
    // - Khi đã có mục tiêu: dùng nút header .add-goal-btn
    // - Khi chưa có mục tiêu: dùng card trống .add-goal-card
    selector: '.add-goal-btn, .add-goal-card',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>Bắt đầu tạo mục tiêu</h3>
        <p style={{ margin: 0 }}>
          Nhấn nút <strong>+ Thêm mục tiêu</strong> để mở form tạo mục tiêu mới.
          Sau đó bấm <strong>Tiếp theo</strong> để xem hướng dẫn chi tiết trong form.
        </p>
      </div>
    ),
    position: 'left',
  },
  {
    selector: '.goal-creation-container .goal-card-preview',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>Thẻ preview mục tiêu</h3>
        <p style={{ margin: 0 }}>
          Thẻ này mô phỏng “thẻ ngân hàng” của mục tiêu: tên, số tiền mục tiêu
          và số ngày còn lại sẽ hiển thị ngay tại đây.
        </p>
      </div>
    ),
    position: 'right',
  },
  {
    selector: '.goal-creation-container #name',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>Đặt tên mục tiêu</h3>
        <p style={{ margin: 0 }}>
          Nhập tên dễ hiểu, ví dụ: <strong>“Quỹ khẩn cấp 3 tháng sống”</strong>{' '}
          hoặc <strong>“Du lịch Đà Lạt cuối năm”</strong>.
        </p>
      </div>
    ),
    position: 'bottom',
  },
  {
    selector: '.goal-creation-container #targetAmount',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>Số tiền mục tiêu</h3>
        <p style={{ margin: 0 }}>
          Nhập tổng số tiền bạn muốn đạt. Hệ thống sẽ dùng con số này để tính %
          hoàn thành và gợi ý gamification.
        </p>
      </div>
    ),
    position: 'bottom',
  },
  {
    selector: '.goal-creation-container #targetDate',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>Ngày muốn đạt được</h3>
        <p style={{ margin: 0 }}>
          Chọn thời hạn kết thúc mục tiêu. Từ đó hệ thống tính ra số ngày còn lại
          và dùng để đánh giá “nhanh / chậm”.
        </p>
      </div>
    ),
    position: 'bottom',
  },
  {
    selector: '.goal-creation-container .color-selector',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>Chọn màu cho mục tiêu</h3>
        <p style={{ margin: 0 }}>
          Chọn một màu đại diện giúp bạn phân biệt các mục tiêu trên thẻ và báo cáo.
          Bạn có thể chọn nhanh ở bảng màu hoặc tự chọn màu riêng.
        </p>
      </div>
    ),
    position: 'bottom',
  },
  {
    selector: '.goal-creation-container .submit-goal-btn',
    content: () => (
      <div style={{ lineHeight: 1.5 }}>
        <h3 style={{ marginBottom: 6 }}>Lưu mục tiêu</h3>
        <p style={{ margin: 0 }}>
          Kiểm tra lại thông tin, sau đó bấm <strong>Tạo mục tiêu</strong>.
          Mục tiêu mới sẽ xuất hiện trong danh sách phía trên và bắt đầu được theo dõi.
        </p>
      </div>
    ),
    position: 'top',
  },
];

export default savingsGoalSteps;


