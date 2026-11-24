import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import "./room-presence.css";

export function RoomQr({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  if (!url || new TextEncoder().encode(url).length > 2000) return null;
  return <details className="room-qr" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Scan room QR code</summary>
    {open && <QRCodeSVG value={url} size={184} marginSize={4} level="M" title="QR code for the read-only room link" />}
  </details>;
}
