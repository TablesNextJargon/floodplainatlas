import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Map,
  NavigationControl,
  Marker,
  setWorkerUrl,
  addProtocol,
  type MapGeoJSONFeature,
} from 'maplibre-gl';
import { Protocol, PMTiles } from 'pmtiles';
import { loadFloodTileSource } from '../lib/flood-tile-source';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';

// Vite must emit the worker as an asset rather than resolve it relative to an
// optimized dependency module in node_modules/.vite/deps.
setWorkerUrl(workerUrl);
const tileProtocol = new Protocol();
addProtocol('pmtiles', tileProtocol.tile);

interface Selection {
  zone: string;
  origin: string;
  source: string;
  date: string;
  region: DataRegion;
  scenario: string;
  reference: string;
}

type DataRegion = 'england' | 'wales' | 'scotland' | 'ireland';
type ScotlandScenario = 'SEPA_H' | 'SEPA_M' | 'SEPA_L' | 'SEPA_M_CC';
type IrelandScenario = 'IE_10' | 'IE_20' | 'IE_100' | 'IE_200' | 'IE_1000';
type Zone = 'FZ2' | 'FZ3';
const DATASETS: DataRegion[] = ['england', 'wales', 'scotland', 'ireland'];
const FLOOD_ZONE_2_COLOR = '#47c5ce';
const FLOOD_ZONE_3_COLOR = '#2464a5';
const SCOTLAND_SCENARIOS: Array<{ id: ScotlandScenario; label: string; color: string }> = [
  { id: 'SEPA_H', label: 'High · 10 yr', color: FLOOD_ZONE_3_COLOR },
  { id: 'SEPA_M', label: 'Medium · 200 yr', color: FLOOD_ZONE_2_COLOR },
  { id: 'SEPA_L', label: 'Low · 1,000 yr', color: FLOOD_ZONE_2_COLOR },
  { id: 'SEPA_M_CC', label: 'Medium + climate change', color: FLOOD_ZONE_2_COLOR },
];
const IRELAND_SCENARIOS: Array<{ id: IrelandScenario; label: string; color: string }> = [
  { id: 'IE_10', label: 'High · 10 yr', color: FLOOD_ZONE_3_COLOR },
  { id: 'IE_20', label: 'High · 20 yr', color: FLOOD_ZONE_3_COLOR },
  { id: 'IE_100', label: 'Medium · 100 yr', color: FLOOD_ZONE_2_COLOR },
  { id: 'IE_200', label: 'Medium · 200 yr', color: FLOOD_ZONE_2_COLOR },
  { id: 'IE_1000', label: 'Low · 1,000 yr', color: FLOOD_ZONE_2_COLOR },
];

const sourceIdFor = (region: DataRegion): string => `flood-zones-${region}`;
const layerIdFor = (region: DataRegion, category: string): string => `${region}-${category}`;
const categoriesFor = (region: DataRegion): string[] => region === 'scotland'
  ? SCOTLAND_SCENARIOS.map(({ id }) => id)
  : region === 'ireland'
    ? IRELAND_SCENARIOS.map(({ id }) => id)
    : ['FZ2', 'FZ3'];
const categoryColor = (region: DataRegion, category: string): string => {
  if (region === 'scotland') {
    return SCOTLAND_SCENARIOS.find(({ id }) => id === category)?.color ?? FLOOD_ZONE_3_COLOR;
  }
  if (region === 'ireland') {
    return IRELAND_SCENARIOS.find(({ id }) => id === category)?.color ?? FLOOD_ZONE_3_COLOR;
  }
  return category === 'FZ2' ? FLOOD_ZONE_2_COLOR : FLOOD_ZONE_3_COLOR;
};
const visibleCategoriesFor = (
  region: DataRegion,
  zones: Record<Zone, boolean>,
  scotlandScenario: ScotlandScenario,
  irelandScenario: IrelandScenario,
): string[] => region === 'scotland'
  ? [scotlandScenario]
  : region === 'ireland'
    ? [irelandScenario]
    : (['FZ2', 'FZ3'] as const).filter((zone) => zones[zone]);

