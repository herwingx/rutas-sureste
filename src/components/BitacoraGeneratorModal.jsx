/**
 * @fileoverview Modal Generador de Bitácora Oficial de Combustible Tiendas Neto (`BitacoraGeneratorModal.jsx`).
 *
 * Permite a cualquier ingeniero del equipo:
 * 1. Seleccionar su perfil (`HERWING`, `BRAYAN`, `ROMAN`, `VICTOR`, `OMAR`) y editar/guardar sus datos
 *    vehiculares y administrativos (No. Empleado, Tarjeta de Gasolina, Automóvil, Placas, Serie VIN,
 *    CECO, Región, Rendimiento km/L, Costo por Litro y Domicilio).
 * 2. Seleccionar hasta 6 días de rutas (incluyendo la ruta activa en pantalla y/o rutas guardadas en
 *    el Historial) para consolidar la bitácora semanal de Anticipo o Comprobación.
 * 3. Detectar automáticamente puntos temporales, hoteles o aperturas (`APERTURA ...`, `HOTEL ...`) y
 *    generar su enlace de Google Maps para la tabla lateral `SUCURSALES NUEVAS/PUNTOS`.
 * 4. Descargar el archivo `.xlsx` nativo con logotipo de Tiendas Neto, fórmulas activas de Excel y
 *    los 3 recuadros vacíos para fotografías (Odómetro, Rendimiento y Ticket).
 */

import { useState, useEffect, useMemo } from 'react';
import {
  FileXls,
  UserGear,
  CalendarCheck,
  CheckCircle,
  FloppyDiskBack,
  Sparkle,
  Plus,
  Trash,
  GasPump,
  CarProfile,
} from '@phosphor-icons/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  TypographySmall,
  TypographyMuted,
  TypographyMono,
} from '@/components/ui/typography';
import { calcularSemanaISO, descargarBitacoraNetoExcel } from '@/lib/bitacora-excel';
import { cn, fechaMX, pesos, api } from '@/lib/utils';

/**
 * Construye los tramos `[origen, destino, km]` de un registro de ruta guardada o activa.
 */
