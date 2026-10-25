/**
 * @fileoverview Modal para Agregar Nueva Tienda, CEDIS o Cross Dock con Sincronización Inmediata a Supabase (`NewStoreModal.jsx`).
 *
 * Características:
 * - Disponible para todos los ingenieros autenticados.
 * - Soporta selección de tipo: Tienda / Sucursal, CEDIS, Cross Dock o Base / Resguardo.
 * - Sube la nueva ubicación al schema `rutas_sureste.tiendas` en Supabase y al catálogo local.
 * - Soporta extracción inteligente de coordenadas desde link de Google Maps o par lat,lng.
 * - Asigna automáticamente ECO, CECO, Estado, Región, Empresa, Zona e Ingeniero responsable.
 */

import { useState } from 'react';
import {
  Storefront,
  Warehouse,
  ClipboardText,
  PlusCircle,
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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ESTADOS, INGENIEROS } from '@/lib/brand';
import { coordsLocales, fmtCoords, api, cn } from '@/lib/utils';

export function NewStoreModal({ open, onOpenChange, onStoreCreated, toast }) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('tienda'); // 'tienda' | 'cedis' | 'crossdock' | 'resguardo'
  const [eco, setEco] = useState('');
  const [ceco, setCeco] = useState('');
  const [estado, setEstado] = useState('Chiapas');
  const [zona, setZona] = useState('');
  const [ingeniero, setIngeniero] = useState('HERWING EDUARDO VAZQUEZ MACIAS');
  const [coordText, setCoordText] = useState('');
  const [latLng, setLatLng] = useState(null);
  const [guardando, setGuardando] = useState(false);

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
    if (!latLng && !coordText.trim()) {
      return toast?.('Pega las coordenadas o enlace de Google Maps', 'err');
    }

    setGuardando(true);
    try {
      let finalCoords = latLng;
      if (!finalCoords) {
        finalCoords =
          coordsLocales(coordText) ||
          (await api('POST', '/api/coords', { texto: coordText }));
      }

      const payload = {
        nombre: cleanNombre,
        eco: eco.trim() || '0',
        ceco: ceco.trim() || '0',
        estado,
        region: 'SURESTE',
        empresa: 'SURESTE',
        zona: zona.trim().toUpperCase(),
        ingeniero: ingeniero.trim().toUpperCase(),
        lat: finalCoords.lat,
        lng: finalCoords.lng,
        verificada: true,
      };

      const nuevaLista = await api('POST', '/api/tiendas', payload);
      toast?.(`"${cleanNombre}" registrada y sincronizada en el catálogo`);
      onStoreCreated?.(nuevaLista, payload);
      onOpenChange(false);

      // Limpiar formulario
      setNombre('');
      setTipo('tienda');
      setEco('');
      setCeco('');
      setZona('');
      setCoordText('');
      setLatLng(null);
    } catch (err) {
      toast?.('Error al crear tienda: ' + err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Storefront weight="duotone" className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base">Registrar Tienda, CEDIS o Cross Dock</DialogTitle>
              <DialogDescription className="text-xs">
                Se guardará en el catálogo central y se sincronizará de inmediato para todo el equipo.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleGuardar} className="space-y-3.5 py-1">
          {/* Tipo de Instalación */}
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
            <Label className="text-xs">Nombre de la Sucursal o Centro</Label>
            <Input
              size="sm"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. CEDIS NETO TUXTLA o TUXTLA PATRIA NUEVA"
              className="font-semibold uppercase"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1.5">
              <Label className="text-xs">ECO (Número económico)</Label>
              <Input
                size="sm"
                value={eco}
                onChange={(e) => setEco(e.target.value)}
                placeholder="Ej. 1420 o NET0016"
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
              <Label className="text-xs">Zona / Corredor</Label>
              <Input
                size="sm"
                value={zona}
                onChange={(e) => setZona(e.target.value)}
                placeholder="Ej. TUXTLA CENTRO"
                className="uppercase text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Ingeniero Asignado (Opcional)</Label>
            <Select value={ingeniero} onValueChange={setIngeniero}>
              <SelectTrigger size="sm" className="bg-card text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INGENIEROS.map((ing) => (
                  <SelectItem key={ing} value={ing}>
                    {ing}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Coordenadas o Enlace de Google Maps</Label>
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
                placeholder="Pega link de Maps o 16.75231, -93.11623..."
                className="font-mono text-xs flex-1"
                required
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
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              <PlusCircle weight="duotone" />
              <span>{guardando ? 'Guardando en el catálogo…' : 'Crear y Publicar'}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