interface RegionConfig {
  label: string;
  bounds: [[number, number], [number, number]];
  intro: string;
  title: string;
  subtitle: string;
  searchLabel: string;
  places: Array<{ name: string; center: [number, number]; zoom: number }>;
}

const REGION_CONFIG: RegionConfig = {
  label: 'Britain and the Republic of Ireland',
  bounds: [[-11.3, 49.8], [2.1, 61.2]],
  intro: 'Explore flood maps from separate national sources.',
  title: 'Britain and Republic of Ireland flood map',
  subtitle: 'Separate national flood datasets',
  searchLabel: 'Find a postcode in Great Britain',
  places: [
    { name: 'London', center: [-0.12, 51.5], zoom: 10 },
    { name: 'Ely', center: [0.264, 52.399], zoom: 11 },
    { name: 'Cardiff', center: [-3.18, 51.48], zoom: 11 },
    { name: 'Bangor', center: [-4.13, 53.23], zoom: 11 },
    { name: 'Edinburgh', center: [-3.19, 55.95], zoom: 11 },
    { name: 'Glasgow', center: [-4.25, 55.86], zoom: 11 },
    { name: 'Inverness', center: [-4.23, 57.48], zoom: 11 },
    { name: 'Stornoway', center: [-6.39, 58.21], zoom: 11 },
    { name: 'Dublin', center: [-6.26, 53.35], zoom: 11 },
    { name: 'Cork', center: [-8.47, 51.9], zoom: 11 },
    { name: 'Galway', center: [-9.05, 53.27], zoom: 11 },
    { name: 'Limerick', center: [-8.63, 52.66], zoom: 11 },
    { name: 'Waterford', center: [-7.11, 52.26], zoom: 11 },
  ],
};

const propertyText = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : 'Not supplied';

