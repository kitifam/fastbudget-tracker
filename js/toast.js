// ===================================================
// Toast — แจ้งเตือนมุมขวาบน แสดงแป๊บเดียวแล้วหายไป
// ===================================================

const Toast = {
  container: null,
  activeTimers: new WeakMap(),

  init() {
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2';
    document.body.appendChild(this.container);
  },

  // type: 'success' | 'error' | 'info' | 'warning' | 'caution'
  show(message, type = 'success', duration = 3000) {
    if (!this.container) this.init();

    const toast = document.createElement('div');

    const colors = {
      success: 'bg-emerald-500 text-white',
      error: 'bg-red-500 text-white',
      info: 'bg-blue-500 text-white',
      warning: 'bg-amber-500 text-white',
      caution: 'bg-yellow-500 text-slate-900'
    };

    const icons = {
      success: 'check-circle',
      error: 'alert-circle',
      info: 'info',
      warning: 'alert-triangle',
      caution: 'alert-octagon'
    };

    toast.className = `
      ${colors[type] || colors.info} px-4 py-3 rounded-lg shadow-lg
      flex items-center gap-2 min-w-72
      transform translate-x-full opacity-0
      transition-all duration-300 ease-out
    `;

    toast.innerHTML = `
      <i data-lucide="${icons[type]}" class="w-5 h-5 shrink-0"></i>
      <span class="text-sm font-medium">${message}</span>
    `;

    const progressColor = {
      success: 'rgba(255,255,255,0.95)',
      error: 'rgba(255,255,255,0.95)',
      warning: 'rgba(255,255,255,0.95)',
      caution: 'rgba(15,23,42,0.85)',
      info: 'rgba(255,255,255,0.95)',
    };
    const progress = document.createElement('div');
    progress.className = 'absolute left-0 right-0 bottom-0 h-1 rounded-b-lg';
    progress.style.background = progressColor[type] || progressColor.info;
    progress.style.transformOrigin = 'left center';
    progress.style.transform = 'scaleX(1)';
    progress.style.transition = 'transform 0.05s linear';
    toast.appendChild(progress);

    this.container.appendChild(toast);
    lucide.createIcons();

    // Animation เข้า
    requestAnimationFrame(() => {
      toast.classList.remove('translate-x-full', 'opacity-0');
      toast.classList.add('translate-x-0', 'opacity-100');
    });

    const timerState = {
      startTs: performance.now(),
      elapsed: 0,
      paused: false,
      rafId: null,
      timeoutId: null,
      remaining: duration,
    };
    this.activeTimers.set(toast, timerState);

    const step = () => {
      const state = this.activeTimers.get(toast);
      if (!state || state.paused) return;
      const now = performance.now();
      state.elapsed = now - state.startTs;
      state.remaining = Math.max(duration - state.elapsed, 0);
      const ratio = state.remaining / duration;
      progress.style.transform = `scaleX(${ratio})`;
      if (state.remaining > 0) {
        state.rafId = requestAnimationFrame(step);
      }
    };

    const removeToast = () => {
      toast.classList.remove('translate-x-0', 'opacity-100');
      toast.classList.add('translate-x-full', 'opacity-0');
      setTimeout(() => {
        const state = this.activeTimers.get(toast);
        if (state?.rafId) cancelAnimationFrame(state.rafId);
        this.activeTimers.delete(toast);
        toast.remove();
      }, 300);
    };

    const scheduleRemoval = (ms) => {
      const state = this.activeTimers.get(toast);
      if (!state) return;
      if (state.timeoutId) clearTimeout(state.timeoutId);
      state.timeoutId = setTimeout(removeToast, ms);
    };

    scheduleRemoval(duration);
    timerState.rafId = requestAnimationFrame(step);

    toast.addEventListener('mouseenter', () => {
      const state = this.activeTimers.get(toast);
      if (!state || state.paused) return;
      state.paused = true;
      state.elapsed = performance.now() - state.startTs;
      state.remaining = Math.max(duration - state.elapsed, 0);
      if (state.timeoutId) clearTimeout(state.timeoutId);
      if (state.rafId) cancelAnimationFrame(state.rafId);
    });

    toast.addEventListener('mouseleave', () => {
      const state = this.activeTimers.get(toast);
      if (!state || !state.paused) return;
      state.paused = false;
      state.startTs = performance.now() - state.elapsed;
      scheduleRemoval(state.remaining);
      state.rafId = requestAnimationFrame(step);
    });
  }
};