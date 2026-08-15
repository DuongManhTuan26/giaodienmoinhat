import React, { useState } from 'react';

export default function Auth({ onLogin, onRegister }: { onLogin: () => void, onRegister: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const password = formData.get('password') as string;

    if (mode === 'login') {
      // Demo logic: fail if password is exactly "wrong"
      if (password === 'wrong') {
        setError('Email hoặc mật khẩu không đúng');
        return;
      }
      onLogin();
    } else {
      onRegister();
    }
  }

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-background relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Logo Placeholder */}
      <div className="w-16 h-16 border border-outline-variant rounded-xl flex items-center justify-center mb-8 bg-surface-container/50 relative z-10">
        <span className="font-label-sm text-on-surface-variant uppercase tracking-widest text-[10px]">Logo</span>
      </div>

      {/* Card */}
      <div className="glass-card ai-border rounded-xl w-full max-w-[440px] shadow-[0_0_30px_rgba(0,229,255,0.05)] relative z-10 flex flex-col overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-outline-variant">
          <button 
            type="button"
            className={`flex-1 py-4 font-label-sm font-bold transition-colors ${mode === 'login' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'}`}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Đăng nhập
          </button>
          <button 
            type="button"
            className={`flex-1 py-4 font-label-sm font-bold transition-colors ${mode === 'register' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'}`}
            onClick={() => { setMode('register'); setError(''); }}
          >
            Đăng ký
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-md flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-label-sm text-on-surface">Email</label>
            <input 
              type="email" 
              name="email" 
              required 
              className="w-full bg-surface-container-high border border-outline focus:border-primary rounded-lg px-4 py-3 text-on-surface outline-none transition-colors" 
              placeholder="name@example.com" 
            />
          </div>
          
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="font-label-sm text-on-surface">Mật khẩu</label>
              {mode === 'login' && <a href="#" className="font-body-md text-primary text-sm hover:underline">Quên mật khẩu?</a>}
            </div>
            <input 
              type="password" 
              name="password"
              required 
              className={`w-full bg-surface-container-high border ${error ? 'border-error' : 'border-outline focus:border-primary'} rounded-lg px-4 py-3 text-on-surface outline-none transition-colors`} 
              placeholder="••••••••" 
            />
            {error && mode === 'login' && <p className="text-error font-body-md text-sm mt-1">{error}</p>}
          </div>

          {mode === 'register' && (
            <div className="flex flex-col gap-1.5">
              <label className="font-label-sm text-on-surface">Nhập lại mật khẩu</label>
              <input 
                type="password" 
                required 
                className="w-full bg-surface-container-high border border-outline focus:border-primary rounded-lg px-4 py-3 text-on-surface outline-none transition-colors" 
                placeholder="••••••••" 
              />
            </div>
          )}

          <button 
            type="submit" 
            className="w-full py-4 bg-gradient-to-r from-primary to-primary-container text-on-primary font-label-sm rounded-lg shadow-[0_0_15px_rgba(0,229,255,0.4)] hover:shadow-[0_0_25px_rgba(0,229,255,0.6)] hover:brightness-110 transition-all font-bold mt-2 text-lg"
          >
            {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
          </button>

          {mode === 'register' && (
            <p className="text-center font-body-md text-sm text-on-surface-variant mt-2">
              Đã có tài khoản? <button type="button" onClick={() => { setMode('login'); setError(''); }} className="text-primary hover:underline font-bold">Đăng nhập</button>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
