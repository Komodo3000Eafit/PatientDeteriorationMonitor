# Data Model: Language and Disclaimer (TS-05)

No database or backend changes. Everything lives in the browser.

## Text collections

`translations.es` and `translations.en` in `frontend/src/i18n/translations.js`: flat objects mapping a **key** (dotted string, `area.name`) to a **text** (non-empty string, may contain `{name}` placeholders).

Rules:
- Spanish (`es`) is the reference: it has every key the app uses.
- English (`en`) has only keys that also exist in Spanish; a missing English key shows the Spanish text.
- No visible text is written in components; they call `t(key)` (FR-001).

The keys and both texts are listed in [contracts/i18n.md](contracts/i18n.md).

## Selected language

| Field | Values | Default | Stored |
|---|---|---|---|
| `lang` | `'es'` \| `'en'` | `'es'` | browser `localStorage`, key `pdm.language`, value exactly `es` or `en` |

Transitions:
- **Load**: stored value `es`/`en` → that language; anything else, nothing stored, or storage throws → `es`.
- **Switch** (user presses ES or EN): `lang` becomes that value; the value is saved (if saving fails, it just isn't remembered); `<html lang>` and the tab title update. Pressing the current language changes nothing.
- No other transitions: no browser-language detection, no backend involvement.

The stored value is not personal data and is never sent anywhere (FR-013).

## Disclaimer banner

Fixed text from the collections (`disclaimer.text`), in the selected language; always rendered by the shared page frame, pinned at the top while scrolling; no state (it can't be closed).
