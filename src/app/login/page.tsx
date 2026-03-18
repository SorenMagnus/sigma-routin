'use client';

import { createClient } from '@/lib/supabase/client';
import { Target, Github, AlertTriangle, KeySquare, Mail, User, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Validation State
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  
  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sigmaId, setSigmaId] = useState('');

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: otpCode,
        type: 'signup'
      });

      if (verifyError) throw verifyError;

      if (verifyData?.user) {
        // [全栈核心联动] - 等待邮箱验证真正通过后，执行档案投射
        const { error: dbError } = await supabase.from('users').insert({
          id: verifyData.user.id,
          username: sigmaId.trim() || verifyData.user.user_metadata?.user_name || 'Sigma User',
          sigma_points_total: 0,
          current_streak: 0,
        });
        
        if (dbError && dbError.code !== '23505') { 
           console.error("Profile Link Error Details:", dbError);
        }
        router.push('/');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'OTP Verification Protocol Failed.');
    } finally {
      setLoading(false);
    }
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      if (isLogin) {
        // --- 登录逻辑 (LOG IN) ---
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push('/');
      } else {
        // --- 注册逻辑 (SIGN UP & PROFILES SYNC) ---
        if (!sigmaId.trim()) throw new Error("必须提供西格玛代号 (Sigma ID)");
        if (sigmaId.length < 3) throw new Error("代号太短，不符合特工编排");
        
        // 1. 注册 Auth 层 (伴生传入 Sigma ID)
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              user_name: sigmaId.trim(),
            }
          }
        });

        if (authError) throw authError;

        // 如果用户在 Auth 注册后并没有获得 session，启用 OTP 高维数字验证模式
        if (!authData?.session) {
           setErrorMsg('⚠️ 特工通讯拦截机触发：验证代码已发送。请输入你的 6 位数安全码。');
           setShowOtpInput(true);
           setLoading(false);
           return;
        }

        // 如果免验证模式直接进
        if (authData?.user) {
          const { error: dbError } = await supabase.from('users').insert({
            id: authData.user.id,
            username: sigmaId.trim(),
            sigma_points_total: 0,
            current_streak: 0,
          });
          
          if (dbError && dbError.code !== '23505') { 
             console.error("Profile Link Error Details:", dbError);
          }
          router.push('/');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication Protocol Failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGithubLogin = async () => {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#ededed] font-sans selection:bg-neutral-800 flex items-center justify-center p-4 relative overflow-hidden">
      
      {/* 极简硬核背景装甲墙 */}
      <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: 'radial-gradient(#333 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-emerald-900 rounded-full blur-[150px] opacity-10 pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        
        {/* LOGO & TITLE */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-neutral-900 border border-neutral-800 rounded-2xl flex items-center justify-center mb-6 shadow-2xl relative overflow-hidden group">
             <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
             <Target className="w-8 h-8 text-neutral-300 relative z-10" />
          </div>
          <h1 className="text-3xl font-black tracking-tighter mb-2 font-mono uppercase">Sigma <span className="text-emerald-500">Protocol</span></h1>
          <p className="text-xs text-neutral-600 font-bold tracking-[0.2em] uppercase">Global Discipline Network</p>
        </div>

        {/* 核心登录 / 注册盒子 */}
        <div className="bg-[#0f0f0f] border border-neutral-800/80 rounded-2xl p-8 shadow-2xl backdrop-blur-xl transition-all h-[550px]">
          
          {/* TAB 切换 */}
          <div className="flex relative mb-8 bg-[#1a1a1a] p-1 rounded-xl">
             <button 
               onClick={() => { setIsLogin(false); setErrorMsg(''); setShowOtpInput(false); }}
               className={`flex-1 py-3 text-xs font-bold tracking-widest uppercase transition-all rounded-lg z-10 ${!isLogin ? 'text-white shadow-md' : 'text-neutral-500 hover:text-neutral-300'}`}
             >
               新特工注册
             </button>
             <button 
               onClick={() => { setIsLogin(true); setErrorMsg(''); setShowOtpInput(false); }}
               className={`flex-1 py-3 text-xs font-bold tracking-widest uppercase transition-all rounded-lg z-10 ${isLogin ? 'text-white shadow-md' : 'text-neutral-500 hover:text-neutral-300'}`}
             >
               身份验证
             </button>
             {/* 滑块特效 */}
             <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-[#2a2a2a] border border-neutral-700/50 rounded-lg transition-transform duration-300 ease-in-out ${isLogin ? 'translate-x-[calc(100%+0px)]' : 'translate-x-0'}`}></div>
          </div>

          {!showOtpInput ? (
            <form onSubmit={handleAuth} className="space-y-5 animate-in fade-in zoom-in duration-300">
              {/* 动态显示的错误信息 */}
              {errorMsg && (
                <div className="flex items-start gap-3 p-4 bg-red-950/30 border border-red-900/50 rounded-xl">
                   <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                   <span className="text-xs font-mono text-red-400 font-medium leading-relaxed">{errorMsg}</span>
                </div>
              )}

              {/* Sigma ID 仅在注册时显示 */}
              {!isLogin && (
                <div className="space-y-1 group">
                  <label className="text-[10px] font-bold tracking-widest uppercase text-neutral-500 ml-1 group-focus-within:text-emerald-500 transition-colors">代号 (Sigma ID)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><User className="w-4 h-4 text-neutral-600" /></div>
                    <input required={!isLogin} type="text" value={sigmaId} onChange={(e) => setSigmaId(e.target.value)} placeholder="ENTER YOUR CODENAME" className="w-full bg-[#141414] border border-neutral-800 rounded-xl pl-11 pr-4 py-4 text-sm focus:outline-none focus:border-emerald-500/50 focus:bg-[#1a1a1a] transition-all placeholder-neutral-700 text-white font-mono" />
                  </div>
                </div>
              )}

              <div className="space-y-1 group">
                <label className="text-[10px] font-bold tracking-widest uppercase text-neutral-500 ml-1 group-focus-within:text-emerald-500 transition-colors">通讯邮箱 (Email)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Mail className="w-4 h-4 text-neutral-600" /></div>
                  <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="AGENT@DOMAIN.COM" className="w-full bg-[#141414] border border-neutral-800 rounded-xl pl-11 pr-4 py-4 text-sm focus:outline-none focus:border-emerald-500/50 focus:bg-[#1a1a1a] transition-all placeholder-neutral-700 text-white font-mono" />
                </div>
              </div>

              <div className="space-y-1 group mb-8">
                <label className="text-[10px] font-bold tracking-widest uppercase text-neutral-500 ml-1 group-focus-within:text-emerald-500 transition-colors">加密密钥 (Password)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><KeySquare className="w-4 h-4 text-neutral-600" /></div>
                  <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••" className="w-full bg-[#141414] border border-neutral-800 rounded-xl pl-11 pr-4 py-4 text-sm focus:outline-none focus:border-emerald-500/50 focus:bg-[#1a1a1a] transition-all placeholder-neutral-700 text-white font-mono tracking-widest" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full group flex items-center justify-center gap-3 px-6 py-4 bg-white hover:bg-neutral-200 text-black border-none transition-all rounded-xl active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
              >
                <span className="text-sm font-black tracking-widest uppercase">
                  {loading ? "PROCESSING..." : (isLogin ? "验证并登入系统 (INITIATE)" : "确立契约并注册 (CONFIRM)") }
                </span>
                {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-5 animate-in slide-in-from-right-8 duration-300">
              <div className="flex items-start gap-3 p-4 bg-emerald-950/30 border border-emerald-900/50 rounded-xl mb-4">
                 <Target className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                 <div className="flex flex-col gap-1">
                   <span className="text-xs font-mono text-emerald-400 font-bold uppercase tracking-widest">拦截确认 (VERIFICATION)</span>
                   <span className="text-xs text-neutral-400 leading-relaxed">系统已将高强度防伪码发送至 <span className="text-white font-mono">{email}</span>，请输入代码激活你的西格玛档案。</span>
                 </div>
              </div>

              <div className="space-y-1 group mb-8 mt-6">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><KeySquare className="w-4 h-4 text-neutral-600" /></div>
                  <input required autoFocus type="text" maxLength={8} value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="ENTER CODE" className="w-full bg-[#141414] border border-neutral-800 rounded-xl pl-11 pr-4 py-5 text-2xl text-center tracking-[0.4em] focus:outline-none focus:border-emerald-500/50 focus:bg-[#1a1a1a] transition-all placeholder-neutral-800 text-emerald-500 font-mono font-black" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || otpCode.length < 6}
                className="w-full group flex items-center justify-center gap-3 px-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white border-none transition-all rounded-xl active:scale-95 disabled:opacity-50 disabled:bg-neutral-800 disabled:text-neutral-500"
              >
                <span className="text-sm font-black tracking-widest uppercase">
                  {loading ? "DECRYPTING..." : "强制授权访问 (VERIFY CODE)" }
                </span>
                {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
              </button>
              
              <button 
                type="button"
                onClick={() => setShowOtpInput(false)}
                className="w-full text-center text-[10px] text-neutral-600 uppercase tracking-widest hover:text-white transition-colors pt-4"
              >
                 重新核对邮箱并后退
              </button>
            </form>
          )}
          
          {/* OR 分割线 */}
          <div className="flex items-center my-8">
             <div className="flex-1 border-t border-neutral-800"></div>
             <span className="px-4 text-[10px] font-mono tracking-widest text-neutral-600 uppercase">External Routes</span>
             <div className="flex-1 border-t border-neutral-800"></div>
          </div>

          <button
            onClick={handleGithubLogin}
            disabled={loading}
            className="w-full relative group flex items-center justify-center gap-3 px-6 py-4 bg-[#141414] hover:bg-[#1a1a1a] border border-neutral-800 hover:border-neutral-700 transition-all rounded-xl active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none text-neutral-400 hover:text-white"
          >
             <Github className="w-5 h-5" />
             <span className="text-xs font-bold tracking-widest uppercase">
               GitHub 快捷授权通道
             </span>
          </button>
        </div>
        
      </div>
    </div>
  );
}
