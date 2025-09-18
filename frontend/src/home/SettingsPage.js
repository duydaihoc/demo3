import React from 'react';
import Sidebar from './Sidebar';

function SettingsPage() {
  return (
    <div style={{ display: 'flex' }}>
      <Sidebar userName="Nguyễn Văn A" />
      <div style={{ marginLeft: 220, padding: 40, width: '100%' }}>
        <h1>Cài đặt</h1>
        <p>Thay đổi thông tin cá nhân và thiết lập hệ thống tại đây.</p>
      </div>
    </div>
  );
}

export default SettingsPage;