function construirTramosDeRuta(item, porNombre, baseDefault) {
  const baseNombre = item.baseNombre || baseDefault || 'RESGUARDO TUXTLA';
  const baseTienda = porNombre.get(baseNombre);
  const pts = [];
  if (item.baseInicio !== false && baseTienda) {
    pts.push({ nombre: baseTienda.nombre, lat: baseTienda.lat, lng: baseTienda.lng });
  }
  (item.paradas || []).forEach((p) => pts.push(p));
  if (item.baseFin !== false && baseTienda && ((item.paradas || []).length > 0 || !item.baseInicio)) {
    pts.push({ nombre: baseTienda.nombre, lat: baseTienda.lat, lng: baseTienda.lng });
  }

  const tramosOut = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const tGuardado = item.tramos?.[i];
    let km = tGuardado?.km;
    if (km == null && pts[i].lat != null && pts[i + 1].lat != null) {
      // Estimación por si una ruta histórica antigua no guardó tramos individuales
      const R = 6371;
      const dLat = ((pts[i + 1].lat - pts[i].lat) * Math.PI) / 180;
      const dLng = ((pts[i + 1].lng - pts[i].lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((pts[i].lat * Math.PI) / 180) *
          Math.cos((pts[i + 1].lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      km = Math.max(1, Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.32));
    }
    tramosOut.push({
      origen: pts[i].nombre,
      destino: pts[i + 1].nombre,
      km: Math.round(Number(km) || 0),
    });
  }
  return tramosOut;
}

export function BitacoraGeneratorModal({
  open,
  onOpenChange,
  ingenieros,
  ingenieroActivo,
  onSelectIngeniero,
  onSaveIngeniero,
  rutaActual,
  tramosActuales,
  baseNombre,
  porNombre,
  historial,
  ajustes,
  toast,
}) {
  const perfilActual = useMemo(() => {
    return (
      ingenieros.find((i) => i.nombre === ingenieroActivo) ||
      ingenieros[0] || {
        nombre: 'HERWING EDUARDO VAZQUEZ MACIAS',
        puesto: 'INGENIERO DE SOPORTE TECNICO',
        no_empleado: '1221362',
        tarjeta_gasolina: '5064490100458236',
        automovil: 'AVEO',
        placas: 'PEB-798-C',
        serie: 'LZWPRMGN0TF108615',
        ceco: '108266',
        region: 'TUXTLA',
        rendimiento: ajustes.kmPorLitro || 12.5,
        costo_litro: ajustes.precioLitro || 23.99,
        base_nombre: baseNombre || 'RESGUARDO TUXTLA',
        domicilio_direccion: '',
        domicilio_link: '',
        km_inicial_ultimo: 17374,
      }
    );
  }, [ingenieros, ingenieroActivo, ajustes, baseNombre]);

  const [formIng, setFormIng] = useState(perfilActual);
  const [editandoPerfil, setEditandoPerfil] = useState(false);
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);

  const [semana, setSemana] = useState(() => calcularSemanaISO(rutaActual?.fecha));
  const [kmInicial, setKmInicial] = useState(perfilActual.km_inicial_ultimo || 17374);
  const [dispersion, setDispersion] = useState(0);
  const [complementos, setComplementos] = useState(0);
  const [tipoFormato, setTipoFormato] = useState('comprobacion'); // 'comprobacion' | 'anticipo'
  const [observaciones, setObservaciones] = useState(
    'SE REALIZA COMPROBACIÓN DE GASTOS DE COMBUSTIBLE CORRESPONDIENTE A LOS RECORRIDOS DE ATENCIÓN A SUCURSALES Y MANTENIMIENTO EN REGIÓN SURESTE.'
  );

  // Selección de días: incluye por defecto la ruta actual (si tiene paradas)
  const [incluirRutaActual, setIncluirRutaActual] = useState(true);
  const [idsHistorialSel, setIdsHistorialSel] = useState([]);
  const [puntosNuevosExtra, setPuntosNuevosExtra] = useState([]);
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    setFormIng(perfilActual);
    setKmInicial(perfilActual.km_inicial_ultimo || 17374);
  }, [perfilActual]);

  useEffect(() => {
    if (rutaActual?.fecha) {
      setSemana(calcularSemanaISO(rutaActual.fecha));
    }
  }, [rutaActual?.fecha]);

  const cambiarPlantillaObs = (tipo) => {
    setTipoFormato(tipo);
    if (tipo === 'anticipo') {
      setObservaciones(
        `SE SOLICITA ANTICIPO DE COMBUSTIBLE PARA LA SEMANA ${semana} CORRESPONDIENTE A LA PROGRAMACIÓN DE RUTAS DE SOPORTE TÉCNICO EN REGIÓN ${formIng.region || 'TUXTLA'}.`
      );
    } else {
      setObservaciones(
        `SE REALIZA COMPROBACIÓN DE GASTOS DE COMBUSTIBLE DE LA SEMANA ${semana} CORRESPONDIENTE A LOS RECORRIDOS DE ATENCIÓN A SUCURSALES EN REGIÓN ${formIng.region || 'TUXTLA'}.`
      );
    }
  };

  // Construir los bloques diarios seleccionados (máximo 6 días ordenados por fecha ascendente)
  const diasConsolidados = useMemo(() => {
    const lista = [];

    if (incluirRutaActual && rutaActual?.paradas?.length > 0) {
      const tramosAct = construirTramosDeRuta(
        {
          ...rutaActual,
          baseNombre,
          tramos: tramosActuales,
        },
        porNombre,
        baseNombre
      );
      lista.push({
        id: 'actual',
        fecha: rutaActual.fecha,
        nombre: rutaActual.nombre || 'Ruta activa',
        paradas: rutaActual.paradas,
        tramos: tramosAct,
      });
    }

    for (const id of idsHistorialSel) {
      const h = historial.find((x) => x.id === id);
      if (!h) continue;
      // Evitar duplicar la misma ruta si la ruta actual ya está guardada con el mismo id
      if (incluirRutaActual && rutaActual?.id && rutaActual.id === h.id) continue;
      const tramosH = construirTramosDeRuta(h, porNombre, baseNombre);
      lista.push({
        id: h.id,
        fecha: h.fecha,
        nombre: h.nombre || 'Ruta guardada',
        paradas: h.paradas || [],
        tramos: tramosH,
      });
    }

    return lista.sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 6);
  }, [incluirRutaActual, rutaActual, tramosActuales, idsHistorialSel, historial, porNombre, baseNombre]);

  // Detectar automáticamente aperturas, hoteles o desvíos temporales en los días seleccionados
  const puntosNuevosDetectados = useMemo(() => {
    const mapa = new Map();
    diasConsolidados.forEach((d) => {
      (d.paradas || []).forEach((p) => {
        const nom = (p.nombre || '').toUpperCase();
        const esEspecial =
          p.temporal ||
          nom.includes('APERTURA') ||
          nom.includes('HOTEL') ||
          nom.includes('NUEVA');
        if (esEspecial && !mapa.has(nom)) {
          const link =
            p.link ||
            (p.lat != null && p.lng != null
              ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`
              : '');
          mapa.set(nom, { nombre: nom, link });
        }
      });
    });
    puntosNuevosExtra.forEach((p) => {
      if (p.nombre.trim()) {
        mapa.set(p.nombre.trim().toUpperCase(), {
          nombre: p.nombre.trim().toUpperCase(),
          link: p.link.trim(),
        });
      }
    });
    return Array.from(mapa.values()).slice(0, 9);
  }, [diasConsolidados, puntosNuevosExtra]);

  const resumenTotales = useMemo(() => {
    const km = diasConsolidados.reduce(
      (acc, d) => acc + d.tramos.reduce((s, t) => s + (t.km || 0), 0),
      0
    );
    const rend = Number(formIng.rendimiento) || 12.5;
    const precio = Number(formIng.costo_litro) || 23.99;
    const litros = km / rend;
    const importe = litros * precio;
    return { km, litros, importe, kmFinal: (Number(kmInicial) || 0) + km };
  }, [diasConsolidados, formIng.rendimiento, formIng.costo_litro, kmInicial]);

  const guardarPerfil = async () => {
    setGuardandoPerfil(true);
    try {
      const listaActualizada = await api('PATCH', '/api/ingenieros', {
        ...formIng,
        km_inicial_ultimo: Number(kmInicial) || 0,
      });
      onSaveIngeniero(listaActualizada, formIng);
      setEditandoPerfil(false);
      toast('Perfil de ingeniero guardado y sincronizado con Supabase');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setGuardandoPerfil(false);
    }
  };

  const handleDescargarExcel = async () => {
    if (diasConsolidados.length === 0) {
      return toast('Agrega al menos una parada a tu ruta o selecciona un día del historial para generar la bitácora', 'err');
    }
    setDescargando(true);
    try {
      // Guardar último km inicial en el perfil del ingeniero
      await api('PATCH', '/api/ingenieros', {
        ...formIng,
        km_inicial_ultimo: Number(kmInicial) || 0,
      })
        .then((lista) => onSaveIngeniero(lista, formIng))
        .catch(() => {});

      const archivo = await descargarBitacoraNetoExcel({
        ingeniero: formIng,
        semana,
        kmInicial,
        rendimiento: formIng.rendimiento,
        costoLitro: formIng.costo_litro,
        dispersion,
        complementos,
        observaciones,
        dias: diasConsolidados,
        puntosNuevos: puntosNuevosDetectados,
      });
      toast(`Bitácora descargada: ${archivo}`);
    } catch (e) {
      toast('Error generando Excel: ' + e.message, 'err');
    } finally {
      setDescargando(false);
    }
  };

  const toggleHistorialId = (id) => {
    setIdsHistorialSel((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <div className="flex items-center gap-2.5">
              <img
                src="/logo-neto.png"
                alt="Tiendas Neto"
                className="h-8 w-auto rounded bg-white px-1.5 py-0.5 border border-border shadow-2xs"
              />
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <span>Bitácora Oficial de Combustible (.xlsx)</span>
                  <Badge variant="secondary" className="text-[10px]">
                    Semana {semana}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  Genera el formato oficial de Tiendas Neto con fórmulas automáticas, datos de vehículo y recuadros para fotos.
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* ================= 1. SELECTOR DE INGENIERO Y DATOS DE CABECERA ================= */}
          <Card className="p-3 bg-muted/20 border-border/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-60">
                <UserGear weight="duotone" className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1">
                  <Label className="text-[11px] text-muted-foreground">Ingeniero responsable</Label>
                  <Select
                    value={ingenieroActivo}
                    onValueChange={(val) => {
                      onSelectIngeniero(val);
                    }}
                  >
                    <SelectTrigger size="sm" className="mt-0.5 bg-card font-semibold">
                      <SelectValue placeholder="Selecciona tu nombre" />
                    </SelectTrigger>
                    <SelectContent>
                      {ingenieros.map((ing) => (
                        <SelectItem key={ing.nombre} value={ing.nombre}>
                          {ing.nombre} ({ing.region || 'SURESTE'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                type="button"
                variant={editandoPerfil ? 'secondary' : 'outline'}
                size="xs"
                onClick={() => setEditandoPerfil((v) => !v)}
              >
                <CarProfile weight="duotone" />
                {editandoPerfil ? 'Ocultar ficha vehicular' : 'Editar datos de auto / tarjeta'}
              </Button>
            </div>

            {/* Resumen compacto del perfil */}
            {!editandoPerfil && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                <div className="rounded-md bg-card px-2.5 py-1.5 border border-border/60">
                  <span className="text-[10px] text-muted-foreground block">No. Empleado / CECO</span>
                  <TypographyMono className="font-semibold text-xs">
                    {formIng.no_empleado || 'Sin asignar'} · {formIng.ceco || '108266'}
                  </TypographyMono>
                </div>
                <div className="rounded-md bg-card px-2.5 py-1.5 border border-border/60">
                  <span className="text-[10px] text-muted-foreground block">Vehículo / Placas</span>
                  <TypographyMono className="font-semibold text-xs">
                    {formIng.automovil || '—'} · {formIng.placas || '—'}
                  </TypographyMono>
                </div>
                <div className="rounded-md bg-card px-2.5 py-1.5 border border-border/60">
                  <span className="text-[10px] text-muted-foreground block">Tarjeta Gasolina</span>
                  <TypographyMono className="font-semibold text-xs truncate block">
                    {formIng.tarjeta_gasolina || '—'}
                  </TypographyMono>
                </div>
                <div className="rounded-md bg-card px-2.5 py-1.5 border border-border/60">
                  <span className="text-[10px] text-muted-foreground block">Rendimiento / Litro</span>
                  <TypographyMono className="font-semibold text-xs">
                    {formIng.rendimiento} km/L · ${formIng.costo_litro}
                  </TypographyMono>
                </div>
              </div>
            )}

            {/* Formulario expandible de perfil del ingeniero */}
            {editandoPerfil && (
              <div className="space-y-2.5 pt-2 border-t border-border/60">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[11px]">No. Empleado</Label>
                    <Input
                      size="sm"
                      value={formIng.no_empleado}
                      onChange={(e) => setFormIng((f) => ({ ...f, no_empleado: e.target.value }))}
                      placeholder="Ej. 1221362"
                      className="bg-card font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">No. Tarjeta de Gasolina</Label>
                    <Input
                      size="sm"
                      value={formIng.tarjeta_gasolina}
                      onChange={(e) =>
                        setFormIng((f) => ({ ...f, tarjeta_gasolina: e.target.value }))
                      }
                      placeholder="16 dígitos"
                      className="bg-card font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">CECO</Label>
                    <Input
                      size="sm"
                      value={formIng.ceco}
                      onChange={(e) => setFormIng((f) => ({ ...f, ceco: e.target.value }))}
                      placeholder="108266"
                      className="bg-card font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <div>
                    <Label className="text-[11px]">Automóvil</Label>
                    <Input
                      size="sm"
                      value={formIng.automovil}
                      onChange={(e) => setFormIng((f) => ({ ...f, automovil: e.target.value }))}
                      placeholder="Ej. AVEO"
                      className="bg-card"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Placas</Label>
                    <Input
                      size="sm"
                      value={formIng.placas}
                      onChange={(e) => setFormIng((f) => ({ ...f, placas: e.target.value }))}
                      placeholder="Ej. PEB-798-C"
                      className="bg-card font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-[11px]">No. Serie Vehicular (VIN)</Label>
                    <Input
                      size="sm"
                      value={formIng.serie}
                      onChange={(e) => setFormIng((f) => ({ ...f, serie: e.target.value }))}
                      placeholder="Ej. LZWPRMGN0TF108615"
                      className="bg-card font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[11px]">Región</Label>
                    <Input
                      size="sm"
                      value={formIng.region}
                      onChange={(e) => setFormIng((f) => ({ ...f, region: e.target.value }))}
                      placeholder="TUXTLA"
                      className="bg-card"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Rendimiento (km/L)</Label>
                    <Input
                      size="sm"
                      type="number"
                      step="0.1"
                      value={formIng.rendimiento}
                      onChange={(e) =>
                        setFormIng((f) => ({ ...f, rendimiento: parseFloat(e.target.value) || 12.5 }))
                      }
                      className="bg-card font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Costo por litro ($ MXN)</Label>
                    <Input
                      size="sm"
                      type="number"
                      step="0.01"
                      value={formIng.costo_litro}
                      onChange={(e) =>
                        setFormIng((f) => ({
                          ...f,
                          costo_litro: parseFloat(e.target.value) || 23.99,
                        }))
                      }
                      className="bg-card font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px]">Dirección de Domicilio / Resguardo</Label>
                    <Input
                      size="sm"
                      value={formIng.domicilio_direccion}
                      onChange={(e) =>
                        setFormIng((f) => ({ ...f, domicilio_direccion: e.target.value }))
                      }
                      placeholder="Dirección de resguardo (opcional)"
                      className="bg-card"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Link Google Maps de Domicilio</Label>
                    <Input
                      size="sm"
                      value={formIng.domicilio_link}
                      onChange={(e) =>
                        setFormIng((f) => ({ ...f, domicilio_link: e.target.value }))
                      }
                      placeholder="https://maps.app.goo.gl/..."
                      className="bg-card font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button size="xs" onClick={guardarPerfil} disabled={guardandoPerfil}>
                    <FloppyDiskBack weight="duotone" />
                    {guardandoPerfil ? 'Guardando…' : 'Guardar perfil en Supabase'}
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* ================= 2. PARÁMETROS DE SEMANA Y ODÓMETRO ================= */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="space-y-1">
              <Label className="text-xs">Semana del año</Label>
              <Input
                size="sm"
                type="number"
                min="1"
                max="53"
                value={semana}
                onChange={(e) => setSemana(Number(e.target.value) || 1)}
                className="font-mono font-semibold"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kilómetro Inicial</Label>
              <Input
                size="sm"
                type="number"
                value={kmInicial}
                onChange={(e) => setKmInicial(Number(e.target.value) || 0)}
                className="font-mono font-semibold"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kilómetro Final (Auto)</Label>
              <Input
                size="sm"
                value={resumenTotales.kmFinal.toLocaleString('es-MX')}
                readOnly
                className="font-mono bg-muted/50"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dispersión previa ($)</Label>
              <Input
                size="sm"
                type="number"
                step="0.01"
                value={dispersion || ''}
                onChange={(e) => setDispersion(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="font-mono"
              />
            </div>
          </div>

          {/* ================= 3. SELECCIÓN DE DÍAS A INCLUIR (MÁX 6 BLOQUES) ================= */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1.5">
                <CalendarCheck weight="duotone" className="h-4 w-4 text-primary" />
                <span>Días incluidos en la bitácora ({diasConsolidados.length} de 6 bloques)</span>
              </Label>
              <TypographyMuted className="text-[11px]">
                Cada día ocupa un bloque de 8 filas en el Excel oficial
              </TypographyMuted>
            </div>

            <Card className="divide-y divide-border max-h-48 overflow-y-auto">
              {/* Ruta actual en el armador */}
              {rutaActual?.paradas?.length > 0 && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-primary/5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Switch
                      checked={incluirRutaActual}
                      onCheckedChange={setIncluirRutaActual}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="default" className="text-[10px] px-1.5 py-0">
                          Ruta activa
                        </Badge>
                        <TypographySmall className="font-semibold">
                          {fechaMX(rutaActual.fecha)}
                        </TypographySmall>
                        {rutaActual.nombre && (
                          <span className="text-xs text-muted-foreground">
                            · {rutaActual.nombre}
                          </span>
                        )}
                      </div>
                      <TypographyMuted className="text-[11px] truncate block">
                        {rutaActual.paradas.map((p) => p.nombre).join(' → ')}
                      </TypographyMuted>
                    </div>
                  </div>
                </div>
              )}

              {/* Rutas del Historial */}
              {historial.length === 0 && !rutaActual?.paradas?.length ? (
                <div className="p-4 text-center">
                  <TypographyMuted className="text-xs">
                    No hay rutas activas ni guardadas en el historial.
                  </TypographyMuted>
                </div>
              ) : (
                historial.map((h) => {
                  const esMismaActual = incluirRutaActual && rutaActual?.id === h.id;
                  const checked = esMismaActual || idsHistorialSel.includes(h.id);
                  return (
                    <div
                      key={h.id}
                      onClick={() => !esMismaActual && toggleHistorialId(h.id)}
                      className={cn(
                        'flex items-center justify-between gap-2 px-3 py-2 text-xs cursor-pointer transition-colors hover:bg-accent/50',
                        checked && 'bg-accent/30'
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Switch
                          checked={checked}
                          disabled={esMismaActual}
                          onCheckedChange={() => !esMismaActual && toggleHistorialId(h.id)}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <TypographySmall className="font-medium">
                              {fechaMX(h.fecha)}
                            </TypographySmall>
                            {h.nombre && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {h.nombre}
                              </Badge>
                            )}
                          </div>
                          <TypographyMuted className="text-[11px] truncate block">
                            {(h.paradas || []).map((p) => p.nombre).join(' → ')}
                          </TypographyMuted>
                        </div>
                      </div>
                      <TypographyMono className="text-[11px] text-muted-foreground shrink-0">
                        {h.totalKm} km
                      </TypographyMono>
                    </div>
                  );
                })
              )}
            </Card>
          </div>

          {/* ================= 4. SUCURSALES NUEVAS / PUNTOS (TABLA DERECHA I6:J16) ================= */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">
                Sucursales nuevas / aperturas / hoteles ({puntosNuevosDetectados.length})
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() =>
                  setPuntosNuevosExtra((prev) => [...prev, { nombre: '', link: '' }])
                }
              >
                <Plus weight="bold" />
                Agregar punto con link
              </Button>
            </div>

            {puntosNuevosDetectados.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {puntosNuevosDetectados.map((p, idx) => (
                  <Badge key={idx} variant="secondary" className="gap-1.5 text-[11px]">
                    <span>{p.nombre}</span>
                    {p.link && <span className="text-[10px] text-primary">✓ Link Maps</span>}
                  </Badge>
                ))}
              </div>
            )}

            {puntosNuevosExtra.map((item, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <Input
                  size="sm"
                  value={item.nombre}
                  onChange={(e) =>
                    setPuntosNuevosExtra((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, nombre: e.target.value } : x))
                    )
                  }
                  placeholder="Ej. APERTURA VILLAFLORES"
                  className="w-48"
                />
                <Input
                  size="sm"
                  value={item.link}
                  onChange={(e) =>
                    setPuntosNuevosExtra((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, link: e.target.value } : x))
                    )
                  }
                  placeholder="https://maps.app.goo.gl/..."
                  className="flex-1 font-mono"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() =>
                    setPuntosNuevosExtra((prev) => prev.filter((_, i) => i !== idx))
                  }
                >
                  <Trash />
                </Button>
              </div>
            ))}
          </div>

          {/* ================= 5. OBSERVACIONES (* DATO OBLIGATORIO) ================= */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">
                Observaciones <span className="text-destructive font-semibold">* DATO OBLIGATORIO</span>
              </Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant={tipoFormato === 'comprobacion' ? 'secondary' : 'ghost'}
                  size="xs"
                  onClick={() => cambiarPlantillaObs('comprobacion')}
                >
                  <Sparkle weight="duotone" />
                  Plantilla Comprobación
                </Button>
                <Button
                  type="button"
                  variant={tipoFormato === 'anticipo' ? 'secondary' : 'ghost'}
                  size="xs"
                  onClick={() => cambiarPlantillaObs('anticipo')}
                >
                  <Sparkle weight="duotone" />
                  Plantilla Anticipo
                </Button>
              </div>
            </div>
            <Textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Escribe el motivo de la comprobación o solicitud de anticipo..."
              className="text-xs"
            />
          </div>

          {/* ================= 6. RESUMEN DE TOTALES PRE-DESCARGA ================= */}
          <Card className="p-3 bg-primary/5 border-primary/25 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <GasPump weight="duotone" className="h-5 w-5" />
              </div>
              <div>
                <TypographySmall className="font-semibold block">
                  Total a comprobar: {resumenTotales.km} km · {resumenTotales.litros.toFixed(1)} L
                </TypographySmall>
                <TypographyMuted className="text-xs">
                  Importe estimado: <strong className="text-foreground">{pesos(resumenTotales.importe)}</strong> · Odómetro: {Number(kmInicial).toLocaleString()} → {resumenTotales.kmFinal.toLocaleString()} km
                </TypographyMuted>
              </div>
            </div>
            <Badge variant="outline" className="text-[11px]">
              3 recuadros de fotos listos
            </Badge>
          </Card>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button
            size="lg"
            onClick={handleDescargarExcel}
            disabled={descargando || diasConsolidados.length === 0}
          >
            <FileXls weight="duotone" className="h-4 w-4" />
            <span>
              {descargando
                ? 'Generando archivo Excel…'
                : `Descargar Bitácora Neto (.xlsx)`}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

