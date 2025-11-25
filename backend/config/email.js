const nodemailer = require('nodemailer');

// Cấu hình email transporter
const createTransporter = () => {
  // Sử dụng Gmail để gửi email
  // Bạn cần tạo App Password từ Google Account nếu bật 2FA
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER || 'your-email@gmail.com', // Thay bằng email của bạn
      pass: process.env.EMAIL_PASSWORD || 'your-app-password' // Thay bằng app password
    }
  });
};

// Hàm tạo mã xác thực 6 số
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Hàm gửi email xác thực
const sendVerificationEmail = async (email, name, code) => {
  const transporter = createTransporter();
  
  const mailOptions = {
    from: process.env.EMAIL_USER || 'your-email@gmail.com',
    to: email,
    subject: 'Xác thực tài khoản MoneyWise',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              background-color: #f4f4f4;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 20px auto;
              background-color: #ffffff;
              border-radius: 10px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px;
              text-align: center;
            }
            .content {
              padding: 40px 30px;
            }
            .code {
              background-color: #f8f9fa;
              border: 2px dashed #667eea;
              border-radius: 8px;
              padding: 20px;
              text-align: center;
              margin: 30px 0;
            }
            .code-number {
              font-size: 36px;
              font-weight: bold;
              color: #667eea;
              letter-spacing: 8px;
            }
            .footer {
              background-color: #f8f9fa;
              padding: 20px;
              text-align: center;
              color: #6c757d;
              font-size: 14px;
            }
            .button {
              display: inline-block;
              padding: 12px 30px;
              background-color: #667eea;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Chào mừng đến với MoneyWise!</h1>
            </div>
            <div class="content">
              <h2>Xin chào ${name}!</h2>
              <p>Cảm ơn bạn đã đăng ký tài khoản MoneyWise. Để hoàn tất đăng ký, vui lòng nhập mã xác thực dưới đây:</p>
              
              <div class="code">
                <p style="margin: 0; color: #6c757d; font-size: 14px;">Mã xác thực của bạn là:</p>
                <div class="code-number">${code}</div>
                <p style="margin: 10px 0 0 0; color: #6c757d; font-size: 12px;">Mã có hiệu lực trong 10 phút</p>
              </div>
              
              <p style="color: #dc3545; font-size: 14px;">
                <strong>⚠️ Lưu ý:</strong> Không chia sẻ mã này với bất kỳ ai. Chúng tôi sẽ không bao giờ yêu cầu mã xác thực qua điện thoại hoặc email.
              </p>
              
              <p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.</p>
              
              <p>Trân trọng,<br><strong>Đội ngũ MoneyWise</strong></p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} MoneyWise. All rights reserved.</p>
              <p>Email này được gửi tự động, vui lòng không trả lời.</p>
            </div>
          </div>
        </body>
      </html>
    `
  };

  try {
    console.log(`📧 Đang gửi email tới: ${email}`);
    
    // Gửi email
    const info = await transporter.sendMail(mailOptions);
    
    // Log chi tiết
    console.log('✅ Email sent successfully!');
    console.log('   Message ID:', info.messageId);
    console.log('   Accepted:', info.accepted);
    console.log('   Rejected:', info.rejected);
    console.log('   Response:', info.response);
    
    // Kiểm tra nếu email bị reject
    if (info.rejected && info.rejected.length > 0) {
      console.error('❌ Email bị reject:', info.rejected);
      return { 
        success: false, 
        error: 'Invalid email: Email address does not exist or cannot receive messages',
        responseCode: 550 
      };
    }
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending email:');
    console.error('   Error message:', error.message);
    console.error('   Error code:', error.code);
    console.error('   Response code:', error.responseCode);
    console.error('   Command:', error.command);
    
    // Xử lý các loại lỗi cụ thể
    let errorMessage = error.message;
    let responseCode = error.responseCode;
    
    // Lỗi authentication (sai email/password config)
    if (error.code === 'EAUTH' || error.responseCode === 535) {
      errorMessage = 'Authentication failed: Email service not properly configured';
      responseCode = 535;
    }
    // Lỗi email không tồn tại hoặc bị reject (550 5.1.1)
    else if (error.responseCode === 550 || error.responseCode === 551 || error.responseCode === 553) {
      errorMessage = 'Invalid email: Email address does not exist or cannot receive messages';
      responseCode = error.responseCode;
    }
    // Check trong message có chứa "does not exist" hoặc "No such user"
    else if (error.message && (
      error.message.includes('does not exist') || 
      error.message.includes('No such user') ||
      error.message.includes('NoSuchUser') ||
      error.message.includes('User unknown') ||
      error.message.includes('Recipient address rejected')
    )) {
      errorMessage = 'Invalid email: Email address does not exist or cannot receive messages';
      responseCode = 550;
    }
    // Lỗi kết nối
    else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
      errorMessage = 'Connection error: Unable to connect to email server';
    }
    // Lỗi email format
    else if (error.message && error.message.includes('Invalid email')) {
      errorMessage = 'Invalid email: Email format is incorrect';
    }
    
    return { 
      success: false, 
      error: errorMessage, 
      code: error.code, 
      responseCode: responseCode,
      originalError: error.message 
    };
  }
};

module.exports = {
  generateVerificationCode,
  sendVerificationEmail
};

