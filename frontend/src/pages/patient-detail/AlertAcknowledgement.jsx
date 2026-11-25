// Alert acknowledgement component (US-07, D-56), mounted on the patient detail page inside <RequireAuth>.
// Shows the backend's follow-up state of the patient's shown alert (not_seen, seen, handled) and lets a
// nurse mark an open alert as seen. The backend decides the state; the frontend only displays the
// answer and never changes a triage level. Contract: specs/023-alert-acknowledgement/contracts/ui.md.
// State is kept as data and translation keys, so switching language re-renders without a new request.
import { useCallback, useEffect, useState } from "react";
import { CircleCheckIcon, EyeIcon } from "lucide-react";
import { apiGet, apiPost, ApiError } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import Button from "../../components/Button.jsx";
import Card from "../../components/Card.jsx";
import { useLanguage } from "../../i18n/LanguageContext.jsx";
import styles from "./AlertAcknowledgement.module.css";

const NEVER_IGNORED = () => false;

export default function AlertAcknowledgement({ identifier }) {
  const { lang, t } = useLanguage();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [errorKey, setErrorKey] = useState(null);
  const [messageKey, setMessageKey] = useState(null);
  const [pending, setPending] = useState(false);

  // Loads the acknowledgement state. `isIgnored` lets the effect skip a late answer.
  const load = useCallback(
    (isIgnored = NEVER_IGNORED) => {
      async function run() {
        try {
          const answer = await apiGet(
            `/api/patients/${identifier}/alerts/acknowledgement`,
          );
          if (isIgnored()) return;
          setErrorKey(null);
          setData(answer);
        } catch (err) {
          // A 401 is handled by the client's onUnauthorized handler (clear session + redirect).
          if (err instanceof ApiError && err.status === 401) throw err;
          if (isIgnored()) return;
          // A 404 renders nothing: the page shows its own not-found card.
          if (err instanceof ApiError && err.status === 404) return;
          // 5xx, network error or timeout: a fixed text, never the server text.
          setErrorKey("alertAck.loadError");
        }
      }

      run().catch(() => {
        // The re-thrown 401 was already handled by the client; catching the fired promise keeps it
        // from surfacing as an unhandled rejection.
      });
    },
    [identifier],
  );

  useEffect(() => {
    let ignore = false;
    setData(null);
    setErrorKey(null);
    setMessageKey(null);
    setPending(false);
    load(() => ignore);
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
      // A 401 is handled by the client's session-expiry handling.
      if (err instanceof ApiError && err.status === 401) return;
      if (err instanceof ApiError && err.status === 409) {
        setMessageKey("alertAck.alreadyHandled");
        load();
      } else {
        setMessageKey("alertAck.markError");
      }
    } finally {
      setPending(false);
    }
  }

  if (errorKey) {
    return <p className={styles.note}>{t(errorKey)}</p>;
  }
  if (!data || !data.alert) return null;

  const { state, by, at } = data.alert;
  const isNurse = user?.role === "nurse";
  const time = at ? new Date(at).toLocaleString(lang) : null;

  let content = null;
  if (state === "not_seen") {
    if (!isNurse) return null;
    content = (
      <Button disabled={pending} onClick={handleMarkSeen}>
        {t("alertAck.markSeen")}
      </Button>
    );
  } else if (state === "seen") {
    content = (
      <p className={styles.seen}>
        <EyeIcon
          className={styles.seenIcon}
          aria-hidden="true"
          focusable="false"
          size="1.25em"
        />
        <span>{t("alertAck.seenBy", { name: by, time })}</span>
      </p>
    );
  } else if (state === "handled") {
    content = (
      <p className={styles.handled}>
        <CircleCheckIcon
          className={styles.handledIcon}
          aria-hidden="true"
          focusable="false"
          size="1.25em"
        />
        <span>
          {by
            ? t("alertAck.handledBy", { name: by, time })
            : t("alertAck.handled")}
        </span>
      </p>
    );
  } else {
    return null;
  }

  return (
    <Card title={t("alertAck.title")}>
      {messageKey && (
        <p role="alert" className={styles.message}>
          {t(messageKey)}
        </p>
      )}
      {content}
    </Card>
  );
}
