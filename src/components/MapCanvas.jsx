/**
 * @fileoverview Lienzo Cartográfico Interactivo (`MapCanvas.jsx`).
 *
 * Construido sobre `@vis.gl/react-google-maps` (Google Maps JavaScript API v3 + Advanced Markers):
 * - En modo **Armar Ruta (`tab === 'ruta'`)**:
 *   Renderiza marcadores numerados para cada parada, el pin del Almacén CEDIS, polilíneas reales
 *   decodificadas por carretera (`RoutePolylines`) y permite agregar paradas haciendo clic en el mapa.
 * - En modo **Catálogo de Tiendas (`tab === 'auditoria'`)**:
 *   Renderiza los pines de todas las sucursales diferenciando verificadas vs. pendientes, permite
 *   arrastrar el marcador seleccionado (`draggable`) para corregir su ubicación, muestra una línea
 *   punteada desde la coordenada original de catálogo e integra Google Street View (`StreetViewModal`)
 *   con orientación automática (`computeHeading`) hacia el pin de la sucursal.
 */

import { useEffect, useState, useRef, useMemo } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import {
  CornersOut,
  MapTrifold,
  GlobeHemisphereWest,
  TagSimple,
  ArrowSquareOut,
  CheckCircle,
  Warning,
  Crosshair,
  Binoculars,
  X,
  ArrowClockwise,
  Warehouse,
  MapPinPlus,
  LockKey,
  LockKeyOpen,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ActionTooltip } from '@/components/ui/tooltip';
import {
  TypographySmall,
  TypographyMuted,
  TypographyMono,
} from '@/components/ui/typography';
import { cn, decodePolyline, haversineM, rumboCardinal, pesos, duracion } from '@/lib/utils';

/**
 * Subcomponente que dibuja las polilíneas de la ruta activa o el vector de corrección GPS
 * directamente sobre la instancia nativa de Google Maps.
 */
function RoutePolylines({ puntos, tramos, tab, sel }) {
  const map = useMap();
  const linesRef = useRef([]);

  useEffect(() => {
    linesRef.current.forEach((l) => l.setMap(null));
    linesRef.current = [];
    if (!map || !window.google?.maps) return;

    if (tab === 'ruta' && puntos.length >= 2) {
      for (let i = 0; i < puntos.length - 1; i++) {
        const t = tramos[i];
        const path = t?.polyline
          ? decodePolyline(t.polyline)
          : [
              { lat: puntos[i].lat, lng: puntos[i].lng },
              { lat: puntos[i + 1].lat, lng: puntos[i + 1].lng },
            ];
        const recta = !t?.polyline;
        const poly = new window.google.maps.Polyline({
          map,
          path,
          strokeColor: '#2563eb',
          strokeOpacity: recta ? 0 : 0.9,
          strokeWeight: 4,
          icons: recta
            ? [
                {
                  icon: {
                    path: 'M 0,-1 0,1',
                    strokeOpacity: 0.9,
                    strokeColor: '#2563eb',
                    scale: 3,
                  },
                  offset: '0',
                  repeat: '14px',
                },
              ]
            : [],
        });
        linesRef.current.push(poly);
      }
    }

    if (tab === 'corregir' && sel?.orig && sel?.lat != null && haversineM(sel.orig, sel) > 1) {
      const line = new window.google.maps.Polyline({
        map,
        path: [sel.orig, { lat: sel.lat, lng: sel.lng }],
        strokeOpacity: 0,
        icons: [
          {
            icon: {
              path: 'M 0,-1 0,1',
              strokeOpacity: 1,
              strokeColor: '#f59e0b',
              scale: 3,
            },
            offset: '0',
            repeat: '10px',
          },
        ],
      });
      linesRef.current.push(line);
    }

    return () => {
      linesRef.current.forEach((l) => l.setMap(null));
      linesRef.current = [];
    };
  }, [map, puntos, tramos, tab, sel]);

  return null;
}