const FloodMap = () => {
  const container = useRef<HTMLDivElement>(null);
  const toolsPanel = useRef<HTMLElement>(null);
  const detailsPanel = useRef<HTMLElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const searchAbort = useRef<AbortController | null>(null);
  const [status, setStatus] = useState(
    'Loading the basemap and flood data…',
  );
  const [dataReady, setDataReady] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [basemap, setBasemap] = useState<'map' | 'satellite'>('map');
  const [dataError, setDataError] = useState(false);
  const [mapError, setMapError] = useState('');
  const [zones, setZones] = useState<Record<Zone, boolean>>({ FZ2: true, FZ3: true });
  const zonesRef = useRef(zones);
  const [scotlandScenario, setScotlandScenario] = useState<ScotlandScenario>('SEPA_H');
  const scotlandScenarioRef = useRef<ScotlandScenario>(scotlandScenario);
  const [irelandScenario, setIrelandScenario] = useState<IrelandScenario>('IE_100');
  const irelandScenarioRef = useRef<IrelandScenario>(irelandScenario);
  const [opacity, setOpacity] = useState(65);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [postcode, setPostcode] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [searching, setSearching] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const regionConfig = REGION_CONFIG;

  const closeTools = (): void => {
    setPanelOpen(false);
    requestAnimationFrame(() => mapRef.current?.getCanvas().focus());
  };

  const handleZoneChange = (zone: 'FZ2' | 'FZ3', checked: boolean): void => {
    zonesRef.current = { ...zonesRef.current, [zone]: checked };
    setZones(zonesRef.current);
    setSelection(null);
  };

  useEffect(() => {
    if (!container.current) return;
    let disposed = false;
    const sourceFailed = new Set<DataRegion>();
    let keyboardInspection = false;
    const abort = new AbortController();
    let map: Map;
    setDataReady(false);
    setMapReady(false);
    setDataError(false);
    setMapError('');
    setSearching(false);
    setSearchStatus('');
    setSelection(null);
    setStatus(`Loading the basemap and ${regionConfig.label} flood data…`);
    try {
      map = new Map({
        container: container.current,
        style: 'https://tiles.openfreemap.org/styles/positron',
        bounds: regionConfig.bounds,
        fitBoundsOptions: { padding: 35 },
        attributionControl: { compact: true },
      });
    } catch {
      setStatus('The map is unavailable.');
      setMapError(
        'The map could not start. Check that your browser supports WebGL.',
      );
      return;
    }
    mapRef.current = map;
    const canvas = map.getCanvas();
    canvas.setAttribute(
      'aria-label',
      'Flood map. Arrow keys pan; plus and minus zoom. Enter inspects the centre.',
    );
    const handleMapKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      keyboardInspection = true;
      map.fire('click', {
        point: map.project(map.getCenter()),
        lngLat: map.getCenter(),
      });
      keyboardInspection = false;
    };
    canvas.addEventListener('keydown', handleMapKeyDown);
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.on('error', (event) => {
      if (disposed) return;
      const failedRegion = 'sourceId' in event
        ? DATASETS.find((dataset) => event.sourceId === sourceIdFor(dataset))
        : undefined;
      if (failedRegion) {
        sourceFailed.add(failedRegion);
        setDataReady(sourceFailed.size < DATASETS.length);
        setDataError(true);
        setStatus(
          `${failedRegion[0].toUpperCase()}${failedRegion.slice(1)} flood tiles could not be processed. The combined overlay may be incomplete. Please retry.`,
        );
      } else {
        setMapError(
          'A basemap request failed. Some background detail may be missing; retry to reload.',
        );
      }
    });
    map.on('load', async () => {
      // Add imagery above the cartographic basemap and below the flood layers.
      // Switching visibility preserves loaded flood tiles and the current view.
      map.addSource('satellite', {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '<a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9" target="_blank" rel="noreferrer">Powered by Esri</a> — Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
      });
      map.addLayer({
        id: 'satellite',
        type: 'raster',
        source: 'satellite',
        layout: { visibility: 'none' },
        paint: { 'raster-fade-duration': 0 },
      });
      setMapReady(true);
      try {
        const archives: Array<{
          dataset: DataRegion;
          source: Awaited<ReturnType<typeof loadFloodTileSource>>;
          archive: PMTiles;
        }> = [];
        for (const dataset of DATASETS) {
          try {
            const source = await loadFloodTileSource(dataset, abort.signal);
            const archive = new PMTiles(source);
            const header = await archive.getHeader();
            if (header.tileType !== 1) throw new Error('Expected vector tiles');
            archives.push({ dataset, source, archive });
          } catch {
            sourceFailed.add(dataset);
          }
        }
        if (!archives.length) throw new Error('Neither regional flood archive could be loaded.');
        if (disposed) return;
        for (const { archive } of archives) tileProtocol.add(archive);
        setStatus(`Loading ${regionConfig.label} flood tiles for this view…`);
        if (sourceFailed.size) setDataError(true);
        let layersAdded = false;
        const handleSourceData = (): void => {
          if (disposed || !layersAdded) return;
          const available = archives.map(({ dataset }) => dataset).filter((dataset) => !sourceFailed.has(dataset));
          if (!available.length || available.some((dataset) => !map.isSourceLoaded(sourceIdFor(dataset)))) return;
          setDataReady(true);
          setDataError(sourceFailed.size > 0);
          setStatus(
            sourceFailed.size
              ? 'Some regional data could not load; available coverage is shown.'
              : `${regionConfig.label} flood data loaded for this view. Select a shaded area to inspect it.`,
          );
        };
        map.on('sourcedata', handleSourceData);
        map.on('idle', handleSourceData);
        map.on('sourcedataloading', (event) => {
          if (!disposed && DATASETS.some((dataset) => event.sourceId === sourceIdFor(dataset))) {
            setStatus(`Loading ${regionConfig.label} flood tiles for this view…`);
          }
        });
        for (const { dataset, source } of archives) {
          const sourceId = sourceIdFor(dataset);
          map.addSource(sourceId, {
            type: 'vector',
            url: `pmtiles://${source.getKey()}`,
            attribution: dataset === 'wales'
              ? 'Flood zones © Natural Resources Wales, licensed under OGL'
              : dataset === 'scotland'
                ? 'Flood extents © SEPA 2025, licensed under OGL v3.0'
              : dataset === 'ireland'
                ? 'Contains Office of Public Works information © Office of Public Works'
                : 'Flood zones © Environment Agency',
          });
          for (const zone of categoriesFor(dataset)) {
            map.addLayer({
              id: layerIdFor(dataset, zone),
              type: 'fill',
              source: sourceId,
              'source-layer': 'flood_zones',
              layout: {
                visibility: dataset === 'scotland'
                  ? (scotlandScenarioRef.current === zone ? 'visible' : 'none')
                  : dataset === 'ireland'
                    ? (irelandScenarioRef.current === zone ? 'visible' : 'none')
                    : zonesRef.current[zone as Zone] ? 'visible' : 'none',
              },
              filter: ['==', ['get', 'flood_zone'], zone],
              paint: {
                'fill-color': categoryColor(dataset, zone),
                'fill-opacity': 0.65,
              },
            });
          }
        }
        layersAdded = true;
        handleSourceData();
      } catch (error) {
        if (disposed) return;
        setDataError(true);
        setDataReady(false);
        const preparing = error instanceof Error && error.message.includes('HTTP 404');
        setStatus(preparing
          ? 'Flood layer is being prepared. The basemap is ready; flood coverage is not available yet.'
          : 'Flood-zone tiles could not be loaded. Please retry; the shaded coverage may be incomplete.');
      }
    });
    map.on('click', (event) => {
      const layers = DATASETS.flatMap((dataset) =>
        visibleCategoriesFor(dataset, zonesRef.current, scotlandScenarioRef.current, irelandScenarioRef.current)
          .map((zone) => layerIdFor(dataset, zone)),
      ).filter((id) => map.getLayer(id));
      if (!layers.length) return;
      const feature: MapGeoJSONFeature | undefined = map
        .queryRenderedFeatures(event.point, { layers })
        .sort(
          (a, b) =>
            Number(b.properties.flood_zone === 'FZ3') -
            Number(a.properties.flood_zone === 'FZ3'),
        )[0];
      if (!feature) {
        setSelection(null);
        return;
      }
      const selectedRegion: DataRegion = feature.source.includes('-scotland')
        ? 'scotland'
        : feature.source.includes('-ireland') ? 'ireland'
          : feature.source.includes('-wales') ? 'wales' : 'england';
      setSelection({
        zone: propertyText(selectedRegion === 'scotland'
          ? feature.properties.probability
          : feature.properties.flood_zone),
        origin: propertyText(feature.properties.origin),
        region: selectedRegion,
        source: propertyText(
          feature.properties.flood_source ?? feature.properties.risk,
        ),
        date: propertyText(feature.properties.pub_date ?? feature.properties.source_date),
        scenario: propertyText(feature.properties.scenario),
        reference: propertyText(feature.properties.reference),
      });
      setPanelOpen(true);
      const focusDetails = keyboardInspection;
      requestAnimationFrame(() => {
        detailsPanel.current?.scrollIntoView({ block: 'nearest' });
        if (focusDetails) detailsPanel.current?.focus();
      });
    });
    map.on('mousemove', (event) => {
      const layers = DATASETS.flatMap((dataset) =>
        visibleCategoriesFor(dataset, zonesRef.current, scotlandScenarioRef.current, irelandScenarioRef.current)
          .map((zone) => layerIdFor(dataset, zone)),
      ).filter((id) => map.getLayer(id));
      map.getCanvas().style.cursor =
        layers.length &&
        map.queryRenderedFeatures(event.point, { layers }).length
          ? 'pointer'
          : '';
    });
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);
    return () => {
      disposed = true;
      abort.abort();
      searchAbort.current?.abort();
      searchAbort.current = null;
      observer.disconnect();
      canvas.removeEventListener('keydown', handleMapKeyDown);
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    const map = mapRef.current;
    if (mapReady && map?.getLayer('satellite')) {
      map.setLayoutProperty('satellite', 'visibility', basemap === 'satellite' ? 'visible' : 'none');
    }
  }, [basemap, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!dataReady || !map) return;
    for (const dataset of DATASETS) {
      for (const zone of categoriesFor(dataset)) {
        const layerId = layerIdFor(dataset, zone);
        if (!map.getLayer(layerId)) continue;
        const visible = dataset === 'scotland'
          ? scotlandScenario === zone
          : dataset === 'ireland'
            ? irelandScenario === zone
            : zones[zone as Zone];
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
        map.setPaintProperty(layerId, 'fill-opacity', opacity / 100);
      }
    }
    setSelection(null);
  }, [zones, scotlandScenario, opacity, dataReady]);

  useEffect(() => {
    scotlandScenarioRef.current = scotlandScenario;
  }, [scotlandScenario]);

  useEffect(() => {
    irelandScenarioRef.current = irelandScenario;
  }, [irelandScenario]);

  const handleSearch = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!postcode.trim() || !mapRef.current) return;
    searchAbort.current?.abort();
    const abort = new AbortController();
    searchAbort.current = abort;
    setSearching(true);
    setSearchStatus('Finding your postcode…');
    try {
      const response = await fetch(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.trim())}`,
        { signal: abort.signal },
      );
      if (response.status === 404)
        throw new Error('Postcode not found. Enter a full postcode.');
      if (!response.ok)
        throw new Error(
          'Postcode search is unavailable. Try a place shortcut.',
        );
      const data = await response.json();
      if (abort.signal.aborted || searchAbort.current !== abort) return;
      const result = data.result;
      if (!['England', 'Wales', 'Scotland'].includes(result?.country))
        throw new Error('Postcode search covers Great Britain. Use the place shortcuts to explore Ireland.');
      if (
        !Number.isFinite(result.longitude) ||
        !Number.isFinite(result.latitude)
      )
        throw new Error('This postcode has no map location.');
      const center: [number, number] = [result.longitude, result.latitude];
      mapRef.current?.flyTo({ center, zoom: 13, essential: false });
      markerRef.current?.remove();
      if (mapRef.current)
        markerRef.current = new Marker({ color: '#102b3a' })
          .setLngLat(center)
          .addTo(mapRef.current);
      setSearchStatus(
        `${result.postcode} located. The pin shows the postcode centre, not an individual property.`,
      );
      setSelection(null);
      closeTools();
    } catch (error) {
      if (!abort.signal.aborted)
        setSearchStatus(
          error instanceof Error
            ? error.message
            : 'Unable to search this postcode.',
        );
    } finally {
      if (!abort.signal.aborted) setSearching(false);
    }
  };

  return (
    <main className="flood-app">
      <a
        className="skip-link"
        href="#map-tools"
        onClick={(event) => {
          event.preventDefault();
          setPanelOpen(true);
          requestAnimationFrame(() => toolsPanel.current?.focus());
        }}
      >
        Skip to map tools
      </a>
      <button
        className="mobile-panel-toggle"
        aria-expanded={panelOpen}
        aria-controls="map-tools"
        onClick={() => {
          if (panelOpen) closeTools();
          else {
            setPanelOpen(true);
            requestAnimationFrame(() => toolsPanel.current?.focus());
          }
        }}
      >
        {panelOpen ? 'Close tools ↓' : 'Search & map tools ↑'}
      </button>
      <aside
        ref={toolsPanel}
        id="map-tools"
        className={`flood-sidebar ${panelOpen ? 'is-open' : ''}`}
        aria-label="Flood map tools"
        tabIndex={-1}
      >
        <header className="atlas-brand">
          <span className="brand-symbol" aria-hidden="true">
            ≈
          </span>
          <span>
            FLOODPLAIN ATLAS<small>Britain and Ireland</small>
          </span>
        </header>
        <div className="sidebar-content">
          <h1>{regionConfig.title}</h1>
          <p className="intro">{regionConfig.intro}</p>
          <div className="basemap-switch" role="group" aria-label="Basemap">
            <button aria-pressed={basemap === 'map'} onClick={() => setBasemap('map')}>
              Map
            </button>
            <button aria-pressed={basemap === 'satellite'} onClick={() => setBasemap('satellite')}>
              Satellite
            </button>
          </div>
          <form onSubmit={handleSearch} className="postcode-form">
            <label htmlFor="postcode">{regionConfig.searchLabel}</label>
            <div className="search-field">
              <input
                id="postcode"
                value={postcode}
                onChange={(event) => setPostcode(event.target.value)}
                placeholder="e.g. CB7 4JH or CF10 3NQ"
                autoComplete="postal-code"
                maxLength={12}
                required
              />
              <button
                type="submit"
                disabled={searching || !postcode.trim()}
                aria-label="Search postcode"
              >
                {searching ? '…' : '→'}
              </button>
            </div>
            <p className="search-status" role="status">
              {searchStatus || 'GB postcodes via postcodes.io · Ireland place shortcuts below'}
            </p>
          </form>
          <div className="place-list" aria-label="Explore a place">
            {regionConfig.places.map((place) => (
              <button
                key={place.name}
                onClick={() => {
                  mapRef.current?.flyTo({
                    center: place.center,
                    zoom: place.zoom,
                  });
                  closeTools();
                }}
              >
                {place.name}
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
          <section className="layer-section" aria-labelledby="layers-title">
            <div className="section-heading">
              <h2 id="layers-title">Map layers</h2>
              <span>REGIONAL DATASETS</span>
            </div>
            <p className="section-note">
              England and Wales zones stay visible together. Scotland uses SEPA probability scenarios and Ireland uses OPW return periods; each is selected separately.
            </p>
            <label className="zone-row">
              <span className="zone-swatch zone-two" />
              <span>
                <strong>Flood Zone 2</strong>
                <small>Definitions vary by source</small>
              </span>
              <input
                type="checkbox"
                checked={zones.FZ2}
                onChange={(event) =>
                  handleZoneChange('FZ2', event.target.checked)
                }
              />
            </label>
            <label className="zone-row">
              <span className="zone-swatch zone-three" />
              <span>
                <strong>Flood Zone 3</strong>
                <small>Definitions vary by source</small>
              </span>
              <input
                type="checkbox"
                checked={zones.FZ3}
                onChange={(event) =>
                  handleZoneChange('FZ3', event.target.checked)
                }
              />
            </label>
            <div className="scotland-scenarios" role="group" aria-label="Scotland flood scenario">
              <strong>Scotland · SEPA extent</strong>
              {SCOTLAND_SCENARIOS.map(({ id, label, color }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={scotlandScenario === id}
                  onClick={() => {
                    scotlandScenarioRef.current = id;
                    setScotlandScenario(id);
                    setSelection(null);
                  }}
                >
                  <i style={{ backgroundColor: color }} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
            <div className="scotland-scenarios" role="group" aria-label="Ireland flood scenario">
              <strong>Ireland · OPW current scenario</strong>
              {IRELAND_SCENARIOS.map(({ id, label, color }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={irelandScenario === id}
                  onClick={() => {
                    irelandScenarioRef.current = id;
                    setIrelandScenario(id);
                    setSelection(null);
                  }}
                >
                  <i style={{ backgroundColor: color }} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
            <div className="opacity-label">
              <label htmlFor="opacity">Overlay opacity</label>
              <output htmlFor="opacity">{opacity}%</output>
            </div>
            <input
              className="opacity-range"
              id="opacity"
              type="range"
              min="10"
              max="100"
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
            />
          </section>
          <section
            ref={detailsPanel}
            tabIndex={-1}
            className="feature-card"
            aria-live="polite"
            aria-labelledby="feature-title"
          >
            <span className="eyebrow">Area inspection</span>
            <h2 id="feature-title">
              {selection
                ? selection.region === 'scotland'
                  ? `${selection.zone} probability`
                  : selection.region === 'ireland'
                    ? `${selection.zone.replace('IE_', '')}-year extent`
                    : `Flood Zone ${selection.zone === 'FZ3' ? '3' : '2'}`
                : 'Select an area'}
            </h2>
            {selection ? (
              <dl>
                <dt>{selection.region === 'scotland' ? 'Probability' : selection.region === 'ireland' ? 'Return period' : 'Flood zone'}</dt>
                <dd>{selection.zone}</dd>
                <dt>Country</dt>
                <dd>{selection.region === 'ireland' ? 'Republic of Ireland' : `${selection.region[0].toUpperCase()}${selection.region.slice(1)}`}</dd>
                <dt>Origin</dt>
                <dd>{selection.origin}</dd>
                {selection.region === 'scotland' && <>
                  <dt>Scenario</dt>
                  <dd>{selection.scenario}</dd>
                  {selection.reference !== 'Not supplied' && <>
                    <dt>Area reference</dt>
                    <dd>{selection.reference}</dd>
                  </>}
                  <dt>SEPA release</dt>
                  <dd>v3.0 · {selection.date}</dd>
                </>}
                {selection.region === 'ireland' && <>
                  <dt>Scenario</dt>
                  <dd>{selection.scenario}</dd>
                  <dt>Source</dt>
                  <dd>{selection.origin}</dd>
                  {selection.date !== 'Not supplied' && <>
                    <dt>Source date</dt>
                    <dd>{selection.date}</dd>
                  </>}
                  {selection.reference !== 'Not supplied' && <>
                    <dt>Area reference</dt>
                    <dd>{selection.reference}</dd>
                  </>}
                </>}
                {selection.region === 'england' && <>
                  <dt>Flood source</dt>
                  <dd>{selection.source}</dd>
                </>}
                {selection.region === 'wales' && selection.date !== 'Not supplied' && <>
                  <dt>Source date</dt>
                  <dd>{selection.date}</dd>
                </>}
              </dl>
            ) : (
              <p>
                Select a shaded area on the map to see its source and scenario.
                Keyboard users can focus the map and press Enter at its centre.
              </p>
            )}
          </section>
          <details className="coverage-note">
            <summary>Data, coverage and attribution</summary>
            <p>
              England, Wales, Scotland and the Republic of Ireland use separate datasets and classifications. Scotland and Ireland each show one selected scenario at a time. Ireland return periods combine only source products that publish that period: 20-year is NIFM river; 200-year is coastal; 100-year is CFRAM and NIFM river; 10- and 1,000-year include the available river and coastal products. Colors group source High scenarios in dark blue and Medium/Low in light blue; they do not make the classifications identical. Ireland coverage excludes Northern Ireland. Unshaded areas do not guarantee safety. These are strategic and planning layers, not live warnings or property-level assessments.
            </p>
            <p>Environment Agency — Flood Map for Planning, Flood Zones. Source data date unverified. © Environment Agency copyright and/or database right. All rights reserved.</p>
            <a href="https://environment.data.gov.uk/dataset/04532375-a198-476e-985e-0579a0a11b47" target="_blank" rel="noreferrer">Environment Agency source description ↗</a>
            <p>Natural Resources Wales — Flood Map for Planning, River and Sea Flood Zones 2 and 3. Publication date: 21 May 2026. Includes climate-change allowances; assumes no defences.</p>
            <p>Contains Natural Resources Wales information © Natural Resources Wales and database right. All rights reserved. Some features of this information are based on digital spatial data licensed from the UK Centre for Ecology &amp; Hydrology © UKCEH. Defra, Met Office and DARD Rivers Agency © Crown copyright. © Cranfield University. © James Hutton Institute. Contains OS data © Crown copyright and database right.</p>
            <a href="https://datamap.gov.wales/layergroups/inspire-nrw:FloodMapforPlanningFloodZones2and3/metadata_detail" target="_blank" rel="noreferrer">NRW data and attribution ↗</a>
            <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noreferrer">Open Government Licence v3 ↗</a>
            <p>Scottish Environment Protection Agency — Flood Map v3.0 river and coastal extents, published 25 February 2025. © SEPA 2025; licensed under the Open Government Licence 3.0.</p>
            <a href="/sources/sepa-river-attribution-v3.pdf" target="_blank" rel="noreferrer">SEPA river dataset attribution statements ↗</a>
            <a href="/sources/sepa-coastal-attribution-v3.pdf" target="_blank" rel="noreferrer">SEPA coastal dataset attribution statements ↗</a>
            <a href="https://www2.sepa.org.uk/FloodData/" target="_blank" rel="noreferrer">SEPA flood data and release notes ↗</a>
            <p>Republic of Ireland — OPW CFRAM, NIFM and National Coastal Flood Hazard Mapping current-scenario river and coastal extents. Source and return-period distinctions are retained; Northern Ireland is not included.</p>
            <p>Contains Office of Public Works information © Office of Public Works.</p>
            <a href="https://www.floodinfo.ie/open-spatial-data-portal/data-catalogue/" target="_blank" rel="noreferrer">OPW open spatial data catalogue ↗</a>
          </details>
          <details className="coverage-note landscape-note">
              <summary>Land and water</summary>
              <p>
                Flood Zones 2 and 3 map areas used in planning for river and sea
                flooding. Explore them alongside the landscapes shaped by water
                and by people.
              </p>
              <p>
                Ely stands on higher ground in the Fens, once an island within
                surrounding marshland. Large-scale drainage changed the Fens in
                the 17th century.
              </p>
              <a
                href="https://www.gov.uk/government/publications/fens-2100/fens-2100-summary-baseline-report"
                target="_blank"
                rel="noreferrer"
              >
                Fens 2100+ history and landscape ↗
              </a>
          </details>
        </div>
        <footer className="sidebar-footer">
            ENGLAND + WALES + SCOTLAND + REPUBLIC OF IRELAND FLOOD DATA
          <span>FLOODPLAIN ATLAS © {new Date().getFullYear()}</span>
        </footer>
      </aside>
      <section className="map-stage" aria-label="Interactive Britain and Ireland flood map">
        <div ref={container} className="map-canvas" />
        <div className="map-title">
          <span className="live-dot" />
          <span>
            BRITAIN + IRELAND<strong>{regionConfig.subtitle}</strong>
          </span>
        </div>
        <button
          className="reset-view"
          onClick={() =>
            mapRef.current?.fitBounds(regionConfig.bounds, { padding: 35 })
          }
        >
          ⌖ <span>Britain + Ireland overview</span>
        </button>
        <div
          className={`map-status ${dataError || mapError ? 'has-error' : ''}`}
          role="status"
        >
          <span className="status-dot" />
          <span>{status}{mapError ? ` ${mapError}` : ''}</span>
          {(dataError || mapError) && (
            <button onClick={() => setAttempt(attempt + 1)}>Retry</button>
          )}
        </div>
        <div className="map-legend" aria-label="Map legend">
          <span>
            <i className="zone-two" />
            Zone 2{!zones.FZ2 && ' (hidden)'}
          </span>
          <span>
            <i className="zone-three" />
            Zone 3{!zones.FZ3 && ' (hidden)'}
          </span>
          <span>
            <i style={{ backgroundColor: categoryColor('scotland', scotlandScenario) }} />
            Scotland: {SCOTLAND_SCENARIOS.find(({ id }) => id === scotlandScenario)?.label}
          </span>
          <span>
            <i style={{ backgroundColor: categoryColor('ireland', irelandScenario) }} />
            Ireland: {IRELAND_SCENARIOS.find(({ id }) => id === irelandScenario)?.label}
          </span>
          <small>SIMPLIFIED EXTENTS</small>
        </div>
      </section>
    </main>
  );
};

export default FloodMap;
