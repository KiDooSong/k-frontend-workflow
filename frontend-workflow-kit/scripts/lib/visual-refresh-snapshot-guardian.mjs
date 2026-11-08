// Internal detached child. IPC is only a parent-lifetime pipe; all ownership
// comes from argv plus durable markers, even if the parent never yields to JS.
import { findOwnedSnapshots, isProcessDead, reapOrphanSnapshots } from './visual-refresh-snapshot-owner.mjs';

const [root, session] = process.argv.slice(2).map((value) => JSON.parse(value));
let attempts = 0;
function afterDisconnect() {
  if (!findOwnedSnapshots(root, session).length) return;
  if (isProcessDead(session.pid)) {
    reapOrphanSnapshots(root, session);
    return;
  }
  // IPC can close just before the parent is reaped. A live/reused PID or an
  // uncertain permission result is preserved; a later allocation can retry.
  if (++attempts < 40) setTimeout(afterDisconnect, 50);
}
process.once('disconnect', afterDisconnect);
if (!process.connected) afterDisconnect();
