import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  BarChart2,
  ChevronDown,
  Flame,
  LogOut,
  Menu,
  Microscope,
  Mountain,
  Thermometer,
  User,
  X,
} from 'lucide-react';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [thermoOpen, setThermoOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setThermoOpen(false);
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setThermoOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;
  const isThermoActive = isActive('/thermometer') || isActive('/biotite-thermometer');

  const linkClass = (path: string) =>
    `inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
      isActive(path) ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-200 hover:bg-white/5 hover:text-white'
    }`;

  const mobileLinkClass = (path: string) =>
    `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${
      isActive(path) ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-200 hover:bg-white/5 hover:text-white'
    }`;

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/95 text-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.9)] backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-400/20">
                <Mountain className="h-5 w-5 text-emerald-300" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-[0.18em] text-emerald-300/80">GEO TOOLKIT</p>
                <p className="truncate text-base font-semibold text-white">地质工具百宝箱</p>
              </div>
            </Link>

            <div className="hidden md:flex items-center gap-1">
              <Link to="/" className={linkClass('/')}>
                科普与指南
              </Link>

              <div ref={dropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setThermoOpen((open) => !open)}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                    isThermoActive ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-200 hover:bg-white/5 hover:text-white'
                  }`}
                  aria-expanded={thermoOpen}
                >
                  <Thermometer className="h-4 w-4" />
                  矿物温度计
                  <ChevronDown className={`h-4 w-4 transition-transform ${thermoOpen ? 'rotate-180' : ''}`} />
                </button>

                {thermoOpen && (
                  <div className="absolute left-0 top-full mt-2 w-64 overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-900/95 p-2 shadow-2xl backdrop-blur">
                    <Link
                      to="/thermometer"
                      className="flex items-start gap-3 rounded-2xl px-4 py-3 text-sm text-slate-100 transition-colors hover:bg-white/5"
                    >
                      <Thermometer className="mt-0.5 h-4 w-4 text-indigo-300" />
                      <div>
                        <div className="font-medium">绿泥石温度计</div>
                        <div className="mt-0.5 text-xs text-slate-400">高温组 / 低温组多公式结果对比</div>
                      </div>
                    </Link>
                    <Link
                      to="/biotite-thermometer"
                      className="flex items-start gap-3 rounded-2xl px-4 py-3 text-sm text-slate-100 transition-colors hover:bg-white/5"
                    >
                      <Flame className="mt-0.5 h-4 w-4 text-amber-300" />
                      <div>
                        <div className="font-medium">黑云母温度计</div>
                        <div className="mt-0.5 text-xs text-slate-400">Ti-in-Biotite 温度与分类解释</div>
                      </div>
                    </Link>
                  </div>
                )}
              </div>

              <Link to="/identification" className={linkClass('/identification')}>
                <Microscope className="h-4 w-4" />
                矿物识别
              </Link>
              <Link to="/visualization" className={linkClass('/visualization')}>
                <BarChart2 className="h-4 w-4" />
                可视化图件
              </Link>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300">
                  <User className="h-4 w-4" />
                  <span>{user.username}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-red-400/40 hover:text-red-300"
                >
                  <LogOut className="h-4 w-4" />
                  退出
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="rounded-full px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5 hover:text-white">
                  登录
                </Link>
                <Link to="/register" className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-400">
                  注册
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-slate-200"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden border-t border-slate-800 py-4">
            <div className="space-y-2">
              <Link to="/" className={mobileLinkClass('/')}>
                科普与指南
              </Link>
              <Link to="/thermometer" className={mobileLinkClass('/thermometer')}>
                <Thermometer className="h-4 w-4" />
                绿泥石温度计
              </Link>
              <Link to="/biotite-thermometer" className={mobileLinkClass('/biotite-thermometer')}>
                <Flame className="h-4 w-4" />
                黑云母温度计
              </Link>
              <Link to="/identification" className={mobileLinkClass('/identification')}>
                <Microscope className="h-4 w-4" />
                矿物识别
              </Link>
              <Link to="/visualization" className={mobileLinkClass('/visualization')}>
                <BarChart2 className="h-4 w-4" />
                可视化图件
              </Link>
            </div>

            <div className="mt-4 border-t border-slate-800 pt-4">
              {user ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-300">
                    <User className="h-4 w-4" />
                    <span>{user.username}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-800 px-4 py-3 text-sm font-medium text-slate-200"
                  >
                    <LogOut className="h-4 w-4" />
                    退出
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Link to="/login" className="flex items-center justify-center rounded-2xl border border-slate-800 px-4 py-3 text-sm font-medium text-slate-200">
                    登录
                  </Link>
                  <Link to="/register" className="flex items-center justify-center rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-medium text-white">
                    注册
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
