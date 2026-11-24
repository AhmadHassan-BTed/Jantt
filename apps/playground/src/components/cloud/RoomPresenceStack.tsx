import type { RoomPresence } from "../../firebase/types";
import { getTrustedAvatarUrl } from "../../room-storage";
import "./room-presence.css";

const RINGS = ["#38bdf8", "#a78bfa", "#34d399", "#f59e0b", "#fb7185"];

function ringColor(uid: string) {
  let hash = 0;
  for (const char of uid) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return RINGS[Math.abs(hash) % RINGS.length];
}

export function RoomPresenceStack({ users, limit = 3 }: { users: RoomPresence[]; limit?: number }) {
  if (!users.length) return null;
  const label = users.map(user => user.displayName || user.username).join(", ");
  return <span className="room-avatar-stack" role="img" aria-label={`Online: ${label}`} title={label}>
    {users.slice(0, limit).map(user => {
      const avatar = getTrustedAvatarUrl(user.photoURL);
      return <span className="room-avatar-ring" key={user.uid} style={{ borderColor: ringColor(user.uid) }}>
        {avatar ? <img alt="" src={avatar} referrerPolicy="no-referrer" /> : (user.displayName || user.username).charAt(0)}
      </span>;
    })}
    {users.length > limit && <span className="room-avatar-overflow">+{users.length - limit}</span>}
  </span>;
}

export function TaskPresenceTag({ users, taskId }: { users?: RoomPresence[]; taskId: string }) {
  const viewers = users?.filter(user => user.inspectedTaskId === taskId);
  if (!viewers?.length) return null;
  const names = viewers.map(user => user.displayName || user.username).join(", ");
  return <span className="task-presence-tag" aria-label={`Inspecting: ${names}`} title={names}>
    <i aria-hidden="true" style={{ backgroundColor: ringColor(viewers[0].uid) }} />
    {viewers[0].displayName || viewers[0].username}{viewers.length > 1 && ` +${viewers.length - 1}`}
  </span>;
}
