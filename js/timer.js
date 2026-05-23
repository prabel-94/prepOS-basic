// js/timer.js

export class TimerEngine {
  constructor({ duration, startedAt }) {
    this.duration = duration;     // seconds
    this.startedAt = startedAt;   // timestamp
    this.interval = null;
    this.onTick = () => {};
    this.onEnd = () => {};
  }

  getElapsed() {
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }

  getRemaining() {
    return Math.max(this.duration - this.getElapsed(), 0);
  }

  start({ onTick, onEnd }) {
    this.onTick = onTick || this.onTick;
    this.onEnd = onEnd || this.onEnd;

    this.tick();

    this.interval = setInterval(() => {
      this.tick();
    }, 1000);
  }

  tick() {
    const remaining = this.getRemaining();

    this.onTick({
      remaining,
      formatted: this.format(remaining)
    });

    if (remaining <= 0) {
      this.stop();
      this.onEnd();
    }
  }

  stop() {
    clearInterval(this.interval);
  }

  format(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;

    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
}