import React from 'react';
import Sidebar from './Sidebar';

function TransactionsPage() {
  return (
    <div style={{ display: 'flex' }}>
      <Sidebar userName="Nguyễn Văn A" />
      <div style={{ marginLeft: 220, padding: 40, width: '100%' }}>
        <h1>Giao dịch</h1>
        <p>Quản lý và xem các giao dịch tài chính của bạn tại đây.</p>
      </div>
    </div>
  );
}

export default TransactionsPage;
