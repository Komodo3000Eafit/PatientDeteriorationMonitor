// Vital signs chart (US-06), mounted on the patient detail page inside <RequireAuth>. Plots the
// stored NEWS2 score (default) or one chosen vital sign over the last (up to 50) readings, oldest
// to newest, refreshed every 15 s. Everything shown comes from the backend: the frontend only draws
// stored values, with no thresholds, risk bands, zones, reference lines or per-point risk colors
// (constitution Principle V). An accessible text alternative (hidden table) backs the canvas.
// Contract: specs/022-vital-signs-chart/contracts/ui.md §Section.
import { useMemo, useState } from "react";
import {
  Chart as ChartJS,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import Card from "../../components/Card.jsx";
import { useLanguage } from "../../i18n/LanguageContext.jsx";
import { formatClockSeconds } from "../patient-list/formatTime.js";
import { formatDecimal } from "../../utils/formatNumber.js";
import {
  CHART_PARAMETERS,
  DEFAULT_PARAMETER,
  toPoints,
} from "./chartParameters.js";
import { readChartColors } from "./chartColors.js";
import { useReadingsHistory } from "./useReadingsHistory.js";
import styles from "./VitalSignsChart.module.css";

// Exactly the components this one-line chart needs; no Legend, Filler, annotation or other plugin,
// so "no risk zones or thresholds" is structural (research R2, Principle V).
ChartJS.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
);

const SELECT_ID = "vitals-chart-parameter";

// Same local day? Used to decide when an x label needs its date prefix.
function isSameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function VitalSignsChart({ identifier }) {
  const { lang, t } = useLanguage();
  const { readings, lastUpdated, status, refreshFailed } =
    useReadingsHistory(identifier);
  // The chosen parameter is component state, so it survives refreshes and language switches.
  const [parameterKey, setParameterKey] = useState(DEFAULT_PARAMETER);

  const parameter =
    CHART_PARAMETERS.find((p) => p.key === parameterKey) ?? CHART_PARAMETERS[0];

  // One formatter for both the y tick labels and the tooltip: temperature with one decimal in the
  // language's format, integers as they are.
  const formatValue = useMemo(() => {
    const isTemperature = parameter.key === "temperature";
    return (value) =>
      isTemperature ? formatDecimal(value, lang) : String(value);
  }, [parameter.key, lang]);

  const points = useMemo(
    () => toPoints(readings ?? [], parameter.key),
    [readings, parameter.key],
  );

  // x labels: HH:MM:SS, with "{day} {month}" prefixed on the first label and whenever the local day
  // differs from the previous point.
  const labels = useMemo(() => {
    const dateFormat = new Intl.DateTimeFormat(lang, {
      day: "numeric",
      month: "short",
    });
    return points.map((point, index) => {
      const clock = formatClockSeconds(point.recordedAt, lang);
      const previous = index > 0 ? points[index - 1].recordedAt : null;
      const needsDate =
        index === 0 || (previous && !isSameLocalDay(point.recordedAt, previous));
      return needsDate
        ? dateFormat.format(point.recordedAt) + " " + clock
        : clock;
    });
  }, [points, lang]);

  const colors = readChartColors();

  const data = {
    labels,
    datasets: [
      {
        data: points.map((point) => point.value),
        borderColor: colors.line,
        pointBackgroundColor: colors.line,
        pointRadius: 3,
        fill: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => formatValue(context.parsed.y),
        },
      },
    },
    scales: {
      x: {
        type: "category",
        title: { display: true, text: t("vitalsChart.xAxis") },
        ticks: { color: colors.text },
        grid: { color: colors.grid },
      },
      y: {
        type: "linear",
        title: { display: true, text: t(parameter.labelKey) },
        ticks: { color: colors.text, callback: (value) => formatValue(value) },
        grid: { color: colors.grid },
      },
    },
  };

  // Full local date-time (24-hour, seconds) for the hidden table rows.
  const tableDateTime = useMemo(
    () =>
      new Intl.DateTimeFormat(lang, {
        dateStyle: "medium",
        timeStyle: "medium",
        hourCycle: "h23",
      }),
    [lang],
  );

  return (
    <Card title={t("vitalsChart.title")}>
      {status === "loading" && <p>{t("vitalsChart.loading")}</p>}

      {status === "error" && <p role="alert">{t("vitalsChart.loadError")}</p>}

      {status === "ok" && readings.length === 0 && (
        <p>{t("vitalsChart.noReadings")}</p>
      )}

      {status === "ok" && readings.length > 0 && (
        <>
          <div className={styles.controls}>
            <label htmlFor={SELECT_ID}>{t("vitalsChart.parameterLabel")}</label>
            <select
              id={SELECT_ID}
              value={parameter.key}
              onChange={(event) => setParameterKey(event.target.value)}
            >
              {CHART_PARAMETERS.map((p) => (
                <option key={p.key} value={p.key}>
                  {t(p.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <p className={styles.count}>
            {t("vitalsChart.count", { count: readings.length })}
          </p>

          <div className={styles.chart}>
            <Line
              role="img"
              aria-label={t("vitalsChart.ariaLabel", {
                parameter: t(parameter.labelKey),
                code: identifier,
              })}
              data={data}
              options={options}
            />
          </div>

          <table className={styles.visuallyHidden}>
            <caption>{t("vitalsChart.tableCaption")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("vitalsChart.xAxis")}</th>
                <th scope="col">{t(parameter.labelKey)}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point, index) => (
                <tr key={index}>
                  <td>{tableDateTime.format(point.recordedAt)}</td>
                  <td>{formatValue(point.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {lastUpdated && (
        <p className={styles.live}>
          {t("vitalsChart.live", {
            time: formatClockSeconds(lastUpdated, lang),
          })}
        </p>
      )}

      {refreshFailed && <p role="alert">{t("vitalsChart.refreshError")}</p>}
    </Card>
  );
}
