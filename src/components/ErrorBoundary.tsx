import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    try {
      localStorage.removeItem('pdf_reader_last_opened_id');
    } catch {
      // ignore
    }
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-neutral-50 flex items-center justify-center p-6 select-none font-['Inter',sans-serif]">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-neutral-200 p-6 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
              <AlertTriangle size={28} />
            </div>
            <h2 className="text-lg font-bold text-neutral-900 mb-1">
              Đã xảy ra sự cố hiển thị
            </h2>
            <p className="text-xs text-neutral-500 mb-5 leading-relaxed">
              Ứng dụng đã gặp lỗi và tự động bảo vệ dữ liệu của bạn. Nhấn nút dưới đây để làm mới lại trang.
            </p>
            {this.state.error && (
              <div className="p-3 mb-5 bg-neutral-50 rounded-lg text-left text-[11px] font-mono text-neutral-600 border border-neutral-200 overflow-x-auto max-h-28">
                {this.state.error.message || 'Lỗi không xác định'}
              </div>
            )}
            <div className="flex gap-2 justify-center">
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-neutral-900 text-white text-xs font-semibold rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <RefreshCw size={14} />
                Làm mới trang
              </button>
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-white text-neutral-700 text-xs font-medium rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                Khôi phục trạng thái ban đầu
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
