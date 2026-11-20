import React, { useState } from 'react';
import { TitleCrestSvg, CoinSvg, LandPlotSvg } from './VoxelIcons';

interface TitleAuthOverlayProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (nickname: string, email: string, password: string) => Promise<void>;
  onStartDemo: (nickname: string) => void;
  authBusy: boolean;
  authError: string | null;
}

export function TitleAuthOverlay({
  onLogin,
  onRegister,
  onStartDemo,
  authBusy,
  authError,
}: TitleAuthOverlayProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (tab === 'register') {
      const cleanNick = nickname.trim();
      if (cleanNick.length < 2 || cleanNick.length > 16) {
        setLocalError('Нікнейм має бути від 2 до 16 символів.');
        return;
      }
      if (!email.trim().includes('@')) {
        setLocalError('Введіть коректну електронну пошту.');
        return;
      }
      if (password.length < 6) {
        setLocalError('Пароль має містити щонайменше 6 символів.');
        return;
      }
      await onRegister(cleanNick, email, password);
    } else {
      if (!email.trim().includes('@')) {
        setLocalError('Введіть електронну пошту.');
        return;
      }
      if (password.length < 1) {
        setLocalError('Введіть пароль.');
        return;
      }
      await onLogin(email, password);
    }
  };

  const handleDemoClick = () => {
    const cleanNick = nickname.trim();
    const demoNick = cleanNick.length >= 2 ? cleanNick.slice(0, 16) : 'Коваль_Фермер';
    onStartDemo(demoNick);
  };

  const shownError = localError || authError;

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-5 sm:p-8 pointer-events-none">
      {/* Left Asymmetric Auth & Title Lockup leaving right 60% live 3D voxel world unobstructed */}
      <div className="flex-1 flex items-center">
        <div
          className="w-full max-w-[400px] pointer-events-auto rounded-2xl p-6 shadow-2xl border-2"
          style={{
            backgroundColor: 'rgba(28, 25, 23, 0.92)',
            borderColor: '#d97706',
            color: '#fef3c7',
          }}
        >
          <div className="mb-4">
            <TitleCrestSvg />
          </div>

          {/* Starter Perk Strip */}
          <div
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg mb-4 text-xs font-semibold border"
            style={{
              backgroundColor: 'rgba(63, 98, 18, 0.45)',
              borderColor: 'rgba(163, 230, 53, 0.35)',
              color: '#ecfccb',
            }}
          >
            <span className="flex items-center gap-1.5">
              <LandPlotSvg className="w-4 h-4" />1 квадрат безкоштовно
            </span>
            <span className="flex items-center gap-1.5">
              <CoinSvg className="w-4 h-4" />
              20 стартових монет
            </span>
          </div>

          {/* Auth Mode Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl mb-4" style={{ backgroundColor: '#171412' }}>
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setLocalError(null);
              }}
              className={`py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
                tab === 'login'
                  ? 'bg-amber-600 text-stone-950'
                  : 'text-amber-200/80 hover:text-amber-100'
              }`}
            >
              Вхід
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                setLocalError(null);
              }}
              className={`py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
                tab === 'register'
                  ? 'bg-amber-600 text-stone-950'
                  : 'text-amber-200/80 hover:text-amber-100'
              }`}
            >
              Реєстрація
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            {tab === 'register' && (
              <div>
                <label htmlFor="auth-nickname" className="block text-xs font-bold uppercase tracking-wider text-amber-200/90 mb-1">
                  Нікнейм у грі (над головою)
                </label>
                <input
                  id="auth-nickname"
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Напр. Волинянин_99"
                  maxLength={16}
                  className="w-full px-3 py-2 rounded-lg bg-stone-900 border border-amber-700/60 text-amber-50 placeholder-stone-500 text-sm focus:outline-none focus:border-amber-400"
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-xs font-bold uppercase tracking-wider text-amber-200/90 mb-1">
                Електронна пошта
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="farmer@kovel.ua"
                className="w-full px-3 py-2 rounded-lg bg-stone-900 border border-amber-700/60 text-amber-50 placeholder-stone-500 text-sm focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs font-bold uppercase tracking-wider text-amber-200/90 mb-1">
                Пароль
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="w-full px-3 py-2 rounded-lg bg-stone-900 border border-amber-700/60 text-amber-50 placeholder-stone-500 text-sm focus:outline-none focus:border-amber-400"
              />
            </div>

            {shownError && (
              <div
                role="alert"
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-red-950/90 border border-red-500/70 text-red-200"
              >
                {shownError}
              </div>
            )}

            <button
              type="submit"
              disabled={authBusy}
              className="w-full py-2.5 rounded-xl font-extrabold text-sm tracking-wide bg-amber-500 hover:bg-amber-400 text-stone-950 transition-colors cursor-pointer disabled:opacity-60"
            >
              {authBusy
                ? 'Підключення до Firebase...'
                : tab === 'register'
                  ? 'Створити ферму та увійти'
                  : 'Увійти у світ'}
            </button>
          </form>

          <div className="mt-3 pt-3 border-t border-stone-700/80">
            <button
              type="button"
              data-start="true"
              onClick={handleDemoClick}
              disabled={authBusy}
              className="w-full py-2.5 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
            >
              Швидкий старт (Оглядовий режим)
            </button>
          </div>
        </div>
      </div>

      {/* Single flat control hint line */}
      <div className="text-center pointer-events-none">
        <p
          className="inline-block px-4 py-1.5 rounded-lg text-xs font-bold tracking-wide"
          style={{
            backgroundColor: 'rgba(20, 24, 20, 0.82)',
            color: '#fef3c7',
          }}
        >
          WASD / Стрілки — Рух · Клік / E — Дія · Q / E — Камера · I — Інвентар · B — Крамниця · Enter — Чат
        </p>
      </div>
    </div>
  );
}
