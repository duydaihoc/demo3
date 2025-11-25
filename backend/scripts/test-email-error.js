/**
 * Script test gửi email đến địa chỉ không tồn tại
 * Để kiểm tra xem có bắt được error 550 không
 */

require('dotenv').config();
const { sendVerificationEmail } = require('../config/email');

const testEmailError = async () => {
  console.log('🧪 Test gửi email đến địa chỉ không tồn tại\n');
  
  // Email KHÔNG TỒN TẠI
  const fakeEmail = 'duylovemon5@gmail.com';
  const testName = 'Test User';
  const testCode = '123456';
  
  console.log(`📧 Đang test với email: ${fakeEmail}`);
  console.log('⏳ Chờ kết quả...\n');
  
  try {
    const result = await sendVerificationEmail(fakeEmail, testName, testCode);
    
    console.log('\n📊 KẾT QUẢ:');
    console.log('   Success:', result.success);
    console.log('   Error:', result.error);
    console.log('   Response Code:', result.responseCode);
    console.log('   Message ID:', result.messageId);
    
    if (!result.success) {
      console.log('\n✅ PASS: Email error được bắt thành công!');
      console.log('   → Backend sẽ trả về message lỗi cho user');
    } else {
      console.log('\n❌ FAIL: Email được gửi thành công (không nên thế)');
      console.log('   → Gmail có thể accept trước, bounce sau');
      console.log('   → Cần kiểm tra bounce email');
    }
    
  } catch (error) {
    console.error('\n❌ Lỗi không mong đợi:', error);
  }
  
  console.log('\n✨ Test hoàn tất!');
  process.exit(0);
};

testEmailError();


