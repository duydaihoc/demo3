import React, { useState } from 'react';
import './ExportModal.css';

function ExportModal({ isOpen, onClose, onExport, selectedWallet, walletName, periodText }) {
  const [exportFormat, setExportFormat] = useState('csv');
  const [loading, setLoading] = useState(false);
  const [includeDetails, setIncludeDetails] = useState(true);
  
  if (!isOpen) return null;

  const handleExport = async () => {
    setLoading(true);
    try {
      await onExport(exportFormat, includeDetails);
      setTimeout(() => onClose(), 800); // Close after successful export
    } catch (err) {
      console.error('Export error:', err);
      alert('Lỗi khi xuất báo cáo: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="export-modal-overlay">
      <div className="export-modal">
        <div className="export-modal-header">
          <h2 className="export-modal-title">Xuất Báo Cáo</h2>
          <button className="export-modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="export-modal-body">
          <div className="export-info">
            <div className="export-info-item">
              <strong>Ví:</strong> {walletName || 'Tất cả ví'}
            </div>
            <div className="export-info-item">
              <strong>Kỳ báo cáo:</strong> {periodText || 'Tháng hiện tại'}
            </div>
          </div>
          
          <div className="export-options">
            <h3>Chọn Định dạng</h3>
            
            <div className="export-format-options">
              <label className={`export-format-option ${exportFormat === 'csv' ? 'selected' : ''}`}>
                <input 
                  type="radio" 
                  name="format" 
                  value="csv" 
                  checked={exportFormat === 'csv'}
                  onChange={() => setExportFormat('csv')}
                />
                <div className="format-icon">
                  <span className="material-icon">📄</span>
                </div>
                <div className="format-info">
                  <div className="format-name">CSV</div>
                  <div className="format-desc">Định dạng dữ liệu dạng bảng, dễ mở với Excel</div>
                </div>
              </label>
              
              <label className={`export-format-option ${exportFormat === 'excel' ? 'selected' : ''}`}>
                <input 
                  type="radio" 
                  name="format" 
                  value="excel" 
                  checked={exportFormat === 'excel'}
                  onChange={() => setExportFormat('excel')}
                />
                <div className="format-icon">
                  <span className="material-icon">📊</span>
                </div>
                <div className="format-info">
                  <div className="format-name">Excel</div>
                  <div className="format-desc">Tệp Excel .xlsx với định dạng đẹp</div>
                </div>
              </label>
              
              <label className={`export-format-option ${exportFormat === 'pdf' ? 'selected' : ''}`}>
                <input 
                  type="radio" 
                  name="format" 
                  value="pdf" 
                  checked={exportFormat === 'pdf'}
                  onChange={() => setExportFormat('pdf')}
                />
                <div className="format-icon">
                  <span className="material-icon">📑</span>
                </div>
                <div className="format-info">
                  <div className="format-name">PDF</div>
                  <div className="format-desc">Tài liệu PDF dễ chia sẻ và in ấn</div>
                </div>
              </label>
              
              <label className={`export-format-option ${exportFormat === 'print' ? 'selected' : ''}`}>
                <input 
                  type="radio" 
                  name="format" 
                  value="print" 
                  checked={exportFormat === 'print'}
                  onChange={() => setExportFormat('print')}
                />
                <div className="format-icon">
                  <span className="material-icon">🖨️</span>
                </div>
                <div className="format-info">
                  <div className="format-name">In trực tiếp</div>
                  <div className="format-desc">Mở trang in trong trình duyệt</div>
                </div>
              </label>
            </div>
            
            <div className="export-options-additional">
              <label className="checkbox-label">
                <input 
                  type="checkbox"
                  checked={includeDetails}
                  onChange={() => setIncludeDetails(!includeDetails)}
                />
                <span>Bao gồm các ghi chú và thông tin chi tiết</span>
              </label>
            </div>
          </div>
        </div>
        
        <div className="export-modal-footer">
          <button className="export-cancel-btn" onClick={onClose} disabled={loading}>
            Hủy
          </button>
          <button className="export-submit-btn" onClick={handleExport} disabled={loading}>
            {loading ? 'Đang xuất...' : 'Xuất Báo Cáo'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ExportModal;
