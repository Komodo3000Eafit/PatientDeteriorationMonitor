// Alert acknowledgement component (US-07, D-56), mounted on the patient detail page inside <RequireAuth>.
// Shows who saw or handled the patient's latest re-triage suggestion, and lets a nurse mark it as
// seen. The acknowledgement state (not_seen, seen, handled) always comes from the backend; the
// frontend never computes it (constitution Principle V). Contract:
// specs/023-alert-acknowledgement/contracts/ui.md.
// State is kept as data and translation keys, so switching language re-renders without a new request.
import { useCallback, useEffect, useState } from "react";
import { CircleCheckIcon, EyeIcon } from "lucide-react";
import { apiGet, apiPost, ApiError } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import Button from "../../components/Button.jsx";
import Card from "../../components/Card.jsx";
import { useLanguage } from "../../i18n/LanguageContext.jsx";
import styles from "./AlertAcknowledgement.module.css";

const NOT_CANCELLED = () => false;

export default function AlertAcknowledgement({ identifier }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [errorKey, setErrorKey] = useState(null);
  const [messageKey, setMessageKey] = useState(null);
  const [pending, setPending] = useState(false);

  // Fetches the acknowledgement answer. isCancelled lets the effect drop a stale answer.
  const load = useCallback(
    async (isCancelled = NOT_CANCELLED) => {
      try {
        const answer = await apiGet(
          `/api/patients/${identifier}/alerts/acknowledgement`,
        );
        if (isCancelled()) return;
        setErrorKey(null);
        setData(answer);
      } catch (err) {
        // A 401 is handled by the client's onUnauthorized handler (clear session + redirect).
        if (err instanceof ApiError && err.status === 401) throw err;
        if (isCancelled()) return;
        // A 404 renders nothing: the page shows its own not-found card.
        if (err instanceof ApiError && err.status === 404) return;
        // 5xx, network error or timeout: a fixed text, never the server text.
        setErrorKey("alertAck.loadError");
      }
    },
    [identifier],
  );

  useEffect(() => {
    let ignore = false;
    setData(null);
    setErrorKey(null);
    setMessageKey(null);
    load(() => ignore).catch(() => {
      // The re-thrown 401 was already handled by the client; catching the fired promise keeps it
      // from surfacing as an unhandled rejection.
    });
    return () => {
      ignore = true;
    };
  }, [load]);

  async function handleMarkSeen() {
    if (pending || !data?.alert) return;
    setPending(true);
    setMessageKey(null);
    try {
      const answer = await apiPost(
        `/api/patients/${identifier}/alerts/${data.alert.id}/seen`,
      );
      setData(answer);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      if (err instanceof ApiError && err.status === 409) {
        setMessageKey("alertAck.alreadyHandled");
        load().catch(() => {
          // A 401 on the reload was already handled by the client.
        });
        return;
      }
      setMessageKey("alertAck.markError");
    } finally {
      setPending(false);
    }
  }

  const message = messageKey ? (
    <p role="alert" className={styles.message}>
      {t(messageKey)}
    </p>
  ) : null;

  if (errorKey) {
    return <p className={styles.note}>{t(errorKey)}</p>;
  }
  if (!data?.alert) return message;

  const { state, by, at } = data.alert;
  const time = at ? new Date(at).toLocaleString(lang) : "";
  let body = null;

  if (state === "not_seen") {
    if (user?.role !== "nurse") return message;
    body = (
      <Button disabled={pending} onClick={handleMarkSeen}>
        {t("alertAck.markSeen")}
      </Button>
    );
  } else if (state === "seen") {
    body = (
      <p className={styles.seen}>
        <EyeIcon
          className={styles.seenIcon}
          aria-hidden="true"
          focusable="false"
        />
        <span>{t("alertAck.seenBy", { name: by, time })}</span>
      </p>
    );
  } else if (state === "handled") {
    body = (
      <p className={styles.handled}>
        <CircleCheckIcon
          className={styles.handledIcon}
          aria-hidden="true"
          focusable="false"
        />
        <span>
          {by
            ? t("alertAck.handledBy", { name: by, time })
            : t("alertAck.handled")}
        </span>
      </p>
    );
  } else {
    return message;
  }

  return (
    <>
      {message}
      <Card title={t("alertAck.title")}>{body}</Card>
    </>
  );
}
