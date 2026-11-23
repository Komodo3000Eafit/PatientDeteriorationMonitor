// Deterioration prediction component (US-08), mounted on the patient detail page inside <RequireAuth>.
// Shows the backend's answer to "did the NEWS2 score rise across the last 3 readings?". Everything
// shown comes from the backend: the frontend never computes a score, band or prediction
// (constitution Principle V). Contract: specs/024-deterioration-prediction/contracts/ui.md.
// State is kept as data and translation keys, so switching language re-renders without a new request.
import { useEffect, useState } from "react";
import { TrendingUpIcon } from "lucide-react";
import { apiGet, ApiError } from "../../api/client.js";
import Card from "../../components/Card.jsx";
import { useLanguage } from "../../i18n/LanguageContext.jsx";
import RiskBandBadge from "../record-reading/RiskBandBadge.jsx";
import styles from "./DeteriorationPrediction.module.css";

const SCORE_SEPARATOR = " → ";

export default function DeteriorationPrediction({ identifier }) {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [errorKey, setErrorKey] = useState(null);

  useEffect(() => {
    let ignore = false;
    setData(null);
    setErrorKey(null);

    async function run() {
      try {
        const answer = await apiGet(`/api/patients/${identifier}/prediction`);
        if (ignore) return;
        setData(answer);
      } catch (err) {
        // A 401 is handled by the client's onUnauthorized handler (clear session + redirect).
        if (err instanceof ApiError && err.status === 401) throw err;
        if (ignore) return;
        // A 404 renders nothing: the page shows its own not-found card.
        if (err instanceof ApiError && err.status === 404) return;
        // 5xx, network error or timeout: a fixed text, never the server text.
        setErrorKey("prediction.loadError");
      }
    }

    run().catch(() => {
      // The re-thrown 401 was already handled by the client; catching the fired promise keeps it
      // from surfacing as an unhandled rejection.
    });
    return () => {
      ignore = true;
    };
  }, [identifier]);

  if (errorKey) {
    return <p className={styles.note}>{t(errorKey)}</p>;
  }
  if (!data) return null;

  if (!data.rising) {
    const noteKey =
      data.reason === "not_enough_readings"
        ? "prediction.notEnough"
        : "prediction.none";
    return <p className={styles.note}>{t(noteKey)}</p>;
  }

  const scores = (data.readings ?? [])
    .map((reading) => reading.total)
    .join(SCORE_SEPARATOR);

  return (
    <div className={styles.card}>
      <Card
        title={
          <span className={styles.header}>
            <TrendingUpIcon
              className={styles.icon}
              aria-hidden="true"
              focusable="false"
              size="1.25em"
            />
            {t("prediction.title")}
          </span>
        }
      >
        <div className={styles.content}>
          <p className={styles.message}>{t("prediction.rising")}</p>
          <p className={styles.scores}>
            <span className={styles.label}>{t("prediction.scores")}</span>
            <span>{scores}</span>
          </p>
          <div className={styles.scores}>
            <span className={styles.label}>{t("prediction.latestBand")}</span>
            <RiskBandBadge band={data.latest_band} />
          </div>
        </div>
      </Card>
    </div>
  );
}
