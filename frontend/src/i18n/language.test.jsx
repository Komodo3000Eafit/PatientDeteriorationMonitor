// TS-05 language switch and disclaimer tests: AC2, AC3, AC4, AC5, AC6, AC7 and
// FR-003 to FR-009, FR-011, following specs/005-language-disclaimer/contracts/i18n.md.
// Synthetic /health responses only; fetch is stubbed, no backend and no network.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import App from '../App.jsx'

const ES_BANNER = 'Prototipo académico: no es un dispositivo médico certificado.'
const EN_BANNER = 'Academic prototype: not a certified medical device.'
const ES_TITLE = 'Monitor de Deterioro del Paciente'
const EN_TITLE = 'Patient Deterioration Monitor'
const ES_CHECKING = 'Comprobando la conexión con el servidor…'
const EN_CHECKING = 'Checking the connection to the server…'

const OK_BODY = { status: 'ok', version: '0.1.0', database: 'ok' }

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function stubOkFetch() {
  const fetchMock = vi.fn(async () => jsonResponse(OK_BODY))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function englishButton() {
  return screen.getByRole('button', { name: 'English' })
}

function spanishButton() {
  return screen.getByRole('button', { name: 'Español' })
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.documentElement.lang = 'es'
})

describe('TS-05 language and disclaimer', () => {
  it('AC2 Spanish by default', async () => {
    stubOkFetch()
    render(<App />)

    expect(await screen.findByText('API: funcionando')).toBeTruthy()
    expect(screen.getByText(ES_BANNER)).toBeTruthy()
    expect(screen.getByText(ES_TITLE)).toBeTruthy()
    // AC5: document language attribute and tab title in Spanish.
    expect(document.documentElement.lang).toBe('es')
    expect(document.title).toBe(ES_TITLE)
    expect(spanishButton().getAttribute('aria-pressed')).toBe('true')
    expect(englishButton().getAttribute('aria-pressed')).toBe('false')
  })

  it('AC3 AC5 switch to English and back without reload or new backend call', async () => {
    const fetchMock = stubOkFetch()
    render(<App />)
    expect(await screen.findByText('API: funcionando')).toBeTruthy()

    fireEvent.click(englishButton())

    expect(screen.getByText(EN_BANNER)).toBeTruthy()
    expect(screen.getByText(EN_TITLE)).toBeTruthy()
    expect(screen.getByText('API: running')).toBeTruthy()
    expect(screen.getByText('Version: 0.1.0')).toBeTruthy()
    expect(screen.getByText('Database: available')).toBeTruthy()
    expect(screen.queryByText(ES_BANNER)).toBeNull()
    expect(screen.queryByText(ES_TITLE)).toBeNull()
    expect(screen.queryByText('API: funcionando')).toBeNull()
    expect(screen.queryByText('Versión: 0.1.0')).toBeNull()
    expect(screen.queryByText('Base de datos: disponible')).toBeNull()
    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toBe(EN_TITLE)
    expect(englishButton().getAttribute('aria-pressed')).toBe('true')
    expect(spanishButton().getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(spanishButton())

    expect(screen.getByText(ES_BANNER)).toBeTruthy()
    expect(screen.getByText(ES_TITLE)).toBeTruthy()
    expect(screen.getByText('API: funcionando')).toBeTruthy()
    expect(screen.getByText('Versión: 0.1.0')).toBeTruthy()
    expect(screen.getByText('Base de datos: disponible')).toBeTruthy()
    expect(screen.queryByText(EN_BANNER)).toBeNull()
    expect(screen.queryByText('API: running')).toBeNull()
    expect(document.documentElement.lang).toBe('es')
    expect(document.title).toBe(ES_TITLE)
    expect(spanishButton().getAttribute('aria-pressed')).toBe('true')

    // FR-005: the /health result is kept; the backend is called only once in total.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('edge case: switch while checking', async () => {
    let resolveFetch
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    expect(screen.getByText(ES_CHECKING)).toBeTruthy()
    fireEvent.click(englishButton())
    expect(screen.getByText(EN_CHECKING)).toBeTruthy()

    await act(async () => {
      resolveFetch(jsonResponse(OK_BODY))
    })

    expect(await screen.findByText('API: running')).toBeTruthy()
    expect(screen.getByText('Version: 0.1.0')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('AC4 remembered English starts in English', async () => {
    localStorage.setItem('pdm.language', 'en')
    stubOkFetch()
    render(<App />)

    expect(await screen.findByText('API: running')).toBeTruthy()
    expect(screen.getByText(EN_BANNER)).toBeTruthy()
    expect(screen.getByText(EN_TITLE)).toBeTruthy()
    expect(document.documentElement.lang).toBe('en')
  })

  it('AC4 switching saves the choice', async () => {
    stubOkFetch()
    render(<App />)
    await screen.findByText('API: funcionando')

    fireEvent.click(englishButton())

    expect(localStorage.getItem('pdm.language')).toBe('en')
  })

  it('AC4 unknown stored value falls back to Spanish', async () => {
    localStorage.setItem('pdm.language', 'fr')
    stubOkFetch()
    render(<App />)

    expect(await screen.findByText('API: funcionando')).toBeTruthy()
    expect(screen.getByText(ES_BANNER)).toBeTruthy()
    expect(document.documentElement.lang).toBe('es')
  })

  it('AC4 blocked storage still works', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    stubOkFetch()

    expect(() => render(<App />)).not.toThrow()
    expect(await screen.findByText('API: funcionando')).toBeTruthy()
    expect(screen.getByText(ES_BANNER)).toBeTruthy()

    expect(() => fireEvent.click(englishButton())).not.toThrow()
    expect(screen.getByText(EN_BANNER)).toBeTruthy()
    expect(screen.getByText('API: running')).toBeTruthy()
    expect(document.documentElement.lang).toBe('en')
  })

  describe('AC6 banner shown in every state and both languages', () => {
    const outcomes = [
      {
        name: 'ok',
        fetchImpl: async () => jsonResponse(OK_BODY),
        esText: 'Base de datos: disponible',
        enText: 'Database: available',
      },
      {
        name: 'database unavailable',
        fetchImpl: async () =>
          jsonResponse({ status: 'ok', version: '0.1.0', database: 'unavailable' }),
        esText: 'Base de datos: no disponible',
        enText: 'Database: not available',
      },
      {
        name: 'fetch rejects',
        fetchImpl: async () => {
          throw new TypeError('Failed to fetch')
        },
        esText: 'No se puede conectar con el servidor.',
        enText: 'Cannot connect to the server.',
      },
      {
        name: 'status 500',
        fetchImpl: async () => jsonResponse({}, 500),
        esText: 'No se puede conectar con el servidor.',
        enText: 'Cannot connect to the server.',
      },
    ]

    it.each(outcomes)('AC6 banner shown when /health is $name', async ({ fetchImpl, esText, enText }) => {
      vi.stubGlobal('fetch', vi.fn(fetchImpl))
      render(<App />)

      expect(await screen.findByText(esText)).toBeTruthy()
      expect(screen.getByText(ES_BANNER)).toBeTruthy()

      fireEvent.click(englishButton())

      expect(screen.getByText(enText)).toBeTruthy()
      expect(screen.getByText(EN_BANNER)).toBeTruthy()
    })
  })

  it('AC6 banner shown while checking', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<App />)

    expect(screen.getByText(ES_CHECKING)).toBeTruthy()
    expect(screen.getByText(ES_BANNER)).toBeTruthy()

    fireEvent.click(englishButton())

    expect(screen.getByText(EN_CHECKING)).toBeTruthy()
    expect(screen.getByText(EN_BANNER)).toBeTruthy()
  })

  it('AC6 banner cannot be dismissed', async () => {
    stubOkFetch()
    render(<App />)
    await screen.findByText('API: funcionando')

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Español', 'English'])
  })

  it('FR-004 switch is a labelled group', async () => {
    stubOkFetch()
    render(<App />)
    await screen.findByText('API: funcionando')

    expect(screen.getByRole('group', { name: 'Idioma' })).toBeTruthy()

    fireEvent.click(englishButton())

    expect(screen.getByRole('group', { name: 'Language' })).toBeTruthy()
  })
})
