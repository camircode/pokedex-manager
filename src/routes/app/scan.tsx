import { createFileRoute } from '@tanstack/react-router'
import { type ChangeEvent, useEffect, useRef, useState } from 'react'

import { AiProcess, type AiProcessStep } from '@/components/ai-process'
import { ErrorState } from '@/components/status'
import { pokemonTypeLabel } from '@/lib/catalog-query'
import { consumeEventStream } from '@/lib/event-stream'
import { MAX_SCAN_IMAGE_BYTES, validateScanImage } from '@/lib/image-validation'
import { apiMutation, displayName } from '@/lib/ui'
import type { RecognitionStreamEvent } from '@/routes/api/ai/recognize'
import type { RecognitionCandidate } from '@/server/card-recognition'

export const Route = createFileRoute('/app/scan')({ component: Scan })

const recognitionSteps: AiProcessStep[] = [
  { phase: 'validating', label: 'Verificar formato y contenido del archivo' },
  { phase: 'identifying', label: 'Kimi identifica la especie visible' },
  { phase: 'verifying', label: 'Contrastar ID y nombre con PokéAPI' },
]

function Scan() {
  const cameraInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File>()
  const [previewUrl, setPreviewUrl] = useState('')
  const [consent, setConsent] = useState(false)
  const [candidate, setCandidate] = useState<RecognitionCandidate>()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [processPhases, setProcessPhases] = useState<string[]>([])
  const [processStatus, setProcessStatus] = useState<
    'running' | 'complete' | 'error'
  >('complete')
  const [processStartedAt, setProcessStartedAt] = useState<number | null>(null)

  useEffect(() => {
    if (file === undefined) {
      setPreviewUrl('')
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function selectImage(selected: File | undefined) {
    setError('')
    setMessage('')
    setCandidate(undefined)
    setConsent(false)
    setFile(undefined)
    setProcessStartedAt(null)
    setProcessPhases([])
    if (selected === undefined) return
    try {
      validateScanImage({
        bytes: new Uint8Array(await selected.arrayBuffer()),
        declaredMediaType: selected.type,
      })
      setFile(selected)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'La imagen no es válida.',
      )
    }
  }

  function handleImageInput(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    void selectImage(selected)
  }

  async function analyze() {
    if (file === undefined || !consent) return
    setLoading(true)
    setError('')
    setMessage('')
    setCandidate(undefined)
    setProcessPhases([])
    setProcessStatus('running')
    setProcessStartedAt(Date.now())
    try {
      const form = new FormData()
      form.set('image', file)
      form.set('consent', 'true')
      const response = await fetch('/api/ai/recognize', {
        method: 'POST',
        headers: { Accept: 'text/event-stream' },
        body: form,
      })
      await consumeEventStream<RecognitionStreamEvent>(
        response,
        (event) => {
          if (event.type === 'phase') {
            setProcessPhases((current) =>
              current.includes(event.phase)
                ? current
                : [...current, event.phase],
            )
          } else if (event.type === 'error') {
            throw new Error(event.message)
          } else {
            setCandidate(event.candidate)
            setProcessStatus('complete')
          }
        },
        { isTerminal: (event) => event.type !== 'phase' },
      )
    } catch (caught) {
      setProcessStatus('error')
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo analizar la imagen.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function confirmCandidate() {
    if (candidate === undefined) return
    setAdding(true)
    setError('')
    setMessage('')
    try {
      await apiMutation('/api/collection', {
        method: 'POST',
        body: JSON.stringify({ pokemonId: candidate.pokemonId, quantity: 1 }),
      })
      setMessage(
        `${displayName(candidate.name)} se agregó a tu colección después de tu confirmación.`,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo agregar.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <main className="page scan-page">
      <header className="page-header">
        <div>
          <p className="kicker">Reconocimiento con confirmación</p>
          <h1>Identificar una carta</h1>
          <p>
            Kimi propone una especie y PokéAPI verifica la coincidencia. Nada se
            agrega hasta que confirmes el resultado.
          </p>
        </div>
      </header>

      <div className="scan-workbench">
        <form
          className="scan-form"
          onSubmit={(event) => {
            event.preventDefault()
            void analyze()
          }}
        >
          <fieldset>
            <legend>1. Obtén una imagen</legend>
            <div className="button-row" aria-describedby="scan-image-help">
              <button
                type="button"
                className="button secondary"
                onClick={() => cameraInput.current?.click()}
              >
                <i className="hn hn-camera" aria-hidden="true" />
                Tomar foto
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => fileInput.current?.click()}
              >
                Elegir archivo
              </button>
            </div>
            <input
              ref={cameraInput}
              hidden
              type="file"
              accept="image/png,image/jpeg,image/webp"
              capture="environment"
              onChange={handleImageInput}
            />
            <input
              ref={fileInput}
              hidden
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImageInput}
            />
            <small id="scan-image-help">
              PNG, JPEG o WebP, hasta {MAX_SCAN_IMAGE_BYTES / 1024 / 1024} MB.
              El contenido del archivo se verifica antes de enviarlo.
            </small>
          </fieldset>

          {file && (
            <fieldset>
              <legend>2. Autoriza el análisis</legend>
              <label className="consent-field">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                <span>
                  Autorizo el envío temporal de esta imagen a Kimi para
                  identificar la especie.
                </span>
              </label>
              <p className="privacy-note">
                La imagen y su representación base64 no se guardan en MongoDB ni
                se registran en logs. El archivo original no se persiste.
              </p>
            </fieldset>
          )}

          <button
            type="submit"
            className="button primary"
            disabled={file === undefined || !consent || loading}
          >
            <i className="hn hn-camera" aria-hidden="true" />
            {loading ? 'Analizando…' : 'Analizar imagen'}
          </button>
        </form>

        <section className="scan-preview" aria-labelledby="preview-title">
          <div className="scan-section-heading">
            <span>Vista previa</span>
            {file && <small>{(file.size / 1024).toFixed(0)} KB</small>}
          </div>
          <h2 id="preview-title" className="sr-only">
            Vista previa de la imagen
          </h2>
          {previewUrl ? (
            <img src={previewUrl} alt="Vista previa de la carta seleccionada" />
          ) : (
            <p>No hay una imagen seleccionada.</p>
          )}
        </section>
      </div>

      {processStartedAt !== null && (
        <AiProcess
          title="Identificación y contraste"
          steps={recognitionSteps}
          phases={processPhases}
          status={processStatus}
          startedAt={processStartedAt}
        />
      )}

      {error && <ErrorState message={error} />}
      {message && (
        <p className="status-line success" role="status">
          {message}
        </p>
      )}

      {candidate && (
        <section
          className="recognition-result"
          aria-labelledby="candidate-title"
        >
          <header>
            <p className="report-label">Candidato verificado</p>
            <span className="index-number">
              #{String(candidate.pokemonId).padStart(4, '0')}
            </span>
            <h2 id="candidate-title">{displayName(candidate.name)}</h2>
            <div className="type-list">
              {candidate.types.map((type) => (
                <span className={`type type-${type}`} key={type}>
                  {pokemonTypeLabel(type)}
                </span>
              ))}
            </div>
          </header>
          {candidate.sprite && (
            <img
              src={candidate.sprite}
              alt={`Ilustración oficial de ${displayName(candidate.name)}`}
              width="160"
              height="160"
            />
          )}
          <dl className="evidence-list">
            {candidate.evidence.map((item) => (
              <div key={`${item.source}-${item.label}`}>
                <dt>{item.label}</dt>
                <dd>
                  {item.value} <small>Fuente: {item.source}</small>
                </dd>
              </div>
            ))}
          </dl>
          <footer>
            <p>Revisa la especie antes de modificar tu colección.</p>
            <button
              type="button"
              className="button primary"
              disabled={adding}
              onClick={() => void confirmCandidate()}
            >
              <i className="hn hn-check" aria-hidden="true" />
              {adding ? 'Agregando…' : 'Confirmar y agregar'}
            </button>
          </footer>
        </section>
      )}
    </main>
  )
}
