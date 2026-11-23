// Patient detail page (US-05). Reads the patient code from the address; an invalid code shows the
// not-found page with no backend call. Otherwise it loads three independent read-only blocks
// (patient data, current reading, triage history) and only displays what the backend returns.
// No clinical logic: scores, bands and reasons come from the backend (see ReadingResult).
// Contract: specs/018-patient-detail/contracts/ui.md and patient-detail-api.md.
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { LoaderCircle } from "lucide-react";
import { apiGet, ApiError } from "../../api/client.js";
import Button from "../../components/Button.jsx";
import Card from "../../components/Card.jsx";
import TriageLevelBadge from "../../components/TriageLevelBadge.jsx";
import { useLanguage } from "../../i18n/LanguageContext.jsx";
import { isPatientCode } from "../../utils/patientCode.js";
import NotFoundPage from "../not-found/NotFoundPage.jsx";
import ReadingResult from "../record-reading/ReadingResult.jsx";
import RecordReadingButton from "../record-reading/RecordReadingButton.jsx";
import RetriageSuggestion from "./RetriageSuggestion.jsx";
import styles from "./PatientDetailPage.module.css";

// The four display states of the page.
const VIEW = {
  loading: "loading",
  notFound: "notFound",
  error: "error",
  loaded: "loaded",
};

