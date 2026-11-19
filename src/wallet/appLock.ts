/**
 * Decides when the wallet locks on app backgrounding. Android reports the app as
 * "background" while a system dialog (camera permission) or settings screen opened
 * by TREX is on top. Those short, user-initiated trips get a one-shot grace period
 * so the scanner flow doesn't lock the wallet mid-task; anything else locks at once.
 */
export const SYSTEM_DIALOG_GRACE_MS = 30_000;

export class AppLockPolicy {
  private graceUntil = 0;
  private backgroundedAt: number | null = null;

  /** Call right before TREX opens a permission dialog or the system settings. */
  expectSystemDialog(now = Date.now(), ms = SYSTEM_DIALOG_GRACE_MS) {
    this.graceUntil = now + ms;
  }

  /** Returns true when the wallet must lock now. */
  onBackground(now = Date.now()): boolean {
    if (now <= this.graceUntil) {
      this.backgroundedAt = now;
      return false;
    }
    this.backgroundedAt = null;
    return true;
  }

  /** Returns true when a deferred lock is due on return (the trip away took too long). */
  onActive(now = Date.now()): boolean {
    const away = this.backgroundedAt === null ? null : now - this.backgroundedAt;
    this.backgroundedAt = null;
    this.graceUntil = 0; // one-shot
    return away !== null && away > SYSTEM_DIALOG_GRACE_MS;
  }
}

export const appLock = new AppLockPolicy();