function MapCameraController({ tiendas, puntos, tab, sel, fitTrigger }) {
  const map = useMap();
  const lastSelName = useRef(null);
  const initialFitDone = useRef(false);

  useEffect(() => {
    if (!map || !window.google?.maps) return;
    const pts = tab === 'ruta' && puntos.length >= 2 ? puntos : tiendas;
    if (!pts.length) return;
    if (!initialFitDone.current || fitTrigger > 0) {
      initialFitDone.current = true;
      const bounds = new window.google.maps.LatLngBounds();
      pts.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(bounds, 56);
    }
  }, [map, tiendas.length, puntos.length, tab, fitTrigger]);

  useEffect(() => {
    if (!map || tab !== 'corregir' || !sel || sel.lat == null) return;
    if (lastSelName.current !== sel.nombre) {
      lastSelName.current = sel.nombre;
      map.panTo({ lat: sel.lat, lng: sel.lng });
      if ((map.getZoom() || 8) < 18) map.setZoom(18);
    } else {
      map.panTo({ lat: sel.lat, lng: sel.lng });
    }
  }, [map, tab, sel?.nombre, sel?.lat, sel?.lng]);

  return null;
}

export function MapCanvas({
  mapsKey,
  tiendas,
  baseNombre,
  ruta,
  puntos,
  tramos,
  totales,
  tab,
  sel,
  onToggleStop,
  onAddDetour,
  onSelectStore,
  onUnlockSelected,
  onMoveSelected,
  onSaveSelected,
}) {
  const [authError, setAuthError] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(true);
  const [mapType, setMapType] = useState('roadmap');
  const [showLabels, setShowLabels] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);

  useEffect(() => {
    setMapType(tab === 'corregir' ? 'hybrid' : 'roadmap');
  }, [tab]);

  useEffect(() => {
    if (!mapsKey) return;
    setAuthError(false);
    const prev = window.gm_authFailure;
    window.gm_authFailure = () => setAuthError(true);
    return () => {
      window.gm_authFailure = prev;
    };
  }, [mapsKey]);

  const paradasPorNombre = useMemo(() => {
    const m = new globalThis.Map();
    ruta.paradas.forEach((p, idx) => {
      if (!p.temporal) {
        const prev = m.get(p.nombre) || [];
        m.set(p.nombre, [...prev, idx + 1]);
      }
    });
    return m;
  }, [ruta.paradas]);

  const googleMapsRouteUrl = useMemo(() => {
    if (puntos.length < 2) return null;
    return 'https://www.google.com/maps/dir/' + puntos.map((p) => `${p.lat},${p.lng}`).join('/');
  }, [puntos]);

  const fallbackEmbedUrl = useMemo(() => {
    let lat = 16.752,
      lng = -93.116,
      z = 12,
      t = mapType === 'hybrid' ? 'h' : 'm';
    if (tab === 'corregir' && sel && sel.lat != null) {
      lat = sel.lat;
      lng = sel.lng;
      z = 19;
      t = 'h';
    } else if (ruta.paradas.length) {
      const u = ruta.paradas.at(-1);
      lat = u.lat;
      lng = u.lng;
      z = 14;
    } else {
      const b = tiendas.find((x) => x.nombre === baseNombre) || tiendas[0];
      if (b) {
        lat = b.lat;
        lng = b.lng;
        z = 13;
      }
    }
    return `https://www.google.com/maps?q=${lat},${lng}&hl=es&z=${z}&t=${t}&output=embed`;
  }, [tab, sel?.lat, sel?.lng, ruta.paradas, tiendas, baseNombre, mapType]);

  const selBloqueada = Boolean(sel && !sel.nueva && sel.verificada && !sel.desbloqueada);
  const deltaMeters = sel?.orig && sel?.lat != null ? haversineM(sel.orig, sel) : 0;
  const rumbo = sel?.orig && sel?.lat != null ? rumboCardinal(sel.orig, sel) : '';

  return (
    <div className="relative h-full w-full bg-muted/40 overflow-hidden select-none">
      {/* ================= RESUMEN DE RUTA ACTIVA (SOLO SI HAY PARADAS) ================= */}
      {tab === 'ruta' && ruta.paradas.length > 0 && (
        <div className="pointer-events-none absolute left-3 top-3 z-20 max-w-[65%]">
          <Card className="pointer-events-auto flex flex-wrap items-center gap-2.5 border-border/80 bg-card/95 px-3 py-1.5 shadow-md backdrop-blur-md">
            <TypographySmall className="font-semibold tabular-nums">
              {totales.km} km
            </TypographySmall>
            <Separator orientation="vertical" className="h-3.5" />
            <TypographyMuted className="tabular-nums text-xs">
              {totales.seg ? duracion(totales.seg) : '0 min'}
            </TypographyMuted>
            <Separator orientation="vertical" className="h-3.5" />
            <TypographyMuted className="tabular-nums text-xs">
              {pesos(totales.costo)}
            </TypographyMuted>
            <Separator orientation="vertical" className="h-3.5" />
            <span className="text-xs font-medium text-muted-foreground tabular-nums">
              {ruta.paradas.length} {ruta.paradas.length === 1 ? 'parada' : 'paradas'}
            </span>
          </Card>
        </div>
      )}

      {/* ================= CONTROLES DE VISTA (ARRIBA DERECHA) ================= */}
      <Card className="pointer-events-auto absolute right-3 top-3 z-20 flex items-center gap-1 border-border/80 bg-card/95 p-1 shadow-md backdrop-blur-md">
        <ActionTooltip label="Mapa de carreteras">
          <Button
            variant={mapType === 'roadmap' ? 'default' : 'ghost'}
            size="xs"
            onClick={() => setMapType('roadmap')}
          >
            <MapTrifold weight={mapType === 'roadmap' ? 'duotone' : 'regular'} />
            Mapa
          </Button>
        </ActionTooltip>
        <ActionTooltip label="Vista satelital con calles">
          <Button
            variant={mapType === 'hybrid' ? 'default' : 'ghost'}
            size="xs"
            onClick={() => setMapType('hybrid')}
          >
            <GlobeHemisphereWest weight={mapType === 'hybrid' ? 'duotone' : 'regular'} />
            Satélite
          </Button>
        </ActionTooltip>
        {!authError && (
          <>
            <ActionTooltip label="Mostrar u ocultar todos los nombres de tiendas">
              <Button
                variant={showLabels ? 'secondary' : 'ghost'}
                size="xs"
                onClick={() => setShowLabels((v) => !v)}
              >
                <TagSimple weight={showLabels ? 'duotone' : 'regular'} />
                Nombres
              </Button>
            </ActionTooltip>
            <ActionTooltip label="Encuadrar mapa">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setFitTrigger((c) => c + 1)}
              >
                <CornersOut weight="bold" />
              </Button>
            </ActionTooltip>
          </>
        )}
        {googleMapsRouteUrl && (
          <ActionTooltip label="Abrir recorrido en Google Maps">
            <Button asChild variant="ghost" size="xs">
              <a href={googleMapsRouteUrl} target="_blank" rel="noopener noreferrer">
                <ArrowSquareOut weight="bold" />
                Maps
              </a>
            </Button>
          </ActionTooltip>
        )}
      </Card>

      {/* ================= BARRA FLOTANTE AL EDITAR COORDENADA ================= */}
      {tab === 'corregir' && sel && (
        <Card className="pointer-events-auto absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-lg border-border bg-card/95 px-3.5 py-2 shadow-lg backdrop-blur-md max-w-[92%]">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {sel.eco && sel.eco !== '0' && (
                <Badge variant="outline" className="font-mono text-[10px] px-1 py-0 text-muted-foreground">
                  ECO {sel.eco}
                </Badge>
              )}
              <TypographySmall className="truncate font-semibold">
                {sel.nombre || 'Nueva tienda'}
              </TypographySmall>
              {selBloqueada && (
                <Badge
                  variant="secondary"
                  className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] gap-1"
                >
                  <LockKey weight="fill" className="h-3 w-3" />
                  Verificada
                </Badge>
              )}
              {sel.zona && (
                <span className="text-[10px] text-muted-foreground font-normal">
                  ({sel.zona})
                </span>
              )}
              {deltaMeters > 1 && (
                <Badge variant="secondary" className="text-[10px]">
                  {deltaMeters < 1000
                    ? `${Math.round(deltaMeters)} m`
                    : `${(deltaMeters / 1000).toFixed(2)} km`}{' '}
                  ({rumbo})
                </Badge>
              )}
            </div>
            <TypographyMono className="text-[11px] text-muted-foreground tabular-nums">
              {sel.lat != null
                ? `${sel.lat.toFixed(6)}, ${sel.lng.toFixed(6)}`
                : 'Haz clic en el mapa para ubicar'}
            </TypographyMono>
          </div>
          {sel.lat != null && (
            <div className="flex items-center gap-1.5">
              <Button asChild variant="outline" size="xs">
                <a
                  href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${sel.lat},${sel.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Binoculars weight="duotone" />
                  Street View
                </a>
              </Button>
              {selBloqueada ? (
                <Button variant="secondary" size="xs" onClick={() => onUnlockSelected?.(true)}>
                  <LockKeyOpen weight="duotone" />
                  Desbloquear pin
                </Button>
              ) : (
                <Button size="xs" onClick={() => onSaveSelected()}>
                  <CheckCircle weight="duotone" />
                  Guardar
                </Button>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ================= LIENZO DE GOOGLE MAPS ================= */}
      {!mapsKey ? (
        <div className="flex h-full w-full items-center justify-center">
          <TypographyMuted>Cargando mapa…</TypographyMuted>
        </div>
      ) : authError ? (
        <div className="flex h-full w-full flex-col pt-14">
          {bannerOpen && (
            <Card className="mx-3 mb-2 flex flex-wrap items-center gap-2 border-border bg-card/95 px-3.5 py-2 shadow-sm">
              <Warning weight="duotone" className="h-4 w-4 text-amber-500 shrink-0" />
              <TypographyMuted>
                <strong className="text-foreground">Propagando Maps JavaScript API…</strong> Presiona
                Reintentar para cargar el mapa interactivo:
              </TypographyMuted>
              <Button size="xs" onClick={() => setAuthError(false)}>
                <ArrowClockwise weight="bold" />
                Reintentar
              </Button>
              <ActionTooltip label="Ocultar aviso">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="ml-auto"
                  onClick={() => setBannerOpen(false)}
                >
                  <X weight="bold" />
                </Button>
              </ActionTooltip>
            </Card>
          )}
          <iframe
            src={fallbackEmbedUrl}
            className="h-full w-full flex-1 border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
            title="Google Maps Sureste"
          />
        </div>
      ) : (
        <APIProvider apiKey={mapsKey} language="es" region="MX">
          <div className="h-full w-full">
            <Map
              defaultCenter={{ lat: 16.75, lng: -92.65 }}
              defaultZoom={8}
              mapId="DEMO_MAP_ID"
              mapTypeId={mapType}
              gestureHandling="greedy"
              disableDefaultUI={false}
              mapTypeControl={false}
              fullscreenControl={false}
              streetViewControl={true}
              clickableIcons={false}
              internalUsageAttributionIds={['gmp_git_agentskills_v1']}
              onClick={(e) => {
                if (tab === 'corregir' && sel && !selBloqueada && e.detail?.latLng) {
                  onMoveSelected(e.detail.latLng.lat, e.detail.latLng.lng);
                }
              }}
              onContextmenu={(e) => {
                if (tab === 'ruta' && e.detail?.latLng) {
                  onAddDetour({ lat: e.detail.latLng.lat, lng: e.detail.latLng.lng });
                }
              }}
              className="h-full w-full"
            >
              <MapCameraController
                tiendas={tiendas}
                puntos={puntos}
                tab={tab}
                sel={sel}
                fitTrigger={fitTrigger}
              />
              <RoutePolylines puntos={puntos} tramos={tramos} tab={tab} sel={sel} />

              {/* Marcadores de tiendas */}
              {tiendas.map((t) => {
                const esSel = tab === 'corregir' && sel?.nombre === t.nombre;
                const nums = tab !== 'corregir' ? paradasPorNombre.get(t.nombre) : null;
                const esBase = tab !== 'corregir' && t.nombre === baseNombre;
                const pos =
                  esSel && sel.lat != null
                    ? { lat: sel.lat, lng: sel.lng }
                    : { lat: t.lat, lng: t.lng };
                const mostrarLbl = showLabels || esSel || Boolean(nums) || esBase;

                return (
                  <AdvancedMarker
                    key={t.nombre}
                    position={pos}
                    title={t.nombre}
                    draggable={esSel && !selBloqueada}
                    zIndex={esSel ? 1000 : nums ? 500 : esBase ? 400 : 25}
                    onClick={() => {
                      if (tab === 'corregir') {
                        if (!sel?.nueva) onSelectStore(t.nombre);
                      } else {
                        onToggleStop(t.nombre);
                      }
                    }}
                    onDragEnd={(e) => {
                      if (esSel && !selBloqueada && e.latLng) {
                        onMoveSelected(e.latLng.lat(), e.latLng.lng());
                      }
                    }}
                  >
                    <div
                      className={cn(
                        'group relative flex items-center cursor-pointer transition-transform',
                        tab === 'corregir' && sel && !esSel && 'opacity-50 hover:opacity-100'
                      )}
                    >
                      <div
                        className={cn(
                          'flex items-center justify-center rounded-full border-2 border-white font-semibold text-white shadow-sm transition-all',
                          esSel
                            ? 'h-7 w-7 bg-blue-600 ring-4 ring-blue-500/35 scale-110'
                            : nums
                              ? 'h-5 min-w-5 px-1 bg-blue-600 text-[10px] ring-2 ring-blue-500/25'
                              : esBase
                                ? 'h-6 w-6 bg-slate-900 ring-2 ring-slate-900/25'
                                : 'h-3 w-3 bg-slate-700 hover:bg-blue-600 group-hover:scale-125'
                        )}
                      >
                        {nums ? (
                          nums.join(',')
                        ) : esSel ? (
                          <Crosshair weight="bold" className="h-3.5 w-3.5" />
                        ) : esBase ? (
                          <Warehouse weight="fill" className="h-3 w-3" />
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          'pointer-events-none absolute left-full ml-1.5 whitespace-nowrap rounded bg-card/95 px-1.5 py-0.5 text-[10px] font-medium text-foreground border border-border/80 shadow-xs',
                          mostrarLbl ? 'inline-flex' : 'hidden group-hover:inline-flex',
                          (esSel || nums) && 'bg-blue-600 text-white border-blue-600 font-semibold'
                        )}
                      >
                        {t.nombre}
                      </span>
                    </div>
                  </AdvancedMarker>
                );
              })}

              {tab === 'corregir' &&
                sel?.orig &&
                sel?.lat != null &&
                haversineM(sel.orig, sel) > 1 && (
                  <AdvancedMarker position={sel.orig} zIndex={850}>
                    <div className="flex items-center gap-1">
                      <span className="h-3 w-3 rounded-full border-2 border-dashed border-amber-400 bg-amber-500/20" />
                      <span className="rounded bg-black/75 px-1.5 py-0.5 text-[10px] text-amber-300">
                        anterior
                      </span>
                    </div>
                  </AdvancedMarker>
                )}

              {tab === 'corregir' && sel?.nueva && sel.lat != null && (
                <AdvancedMarker
                  position={{ lat: sel.lat, lng: sel.lng }}
                  draggable={true}
                  zIndex={1000}
                  onDragEnd={(e) => {
                    if (e.latLng) onMoveSelected(e.latLng.lat(), e.latLng.lng());
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-white shadow-md ring-4 ring-blue-500/35">
                      <MapPinPlus weight="fill" className="h-3.5 w-3.5" />
                    </div>
                    <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                      {sel.nombreEdit || 'Nueva tienda'}
                    </span>
                  </div>
                </AdvancedMarker>
              )}

              {tab === 'ruta' &&
                ruta.paradas.map((p, idx) =>
                  p.temporal ? (
                    <AdvancedMarker
                      key={`temp-${idx}`}
                      position={{ lat: p.lat, lng: p.lng }}
                      zIndex={650}
                    >
                      <div className="flex items-center gap-1">
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-slate-800 px-1 text-[10px] font-semibold text-white shadow-sm">
                          {idx + 1}
                        </span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-xs">
                          {p.nombre}
                        </span>
                      </div>
                    </AdvancedMarker>
                  ) : null
                )}
            </Map>
          </div>
        </APIProvider>
      )}
    </div>
  );
}