export default function PatientDetailPage() {
  const { identifier } = useParams();
  const { lang, t } = useLanguage();

  const validCode = isPatientCode(identifier);

  const [view, setView] = useState(VIEW.loading);
  const [patient, setPatient] = useState(null);
  const [reading, setReading] = useState(null);
  const [triageEvents, setTriageEvents] = useState([]);

  // Re-run the three requests. Returns a cleanup that skips a late state update.
  const load = useCallback(() => {
    let ignore = false;

    async function run() {
      setView(VIEW.loading);
      try {
        const patientData = await apiGet(`/api/patients/${identifier}`);
        const readingsData = await apiGet(
          `/api/patients/${identifier}/readings?limit=1`,
        );
        const eventsData = await apiGet(
          `/api/patients/${identifier}/triage-events`,
        );
        if (ignore) return;
        setPatient(patientData);
        setReading(readingsData?.readings?.[0] ?? null);
        setTriageEvents(eventsData?.triage_events ?? []);
        setView(VIEW.loaded);
      } catch (err) {
        // A 401 on a stored-token call is handled by the client's onUnauthorized redirect; never
        // swallow it here.
        if (err instanceof ApiError && err.status === 401) throw err;
        if (ignore) return;
        if (err instanceof ApiError && err.status === 404) {
          setView(VIEW.notFound);
        } else {
          // 503, network error or timeout.
          setView(VIEW.error);
        }
      }
    }

    run().catch(() => {
      // A 401 is re-thrown above on purpose, but the client's onUnauthorized handler
      // (clearSession + redirect) has already dealt with it, so there is nothing more to do here.
      // Catching the fired promise keeps a late 401 from surfacing as an unhandled rejection.
    });
    return () => {
      ignore = true;
    };
  }, [identifier]);

  useEffect(() => {
    if (!validCode) return undefined;
    return load();
  }, [validCode, load]);

  if (!validCode) {
    return <NotFoundPage />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.topRow}>
        <h1 className={styles.title}>
          {t("patientDetail.title", { code: identifier })}
        </h1>
        <RecordReadingButton identifier={identifier} />
      </div>

      {/* US-04 suggestion stays mounted in every page state (it manages its own visibility); only
          the wrapper's left accent bar is gated on the loaded view, via the .retriageLoaded
          modifier, so no stray accent shows during loading/notFound/error. */}
      <section
        className={
          styles.retriageSection +
          (view === VIEW.loaded ? " " + styles.retriageLoaded : "")
        }
      >
        <RetriageSuggestion identifier={identifier} />
      </section>

      {view === VIEW.loading && (
        <div className={styles.loading} role="status" aria-live="polite">
          <LoaderCircle
            className={styles.spinner}
            aria-hidden="true"
            focusable="false"
            size="2em"
          />
          <p className={styles.loadingTitle}>
            {t("patientDetail.loadingTitle")}
          </p>
          <p className={styles.loadingHint}>{t("patientDetail.loadingHint")}</p>
        </div>
      )}

      {view === VIEW.notFound && (
        <Card title={t("patientDetail.notFoundTitle")}>
          <p>{t("patientDetail.notFoundBody")}</p>
          <Link to="/patients">{t("nav.backToPatients")}</Link>
        </Card>
      )}

      {view === VIEW.error && (
        <Card title={t("patientDetail.loadErrorTitle")}>
          <p>{t("patientDetail.loadErrorBody")}</p>
          <div className={styles.errorActions}>
            <Button onClick={load}>{t("patientDetail.retry")}</Button>
            <Link to="/patients">{t("nav.backToPatients")}</Link>
          </div>
        </Card>
      )}

      {view === VIEW.loaded && patient && (
        <div className={styles.columns}>
          <div className={styles.leftColumn}>
            <Card title={t("patientDetail.section.patient")}>
              <dl className={styles.details}>
                <div className={styles.row}>
                  <dt className={styles.label}>
                    {t("registerPatient.name")}
                  </dt>
                  <dd className={styles.value}>{patient.name}</dd>
                </div>
                <div className={styles.row}>
                  <dt className={styles.label}>{t("registerPatient.age")}</dt>
                  <dd className={styles.value}>{patient.age}</dd>
                </div>
                <div className={styles.row}>
                  <dt className={styles.label}>{t("registerPatient.sex")}</dt>
                  <dd className={styles.value}>
                    {t("patientDetail.sex." + patient.sex)}
                  </dd>
                </div>
                <div className={styles.row}>
                  <dt className={styles.label}>
                    {t("registerPatient.triageLevel")}
                  </dt>
                  <dd className={styles.value}>
                    <TriageLevelBadge level={patient.triage_level} />
                  </dd>
                </div>
                <div className={styles.row}>
                  <dt className={styles.label}>
                    {t("patientDetail.admittedAt")}
                  </dt>
                  <dd className={styles.value}>
                    {new Date(patient.admitted_at).toLocaleString(lang)}
                  </dd>
                </div>
                <div className={styles.row}>
                  <dt className={styles.label}>
                    {t("patientDetail.statusLabel")}
                  </dt>
                  <dd className={styles.value}>
                    <span
                      className={
                        patient.status === "active"
                          ? styles.statusBadgeActive
                          : styles.statusBadgeDischarged
                      }
                    >
                      {t("patientDetail.status." + patient.status)}
                    </span>
                  </dd>
                </div>
              </dl>
            </Card>
          </div>

          <div className={styles.rightColumn}>
            <section
              className={styles.readingSection}
              aria-label={t("patientDetail.section.reading")}
            >
              {reading ? (
                <Card>
                  <ReadingResult
                    reading={reading}
                    titleKey="patientDetail.latestReadingTitle"
                    titleWithDate
                  />
                </Card>
              ) : (
                <Card title={t("patientDetail.noReadingsTitle")}>
                  <p>{t("patientDetail.noReadingsBody")}</p>
                </Card>
              )}
            </section>

            <Card title={t("patientDetail.section.history")}>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">{t("patientDetail.col.occurredAt")}</th>
                      <th scope="col">
                        {t("patientDetail.col.previousLevel")}
                      </th>
                      <th scope="col">{t("patientDetail.col.newLevel")}</th>
                      <th scope="col">{t("patientDetail.col.score")}</th>
                      <th scope="col">{t("patientDetail.col.reason")}</th>
                      <th scope="col">{t("patientDetail.col.source")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {triageEvents.map((e, i) => (
                      <tr key={`${e.occurred_at}-${i}`}>
                        <td>{new Date(e.occurred_at).toLocaleString(lang)}</td>
                        <td>
                          {e.previous_level != null ? (
                            <TriageLevelBadge level={e.previous_level} />
                          ) : (
                            t("patientDetail.noPreviousLevel")
                          )}
                        </td>
                        <td>
                          <TriageLevelBadge level={e.new_level} />
                        </td>
                        <td>
                          {e.score == null
                            ? t("patientDetail.noScore")
                            : e.score}
                        </td>
                        <td>{e.reason}</td>
                        <td>{t("patientDetail.source." + e.source)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}
    </main>
  );
}
