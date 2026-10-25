/**
 * @fileoverview Modal para Editar Tienda, CEDIS o Cross Dock con Sincronización Inmediata a Supabase (`EditStoreModal.jsx`).
 *
 * Permite a ingenieros y administradores:
 * - Modificar el nombre completo o tipo (Sucursal, CEDIS, Cross Dock, Resguardo).
 * - Actualizar ECO, CECO, Zona, Estado, Región e Ingeniero Asignado.
 * - Actualizar coordenadas GPS pegando enlace de Google Maps o lat,lng.
 * - Sincronizar en tiempo real con Supabase (`rutas_sureste.tiendas`) y el catálogo local.
 */

import { useState, useEffect } from 'react';
import {
  PencilSimple,
  Storefront,
  Warehouse,
  ClipboardText,
  CheckCircle,
  Trash,
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
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ESTADOS, INGENIEROS } from '@/lib/brand';
import { coordsLocales, fmtCoords, api, cn } from '@/lib/utils';

export function EditStoreModal({
  open,
  onOpenChange,
  tienda,
  onStoreUpdated,
  onStoreDeleted,
  isAdmin = false,
  toast,
}) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('tienda'); // 'tienda' | 'cedis' | 'crossdock' | 'resguardo'
  const [eco, setEco] = useState('');
  const [ceco, setCeco] = useState('');
  const [estado, setEstado] = useState('Chiapas');
  const [region, setRegion] = useState('CHIAPAS');
  const [zona, setZona] = useState('');
  const [ingeniero, setIngeniero] = useState('');
  const [coordText, setCoordText] = useState('');
  const [latLng, setLatLng] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!tienda) return;
    const n = tienda.nombre || '';
    setNombre(n);
    if (n.toUpperCase().includes('CEDIS') || n.toUpperCase().includes('ALMACEN')) {
      setTipo('cedis');
    } else if (n.toUpperCase().includes('CROSS') || n.toUpperCase().includes('DOCK')) {
      setTipo('crossdock');
    } else if (n.toUpperCase().includes('RESGUARDO')) {
      setTipo('resguardo');
    } else {
      setTipo('tienda');
    }

    setEco(tienda.eco || '');
    setCeco(tienda.ceco || '');
    setEstado(tienda.estado || 'Chiapas');
    setRegion(tienda.region || 'CHIAPAS');
    setZona(tienda.zona || '');
    setIngeniero(tienda.ingeniero || INGENIEROS[0]);
    if (tienda.lat != null && tienda.lng != null) {
      setLatLng({ lat: tienda.lat, lng: tienda.lng });
      setCoordText(fmtCoords(tienda.lat, tienda.lng));
    } else {
      setLatLng(null);
      setCoordText('');
    }
  }, [tienda, open]);

  const handleTipoChange = (nuevoTipo) => {
    setTipo(nuevoTipo);
    let limpio = nombre
      .replace(/^CEDIS\s*(NETO)?\s*/i, '')
      .replace(/^CROSS\s*DOCK\s*/i, '')
      .replace(/^RESGUARDO\s*/i, '')
      .trim();

    if (nuevoTipo === 'cedis') {
      setNombre(`CEDIS NETO ${limpio}`.trim());
    } else if (nuevoTipo === 'crossdock') {
      setNombre(`CROSS DOCK ${limpio}`.trim());
    } else if (nuevoTipo === 'resguardo') {
      setNombre(`RESGUARDO ${limpio}`.trim());
    } else {
      setNombre(limpio);
    }
  };

  const procesarCoords = async (txt) => {
    const raw = String(txt || '').trim();
    if (!raw) return;
    try {
      const c = coordsLocales(raw) || (await api('POST', '/api/coords', { texto: raw }));
      setLatLng(c);
      setCoordText(fmtCoords(c.lat, c.lng));
      toast?.('Coordenadas detectadas correctamente');
    } catch (e) {
      toast?.('No se pudieron extraer las coordenadas: ' + e.message, 'err');
    }
  };

  const handleGuardar = async (e) => {
    e?.preventDefault();
    const cleanNombre = nombre.trim().toUpperCase();
    if (!cleanNombre) {
      return toast?.('Escribe el nombre de la sucursal o centro', 'err');
    }

    setGuardando(true);
    try {
      let finalCoords = latLng;
      if (coordText.trim() && (!finalCoords || coordText !== fmtCoords(finalCoords.lat, finalCoords.lng))) {
        finalCoords =
          coordsLocales(coordText) ||
          (await api('POST', '/api/coords', { texto: coordText }));
      }

      const payload = {
        nombreOriginal: tienda.nombre,
        nombre: cleanNombre,
        eco: eco.trim() || '0',
        ceco: ceco.trim() || '0',
        estado,
        region: region.trim().toUpperCase(),
        zona: zona.trim().toUpperCase(),
        ingeniero: ingeniero.trim().toUpperCase(),
        verificada: true,
      };

      if (finalCoords?.lat != null) {
        payload.lat = finalCoords.lat;
        payload.lng = finalCoords.lng;
      }

      const nuevaLista = await api('PATCH', '/api/tiendas', payload);
      toast?.(`"${cleanNombre}" actualizada correctamente`);
      onStoreUpdated?.(nuevaLista, payload);
      onOpenChange(false);
    } catch (err) {
      toast?.('Error al guardar cambios: ' + err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  if (!tienda) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PencilSimple weight="duotone" className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base">Editar Tienda o Hub Logístico</DialogTitle>
              <DialogDescription className="text-xs">
                Modifica los datos, tipo o coordenadas. Los cambios se sincronizan en vivo con Supabase.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleGuardar} className="space-y-3.5 py-1">
          {/* Selector de Tipo */}
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de Instalación</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <Button
                type="button"
                variant={tipo === 'tienda' ? 'default' : 'outline'}
                size="xs"
                className="justify-center gap-1 text-[11px]"
                onClick={() => handleTipoChange('tienda')}
              >
                <Storefront weight="duotone" />
                Tienda
              </Button>
              <Button
                type="button"
                variant={tipo === 'cedis' ? 'default' : 'outline'}
                size="xs"
                className={cn(
                  'justify-center gap-1 text-[11px]',
                  tipo === 'cedis' && 'bg-orange-600 hover:bg-orange-700 text-white'
                )}
                onClick={() => handleTipoChange('cedis')}
              >
                <Warehouse weight="duotone" />
                CEDIS
              </Button>
              <Button
                type="button"
                variant={tipo === 'crossdock' ? 'default' : 'outline'}
                size="xs"
                className={cn(
                  'justify-center gap-1 text-[11px]',
                  tipo === 'crossdock' && 'bg-purple-600 hover:bg-purple-700 text-white'
                )}
                onClick={() => handleTipoChange('crossdock')}
              >
                <Warehouse weight="duotone" />
                Cross Dock
              </Button>
              <Button
                type="button"
                variant={tipo === 'resguardo' ? 'default' : 'outline'}
                size="xs"
                className={cn(
                  'justify-center gap-1 text-[11px]',
                  tipo === 'resguardo' && 'bg-amber-600 hover:bg-amber-700 text-white'
                )}
                onClick={() => handleTipoChange('resguardo')}
              >
                <Warehouse weight="duotone" />
                Base
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Nombre Completo</Label>
            <Input
              size="sm"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="font-semibold uppercase"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1.5">
              <Label className="text-xs">ECO</Label>
              <Input
                size="sm"
                value={eco}
                onChange={(e) => setEco(e.target.value)}
                placeholder="Ej. NET0011"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CECO</Label>
              <Input
                size="sm"
                value={ceco}
                onChange={(e) => setCeco(e.target.value)}
                placeholder="Ej. 108266"
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1.5">
              <Label className="text-xs">Estado</Label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger size="sm" className="bg-card text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS.map((est) => (
                    <SelectItem key={est} value={est}>
                      {est}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Región Operativa</Label>
              <Input
                size="sm"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Ej. COATZA OLMECA"
                className="uppercase text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1.5">
              <Label className="text-xs">Zona / Corredor</Label>
              <Input
                size="sm"
                value={zona}
                onChange={(e) => setZona(e.target.value)}
                placeholder="Ej. TUXTLA CENTRO"
                className="uppercase text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Ingeniero Asignado</Label>
              <Select value={ingeniero} onValueChange={setIngeniero}>
                <SelectTrigger size="sm" className="bg-card text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INGENIEROS.map((ing) => (
                    <SelectItem key={ing} value={ing}>
                      {ing.split(' ')[0]} {ing.split(' ')[1] || ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Coordenadas GPS (Lat, Lng o Enlace)</Label>
            <div className="flex items-center gap-1.5">
              <Input
                size="sm"
                value={coordText}
                onChange={(e) => setCoordText(e.target.value)}
                onBlur={() => procesarCoords(coordText)}
                onPaste={(e) => {
                  const txt = e.clipboardData.getData('text');
                  procesarCoords(txt);
                }}
                placeholder="16.75231, -93.11623 o link Maps"
                className="font-mono text-xs flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    const txt = await navigator.clipboard.readText();
                    procesarCoords(txt);
                  } catch {
                    procesarCoords(coordText);
                  }
                }}
              >
                <ClipboardText weight="duotone" />
                Pegar
              </Button>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            {isAdmin && onStoreDeleted && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mr-auto text-destructive hover:bg-destructive/10"
                onClick={() => {
                  onOpenChange(false);
                  onStoreDeleted(tienda);
                }}
              >
                <Trash weight="duotone" className="h-4 w-4" />
                <span>Eliminar</span>
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              <CheckCircle weight="duotone" />
              <span>{guardando ? 'Guardando…' : 'Guardar Cambios'}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

