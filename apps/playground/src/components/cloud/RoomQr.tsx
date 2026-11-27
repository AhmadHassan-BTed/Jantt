import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useI18n } from "../../i18n/I18nProvider";
import "./room-presence.css";

export function RoomQr({ url }: { url: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!url || new TextEncoder().encode(url).length > 2000) return null;
  return <details className="room-qr" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t("cloud.qrSummary")}</summary>
    {open && <QRCodeSVG value={url} size={184} marginSize={4} level="M" title={t("cloud.qrTitle")} />}
  </details>;
}
