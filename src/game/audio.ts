class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private playTone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType = 'triangle',
    gainPeak = 0.14,
    delay = 0,
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const jitter = 0.94 + Math.random() * 0.12;
    osc.type = type;
    osc.frequency.setValueAtTime(freq * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq * jitter), now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playTill() {
    this.playTone(170, 75, 0.11, 'sawtooth', 0.12);
    this.playTone(110, 60, 0.09, 'triangle', 0.14, 0.03);
  }

  public playPlant() {
    this.playTone(320, 480, 0.08, 'sine', 0.11);
    this.playTone(440, 560, 0.07, 'triangle', 0.08, 0.04);
  }

  public playWater() {
    this.playTone(520, 290, 0.14, 'sine', 0.09);
    this.playTone(680, 380, 0.12, 'sine', 0.07, 0.05);
  }

  public playHarvest() {
    this.playTone(523.25, 659.25, 0.1, 'triangle', 0.13);
    this.playTone(659.25, 783.99, 0.12, 'triangle', 0.13, 0.06);
    this.playTone(783.99, 1046.5, 0.16, 'sine', 0.11, 0.12);
  }

  public playCoin() {
    this.playTone(987.77, 987.77, 0.08, 'square', 0.07);
    this.playTone(1318.51, 1318.51, 0.18, 'triangle', 0.11, 0.06);
  }

  public playUpgrade() {
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((n, idx) => {
      this.playTone(n, n * 1.02, 0.14, 'triangle', 0.12, idx * 0.065);
    });
  }

  public playError() {
    this.playTone(210, 145, 0.15, 'sawtooth', 0.09);
  }
}

export const soundEngine = new SoundEngine();
