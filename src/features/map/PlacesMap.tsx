import {
  GeolocateControl,
  LngLatBounds,
  Map as MapLibre,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapMouseEvent,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { distanceKm, type LatLng } from '@/lib/geo'

// The bundler moves MapLibre's worker file, so tell the library where it went.
setWorkerUrl(workerUrl)

/**
 * Free vector map tiles built from OpenStreetMap, no account needed.
 * https://openfreemap.org
 */
const STYLE = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const

export interface MapPin extends LatLng {
  id: string
  title: string
  /** Shown inside the pin, e.g. "8.5". */
  score?: string
  /** `mine` = a bakery from the journal; `found` = somewhere new to try. */
  kind: 'mine' | 'found'
}

export interface MapView {
  center: LatLng
  /** Roughly how far the visible map reaches from its center. */
  radiusKm: number
}

interface Props {
  pins: MapPin[]
  selectedId: string | null
  onSelect: (id: string) => void
  onView?: (view: MapView) => void
  dark: boolean
  className?: string
}

const WHOLE_COUNTRY: [number, number, number, number] = [-125, 24.5, -66.5, 49.5]
const FONT = ['Noto Sans Bold']

function collection(pins: MapPin[], kind: MapPin['kind']) {
  return {
    type: 'FeatureCollection' as const,
    features: pins
      .filter((p) => p.kind === kind)
      .map((p) => ({
        type: 'Feature' as const,
        properties: { id: p.id, title: p.title, score: p.score ?? '' },
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      })),
  }
}

/** A street map with the journal's bakeries, and any newly found ones, pinned on it. */
export function PlacesMap({ pins, selectedId, onSelect, onView, dark, className }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibre | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  // Latest values for the map's own event handlers, which are bound once.
  const latest = useRef({ pins, onSelect, onView })
  useEffect(() => {
    latest.current = { pins, onSelect, onView }
  })

  useEffect(() => {
    if (!container.current) return
    let instance: MapLibre
    try {
      instance = new MapLibre({
        container: container.current,
        style: dark ? STYLE.dark : STYLE.light,
        bounds: WHOLE_COUNTRY,
        fitBoundsOptions: { padding: 24 },
        attributionControl: { compact: true },
        // One-finger drags move the map; rotation only confuses on a phone.
        dragRotate: false,
        pitchWithRotate: false,
        maxZoom: 18,
      })
    } catch (error) {
      // No WebGL (very old phones, some locked-down browsers).
      console.warn('Map could not start', error)
      // oxlint-disable-next-line react/set-state-in-effect
      setFailed(true)
      return
    }
    // The map's credits start out folded behind their "i" button rather than
    // spread across the corner of a small map. The line under the map carries
    // the credit in plain sight, and a tap on the "i" shows the rest. The map
    // library unfolds them by itself once it knows what to credit, so that
    // first unfolding is what gets undone; after that the button is theirs.
    const credits = container.current.querySelector('.maplibregl-ctrl-attrib')
    const fold = new MutationObserver(() => {
      if (!credits?.classList.contains('maplibregl-compact-show')) return
      fold.disconnect()
      credits.classList.remove('maplibregl-compact-show')
      credits.removeAttribute('open')
    })
    if (credits) fold.observe(credits, { attributes: true, attributeFilter: ['class'] })
    map.current = instance
    instance.touchZoomRotate.disableRotation()
    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    instance.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }),
      'top-right',
    )

    const ink = dark ? '#f3e3cb' : '#2a1810'
    const paper = dark ? '#211812' : '#fffcf6'

    instance.on('load', () => {
      const { pins } = latest.current
      instance.addSource('mine', {
        type: 'geojson',
        data: collection(pins, 'mine'),
        cluster: true,
        clusterRadius: 46,
        clusterMaxZoom: 14,
      })
      instance.addSource('found', { type: 'geojson', data: collection(pins, 'found') })

      // Somewhere new: a small open ring.
      instance.addLayer({
        id: 'found-points',
        type: 'circle',
        source: 'found',
        paint: {
          'circle-radius': 7,
          'circle-color': paper,
          'circle-stroke-color': dark ? '#e99a55' : '#a84d15',
          'circle-stroke-width': 2.5,
        },
      })
      // A bigger, invisible target so small rings are easy to tap.
      instance.addLayer({
        id: 'found-hit',
        type: 'circle',
        source: 'found',
        paint: { 'circle-radius': 18, 'circle-color': '#000', 'circle-opacity': 0.001 },
      })

      // Several of your bakeries close together.
      instance.addLayer({
        id: 'mine-clusters',
        type: 'circle',
        source: 'mine',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ink,
          'circle-radius': ['step', ['get', 'point_count'], 17, 5, 21, 15, 25],
          'circle-stroke-color': paper,
          'circle-stroke-width': 3,
        },
      })
      instance.addLayer({
        id: 'mine-cluster-count',
        type: 'symbol',
        source: 'mine',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': FONT,
          'text-size': 14,
          'text-allow-overlap': true,
        },
        paint: { 'text-color': paper },
      })

      // One bakery: a golden biscuit with its average score on it.
      instance.addLayer({
        id: 'mine-points',
        type: 'circle',
        source: 'mine',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#e0aa63',
          'circle-radius': 15,
          'circle-stroke-color': paper,
          'circle-stroke-width': 3,
        },
      })
      instance.addLayer({
        id: 'mine-scores',
        type: 'symbol',
        source: 'mine',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'text-field': ['get', 'score'],
          'text-font': FONT,
          'text-size': 12,
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#3a2012' },
      })

      // A ring around whichever pin is selected.
      for (const source of ['mine', 'found'] as const) {
        instance.addLayer({
          id: `${source}-selected`,
          type: 'circle',
          source,
          filter: ['==', ['get', 'id'], ''],
          paint: {
            'circle-radius': source === 'mine' ? 21 : 12,
            'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-color': ink,
            'circle-stroke-width': 3,
          },
        })
      }

      const pick = (
        event: MapMouseEvent & { features?: { properties: Record<string, unknown> }[] },
      ) => {
        const id = event.features?.[0]?.properties.id
        if (typeof id === 'string') latest.current.onSelect(id)
      }
      instance.on('click', 'mine-points', pick)
      instance.on('click', 'found-hit', pick)
      instance.on('click', 'mine-clusters', (event) => {
        const feature = instance.queryRenderedFeatures(event.point, {
          layers: ['mine-clusters'],
        })[0]
        const clusterId = feature?.properties.cluster_id as number | undefined
        const geometry = feature?.geometry
        if (clusterId === undefined || geometry?.type !== 'Point') return
        void (instance.getSource('mine') as GeoJSONSource)
          .getClusterExpansionZoom(clusterId)
          .then((zoom) =>
            instance.easeTo({ center: geometry.coordinates as [number, number], zoom: zoom + 0.5 }),
          )
      })
      for (const layer of ['mine-points', 'mine-clusters', 'found-hit']) {
        instance.on('mouseenter', layer, () => (instance.getCanvas().style.cursor = 'pointer'))
        instance.on('mouseleave', layer, () => (instance.getCanvas().style.cursor = ''))
      }

      // Open on the journal's own places rather than the whole country.
      const mine = pins.filter((p) => p.kind === 'mine')
      if (mine.length > 0) {
        const bounds = new LngLatBounds()
        for (const p of mine) bounds.extend([p.lng, p.lat])
        instance.fitBounds(bounds, { padding: 56, maxZoom: 12, duration: 0 })
      }
      setReady(true)
    })

    instance.on('moveend', () => {
      const center = instance.getCenter()
      const corner = instance.getBounds().getNorthEast()
      latest.current.onView?.({
        center: { lat: center.lat, lng: center.lng },
        radiusKm: distanceKm(
          { lat: center.lat, lng: center.lng },
          { lat: corner.lat, lng: corner.lng },
        ),
      })
    })

    // The base map failing to load (no connection) is the one error worth a message.
    instance.on('error', (event) => {
      if (!instance.isStyleLoaded() && !instance.getSource('mine')) {
        console.warn('Map style failed to load', event.error)
        setFailed(true)
      }
    })

    return () => {
      fold.disconnect()
      map.current = null
      setReady(false)
      instance.remove()
    }
  }, [dark])

  // Keep the pins in step with the journal and with search results.
  useEffect(() => {
    const instance = map.current
    if (!instance || !ready) return
    ;(instance.getSource('mine') as GeoJSONSource | undefined)?.setData(collection(pins, 'mine'))
    ;(instance.getSource('found') as GeoJSONSource | undefined)?.setData(collection(pins, 'found'))
  }, [pins, ready])

  // Ring the selected pin, and bring it into view if it was picked from a list.
  useEffect(() => {
    const instance = map.current
    if (!instance || !ready) return
    for (const source of ['mine', 'found']) {
      instance.setFilter(`${source}-selected`, ['==', ['get', 'id'], selectedId ?? ''])
    }
    const pin = latest.current.pins.find((p) => p.id === selectedId)
    if (pin && !instance.getBounds().contains([pin.lng, pin.lat])) {
      instance.easeTo({ center: [pin.lng, pin.lat], zoom: Math.max(instance.getZoom(), 11) })
    } else if (pin && pin.kind === 'mine' && instance.getZoom() < 9) {
      // Probably hidden inside a cluster: go close enough to see it alone.
      instance.easeTo({ center: [pin.lng, pin.lat], zoom: 12 })
    }
  }, [selectedId, ready])

  return (
    <div className={cn('relative overflow-hidden bg-oat', className)}>
      <div
        ref={container}
        role="application"
        aria-label="Street map of cookie places. The list beside it has the same places."
        data-ready={ready}
        data-pins={pins.length}
        // Sized, not positioned: MapLibre sets `position: relative` on this element itself.
        className="size-full"
      />
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-oat p-6 text-center">
          <p className="max-w-xs text-sm text-ink-soft">
            <strong className="block font-display text-lg text-ink">
              The street map couldn’t load
            </strong>
            It needs a connection. Your places are all in the list, and the States view works
            offline.
          </p>
        </div>
      )}
    </div>
  )
}
